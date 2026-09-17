# Alibaba Cloud real-time calling — setup runbook

This is the operational runbook for running GaGa Chat's audio/video calling on
Alibaba Cloud. It covers what the calling stack is, exactly how to stand it up
on an ECS instance, how to verify it, and how to operate it.

The calling stack is **self-hosted WebRTC**. There is no ZEGO, no Agora, and no
commercial RTC SDK. Media flows peer-to-peer when the network allows it and
through your own coturn relay when it does not. Alibaba Cloud provides the
compute (ECS), the network (public IP, security group, bandwidth) and the DNS.
Everything else is open-source software you control.

---

## 1. Architecture

```
┌──────────────┐        HTTPS  /healthz, /ice        ┌───────────────────────┐
│  Browser A   │ ───────────────────────────────────▶ │  Caddy (443, TLS)     │
│  (caller)    │ ◀─────────────────────────────────── │  reverse_proxy        │
└──────┬───────┘        WSS    /signal                │        ↓              │
       │                                              │  127.0.0.1:8080       │
       │                                              │  server.mjs           │
       │  ┌───────────────────────────────────────────┤  (signaling gateway)  │
       │  │  Supabase: auth + call_history + RLS      └───────────────────────┘
       │  │  (the gateway verifies membership here)
       │  ▼
       │  ┌───────────────────────────────────────────┐
       │  │  coturn (3478 udp/tcp, 5349 tcp)          │
       └──┤  HMAC-SHA1 time-limited credentials       │
          └───────────────────────────────────────────┘
       │
       │  WebRTC media: direct P2P, or relayed via coturn
       ▼
┌──────────────┐
│  Browser B   │
│  (callee)    │
└──────────────┘
```

**Three moving parts:**

| Part | Software | Port | Purpose |
|---|---|---|---|
| Signaling gateway | `server.mjs` (Node 22) | 8080 (localhost only) | Authenticates the caller, relays SDP/ICE, issues TURN credentials |
| TLS reverse proxy | Caddy | 443 | Terminates HTTPS/WSS, proxies to 8080, auto-renews certificates |
| TURN relay | coturn | 3478 udp/tcp, 5349 tcp, 49160–49259 udp | Relays media when direct P2P fails (symmetric NAT, restrictive firewalls) |

**Why a relay is mandatory.** Two browsers on mobile networks usually cannot
reach each other directly. Without a TURN server, calls fail for a large
fraction of real users even though they work on your office Wi-Fi. coturn is
that relay.

**Why the gateway is not a media server.** It only relays small JSON signaling
messages (SDP offers/answers and ICE candidates). Media never passes through
it. This keeps the gateway cheap to run and means a gateway restart does not
drop an established call's media — only new signaling.

---

## 2. Prerequisites

Before you start, confirm:

- **An Alibaba Cloud ECS instance** running Ubuntu 22.04/24.04 or Debian 12,
  with a **public IPv4 address**. A 1 vCPU / 1 GB instance is enough for the
  gateway; coturn's bandwidth is the real cost driver.
- **Root or sudo access** on the instance.
- **Two DNS A records** you can create, pointing at the ECS public IP:
  - `calls.gagachat.app` — the signaling endpoint
  - `turn.gagachat.app` — the TURN endpoint
- **Your Supabase project URL and public anon key.** These are already in the
  app's `.env.production`:
  - `VITE_SUPABASE_URL=https://fcjgbbmfqdkucfpqjxae.supabase.co`
  - `VITE_SUPABASE_ANON_KEY=sb_publishable__A7rrB7-EmNnt9b_GSDaNQ_SAhSrJmv`
- **The frontend origins** that will be allowed to connect, e.g.
  `https://gagachat.app,https://oumagachat.web.app`.

> **Do not** put the TURN shared secret in any `VITE_*` variable. Vite inlines
> those into the client bundle, which would publish the secret to every visitor
> and let anyone mint TURN credentials. The secret lives only in
> `/etc/gaga-calling.env` and `/etc/turnserver.conf`.

---

## 3. One-command provisioning

The `provision-ecs.sh` script in this directory performs the entire install. It
is idempotent — re-running it updates configuration and restarts services
without duplicating users, units or firewall rules.

### 3.1 Preview first

Always dry-run before touching a live host. `--dry-run` prints every command
and every file it would write, and changes nothing:

```bash
cd alibaba-calling
./provision-ecs.sh --dry-run \
  --domain calls.gagachat.app \
  --turn-domain turn.gagachat.app \
  --origins "https://gagachat.app,https://oumagachat.web.app" \
  --supabase-url "https://fcjgbbmfqdkucfpqjxae.supabase.co" \
  --supabase-anon-key "sb_publishable__A7rrB7-EmNnt9b_GSDaNQ_SAhSrJmv" \
  --email ops@gagachat.app
```

### 3.2 Apply

Copy the `alibaba-calling` directory to the instance, then run the same command
without `--dry-run`:

```bash
# From your workstation:
scp -r alibaba-calling root@<ECS_PUBLIC_IP>:/root/

# On the instance:
ssh root@<ECS_PUBLIC_IP>
cd /root/alibaba-calling
./provision-ecs.sh \
  --domain calls.gagachat.app \
  --turn-domain turn.gagachat.app \
  --origins "https://gagachat.app,https://oumagachat.web.app" \
  --supabase-url "https://fcjgbbmfqdkucfpqjxae.supabase.co" \
  --supabase-anon-key "sb_publishable__A7rrB7-EmNnt9b_GSDaNQ_SAhSrJmv" \
  --email ops@gagachat.app
```

### 3.3 What the script does

1. Detects the instance's private and public IP addresses.
2. Installs Node.js 22 (NodeSource), coturn and Caddy (official repositories).
3. Creates the unprivileged `gagacall` system user.
4. Installs the gateway into `/opt/gaga-calling` and runs `npm ci --omit=dev`.
5. Generates a 48-character TURN shared secret (or reuses the existing one).
6. Writes `/etc/gaga-calling.env` (mode `0640`, `root:gagacall`).
7. Writes `/etc/turnserver.conf` with real IPs, the shared secret and
   private-network deny rules; enables coturn in `/etc/default/coturn`.
8. Writes a Caddy site snippet to `/etc/caddy/conf.d/gaga-calling.caddy` and
   ensures `/etc/caddy/Caddyfile` imports that directory.
9. Installs `gaga-calling.service` with systemd hardening.
10. Opens ports 80, 443, 3478 (udp+tcp), 5349 and 49160–49259/udp in `ufw`.
11. Enables and restarts coturn, gaga-calling and caddy.
12. Verifies each service is active and that `/healthz` responds locally.

### 3.4 Flags

| Flag | Required | Meaning |
|---|---|---|
| `--domain` | yes | Signaling hostname (Caddy site address) |
| `--turn-domain` | yes | TURN hostname (used for `realm`, `server-name`, TLS paths) |
| `--origins` | yes | Comma-separated allowed browser origins |
| `--supabase-url` | yes | Supabase project URL |
| `--supabase-anon-key` | yes | Supabase public anon key |
| `--email` | yes* | Let's Encrypt contact address (*unless `--skip-tls`) |
| `--install-dir` | no | Default `/opt/gaga-calling` |
| `--dry-run` | no | Print actions, change nothing |
| `--skip-tls` | no | Serve plain HTTP on 80; use when TLS terminates elsewhere |

---

## 4. Manual provisioning (if you cannot run the script)

If your environment forbids running a provisioning script, do these steps by
hand. They are exactly what the script automates.

### 4.1 Install packages

```bash
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl ca-certificates gnupg debian-keyring \
  debian-archive-keyring apt-transport-https

# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# Caddy
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
  > /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy

# coturn
apt-get install -y coturn
```

### 4.2 Service user and code

```bash
useradd --system --no-create-home --shell /usr/sbin/nologin gagacall
install -d -m 0755 /opt/gaga-calling
install -m 0644 server.mjs package.json package-lock.json /opt/gaga-calling/
cd /opt/gaga-calling && npm ci --omit=dev
chown -R root:gagacall /opt/gaga-calling && chmod -R g+rX /opt/gaga-calling
```

### 4.3 Shared secret

```bash
TURN_SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '/+=' | head -c 48)"
echo "$TURN_SECRET"   # use this value in both files below
```

### 4.4 Gateway environment

```bash
install -m 0640 -o root -g gagacall /dev/stdin /etc/gaga-calling.env <<EOF
PORT=8080
ALLOWED_ORIGINS=https://gagachat.app,https://oumagachat.web.app
SUPABASE_URL=https://fcjgbbmfqdkucfpqjxae.supabase.co
SUPABASE_ANON_KEY=sb_publishable__A7rrB7-EmNnt9b_GSDaNQ_SAhSrJmv
TURN_SHARED_SECRET=$TURN_SECRET
TURN_URLS=turn:turn.gagachat.app:3478?transport=udp,turn:turn.gagachat.app:3478?transport=tcp,turns:turn.gagachat.app:5349?transport=tcp
EOF
```

### 4.5 coturn

Copy `turnserver.conf.example` to `/etc/turnserver.conf` and substitute:

- `PRIVATE_ECS_IP` → the instance's private IP (`ip -4 route get 1.1.1.1`)
- `PUBLIC_ECS_IP` → the instance's public IP
- `SAME_TURN_SHARED_SECRET_AS_CALLING_SERVER` → `$TURN_SECRET`

Then enable the service:

```bash
sed -i 's/^#\s*TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
grep -q '^TURNSERVER_ENABLED=1' /etc/default/coturn || echo 'TURNSERVER_ENABLED=1' >> /etc/default/coturn
systemctl enable --now coturn
```

### 4.6 Caddy

```bash
install -d -m 0755 /etc/caddy/conf.d
install -m 0644 /dev/stdin /etc/caddy/conf.d/gaga-calling.caddy <<'EOF'
calls.gagachat.app {
  encode zstd gzip
  reverse_proxy 127.0.0.1:8080 {
    header_up X-Real-IP {remote_host}
  }
}
EOF
grep -q 'conf.d/\*.caddy' /etc/caddy/Caddyfile || echo 'import /etc/caddy/conf.d/*.caddy' >> /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl enable --now caddy
```

### 4.7 systemd unit

```bash
install -m 0644 /dev/stdin /etc/systemd/system/gaga-calling.service <<'EOF'
[Unit]
Description=GaGa self-hosted calling gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=gagacall
Group=gagacall
WorkingDirectory=/opt/gaga-calling
EnvironmentFile=/etc/gaga-calling.env
ExecStart=/usr/bin/node /opt/gaga-calling/server.mjs
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now gaga-calling
```

### 4.8 Firewall

```bash
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3478/udp
ufw allow 3478/tcp
ufw allow 5349/tcp
ufw allow 49160:49259/udp
```

---

## 5. Alibaba Cloud security group

The host firewall is not enough — Alibaba Cloud filters traffic at the security
group before it reaches the instance. Add these **inbound** rules in the ECS
console (Network & Security → Security Groups → Configure Rules):

| Protocol | Port range | Source | Purpose |
|---|---|---|---|
| TCP | 80 | 0.0.0.0/0 | Let's Encrypt HTTP-01 challenge |
| TCP | 443 | 0.0.0.0/0 | HTTPS + WSS signaling |
| UDP | 3478 | 0.0.0.0/0 | TURN |
| TCP | 3478 | 0.0.0.0/0 | TURN over TCP (fallback for UDP-blocked networks) |
| TCP | 5349 | 0.0.0.0/0 | TURNS (TURN over TLS) |
| UDP | 49160–49259 | 0.0.0.0/0 | TURN relay allocations |

**Keep private:** port 8080 (the gateway binds to `127.0.0.1` and must never be
exposed), and any database ports.

The relay range 49160–49259 gives 100 concurrent allocations. Each 1:1 call
uses at most 2. Raise `min-port`/`max-port` in `/etc/turnserver.conf` only after
reviewing bandwidth capacity.

---

## 6. DNS

Create two A records pointing at the ECS public IP:

```
calls.gagachat.app   A   <ECS_PUBLIC_IP>
turn.gagachat.app    A   <ECS_PUBLIC_IP>
```

Caddy obtains a Let's Encrypt certificate for `calls.gagachat.app`
automatically once DNS resolves. For `turns:` (TURN over TLS on 5349) you need
a certificate for `turn.gagachat.app`; obtain it with certbot:

```bash
apt-get install -y certbot
systemctl stop caddy          # free port 80 for the HTTP-01 challenge
certbot certonly --standalone -d turn.gagachat.app --email ops@gagachat.app --agree-tos -n
systemctl start caddy
systemctl restart coturn
```

Then set up renewal so coturn picks up the new certificate:

```bash
install -m 0755 /dev/stdin /etc/letsencrypt/renewal-hooks/deploy/restart-coturn.sh <<'EOF'
#!/bin/sh
systemctl restart coturn
EOF
```

---

## 7. Frontend configuration

The client reads `VITE_CALLING_API_URL`. It is already set in
`.env.production`:

```
VITE_CALLING_API_URL=https://calls.gagachat.app
```

If you use a different domain, update `.env.production` and rebuild. The
hosting CSP in `firebase.json` must also allow the origin in `connect-src` —
it currently contains `https://calls.gagachat.app wss://calls.gagachat.app`.

Rebuild and deploy:

```bash
PATH=/opt/node22/bin:$PATH npm run build
PATH=/opt/node22/bin:$PATH npm run verify:release
```

---

## 8. Verification

### 8.1 On the instance

```bash
systemctl status gaga-calling coturn caddy
curl -s http://127.0.0.1:8080/healthz          # expect: ok
journalctl -u gaga-calling -n 50 --no-pager
```

### 8.2 From outside the VPC

Run the bundled verifier from your workstation:

```bash
cd alibaba-calling
./verify-remote.sh https://calls.gagachat.app turn.gagachat.app
```

It checks the TLS certificate, `/healthz`, that `/ice` rejects unauthenticated
requests, that `/signal` accepts a WebSocket upgrade, and that TURN answers a
STUN binding request.

### 8.3 Gateway self-test (no network needed)

```bash
cd alibaba-calling
npm test        # 3 unit/integration tests
npm run smoke   # 13 end-to-end checks against a real local gateway
```

### 8.4 Real-device checks (required)

These cannot be automated and must be done on real phones:

- [ ] Two devices on **different mobile networks** — voice call connects.
- [ ] Same two devices — video call connects, both directions of video visible.
- [ ] Force `iceTransportPolicy: 'relay'` in a temporary QA build and confirm
      the selected candidate pair is a relay candidate. **A passing local
      signaling test does not prove TURN works.** Remove the forced policy after.
- [ ] Deny microphone permission — the invitation is never accepted and the
      caller sees a clear error.
- [ ] Hang up while the camera is still starting — no peer connection opens
      later, and the camera indicator turns off.
- [ ] Incoming call rings, and rejecting it records a rejected call in history.
- [ ] Missed call (no answer for 45 s) is recorded as missed.
- [ ] Autoplay-blocked audio shows the "Tap to hear call audio" button.
- [ ] Interrupt Wi-Fi mid-call, restore it — the call recovers without a second
      microphone prompt.
- [ ] End the call during recovery — no socket, track or timer reopens.
- [ ] Keep a forced-relay call up for **over one hour** — media survives the
      45-minute credential renewal and ICE restart.
- [ ] End the call from the other side — signaling is rejected afterwards with
      no endless retries.
- [ ] Test from **Bangladesh and China** independently. Hosting location does
      not guarantee reachability.

---

## 9. Operations

### 9.1 Logs

```bash
journalctl -u gaga-calling -f          # gateway
journalctl -u coturn -f                # relay
journalctl -u caddy -f                 # proxy + certificate issuance
tail -f /var/log/caddy/calls.gagachat.app.log
```

### 9.2 Restart

```bash
systemctl restart gaga-calling         # signaling only; live media is unaffected
systemctl restart coturn               # drops relayed media for active calls
systemctl reload caddy                 # picks up config changes without downtime
```

### 9.3 Rotate the TURN shared secret

```bash
NEW="$(head -c 48 /dev/urandom | base64 | tr -d '/+=' | head -c 48)"
sed -i "s|^TURN_SHARED_SECRET=.*|TURN_SHARED_SECRET=$NEW|" /etc/gaga-calling.env
sed -i "s|^static-auth-secret=.*|static-auth-secret=$NEW|" /etc/turnserver.conf
systemctl restart gaga-calling coturn
```

Existing calls keep working until their credentials expire (up to one hour);
new calls use the new secret immediately.

### 9.4 Update the gateway code

```bash
cd /opt/gaga-calling
install -m 0644 /path/to/new/server.mjs ./server.mjs
npm ci --omit=dev
systemctl restart gaga-calling
curl -s http://127.0.0.1:8080/healthz
```

### 9.5 Monitoring

Watch these:

- `systemctl is-active gaga-calling coturn caddy` — service health.
- `journalctl -u gaga-calling | grep -c 'Call access or signaling rejected'` —
  a spike means clients are sending bad tokens or access is being revoked.
- coturn's `total-quota` (200) and `user-quota` (4) — allocation pressure.
- Alibaba Cloud **egress bandwidth** — relayed media is the dominant cost.
  Direct P2P calls cost almost nothing; relayed calls cost real money.

### 9.6 Cost

Signaling is negligible (small JSON messages). The cost driver is **relayed
media egress**. Measure relayed minutes × average bitrate × Alibaba's egress
price before projecting monthly cost. Do not promise unlimited free calling.

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `https://calls.../healthz` times out | Security group missing 443, or DNS not pointing here | Add the rule; check `dig calls.gagachat.app` |
| Caddy logs "no such host" | DNS not propagated yet | Wait, then `systemctl reload caddy` |
| `/healthz` works but calls never connect | TURN unreachable | Check 3478 udp/tcp and 49160–49259 udp in the security group |
| Calls connect on Wi-Fi but not on mobile data | TURN not working | Run `verify-remote.sh`; check `external-ip` in `/etc/turnserver.conf` |
| `gaga-calling` restarts in a loop | Bad env file or missing secret | `journalctl -u gaga-calling -n 50`; secret must be ≥ 32 chars |
| Gateway returns 403 for every request | Origin not in `ALLOWED_ORIGINS` | Add the exact origin (scheme + host, no trailing slash) |
| `turns:` fails but `turn:` works | No certificate for the TURN hostname | Run certbot for `turn.gagachat.app` (section 6) |
| Calls drop after ~1 hour | Credential renewal failing | Confirm the client is on the latest build (renewal at 45 min) |
| Camera indicator stays on after hangup | Prepared stream not released | Confirm the client is on the latest build (fix B3) |

---

## 11. Scope and limits

This is a **first one-to-one implementation**, not a global production
certification.

- **Group calls are not available.** They require an SFU/media server. The
  client throws "Group calling is not enabled yet."
- **Live streams and voice rooms** retain legacy peer code and need their own
  authenticated ICE/SFU migration.
- **The gateway is single-process** with transient connection state. It is not
  horizontally scaled. A restart drops signaling for in-flight calls (media
  survives).
- **Quality badges** use interval inbound packet loss, jitter and
  selected-candidate round-trip time. The thresholds are application
  heuristics, not a production quality guarantee.
- **Not yet built:** geographically distributed routing, native Android
  background calling/push, comprehensive QoS dashboards, production load
  testing, and monitoring/alerting.

### References

- WebRTC TURN: https://webrtc.org/getting-started/turn-server
- Alibaba Cloud ECS: https://www.alibabacloud.com/help/en/ecs/
- coturn example config: https://github.com/coturn/coturn/blob/master/examples/etc/turnserver.conf
- WebRTC spec (peer config, ICE restart): https://www.w3.org/TR/webrtc/
- WebRTC stats: https://www.w3.org/TR/webrtc-stats/
