#!/usr/bin/env bash
#
# GaGa Chat — one-command Alibaba Cloud ECS provisioning for real-time calling.
#
# Installs and configures, on a fresh Ubuntu 22.04/24.04 or Debian 12 ECS host:
#
#   * Node.js 22            (runs the signaling gateway)
#   * coturn                (authenticated TURN relay for NAT/firewall traversal)
#   * Caddy                 (TLS termination + WSS reverse proxy)
#   * gagacall system user  (unprivileged service account)
#   * /opt/gaga-calling     (gateway code)
#   * /etc/gaga-calling.env (secrets, mode 0640, root:gagacall)
#   * /etc/turnserver.conf  (coturn config with real IPs + shared secret)
#   * systemd units         (gaga-calling.service, coturn)
#   * host firewall rules   (ufw, if present)
#
# It is idempotent: re-running it updates config and restarts services without
# duplicating users, units or firewall rules.
#
# ── Usage ────────────────────────────────────────────────────────────────────
#
#   sudo ./provision-ecs.sh \
#     --domain calls.gagachat.app \
#     --turn-domain turn.gagachat.app \
#     --origins https://gagachat.app,https://oumagachat.web.app \
#     --supabase-url https://YOUR-PROJECT.supabase.co \
#     --supabase-anon-key YOUR_PUBLIC_ANON_KEY \
#     --email you@example.com
#
#   # Preview every action without changing the host:
#   sudo ./provision-ecs.sh --dry-run ...same flags...
#
# ── What it does NOT do ──────────────────────────────────────────────────────
#
#   * It does not create DNS records. Point both hostnames at the ECS public IP
#     first, or Caddy cannot obtain certificates.
#   * It does not open the Alibaba Cloud *security group*. Add the inbound rules
#     printed at the end of the run in the ECS console.
#   * It does not deploy the frontend. Rebuild it with VITE_CALLING_API_URL set
#     to https://<domain> and deploy separately.
#
set -euo pipefail

# ── Defaults ─────────────────────────────────────────────────────────────────
DOMAIN=""
TURN_DOMAIN=""
ORIGINS=""
SUPABASE_URL=""
SUPABASE_ANON_KEY=""
EMAIL=""
INSTALL_DIR="/opt/gaga-calling"
ENV_FILE="/etc/gaga-calling.env"
TURN_CONF="/etc/turnserver.conf"
SERVICE_USER="gagacall"
NODE_MAJOR="22"
DRY_RUN=0
SKIP_TLS=0

# ── Output helpers ───────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_INFO=$'\033[36m'; C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'
else
  C_RESET=""; C_INFO=""; C_OK=""; C_WARN=""; C_ERR=""
fi
info() { printf '%s==>%s %s\n' "$C_INFO" "$C_RESET" "$*"; }
ok()   { printf '%s ok %s %s\n' "$C_OK" "$C_RESET" "$*"; }
warn() { printf '%swarn%s %s\n' "$C_WARN" "$C_RESET" "$*" >&2; }
die()  { printf '%sFAIL%s %s\n' "$C_ERR" "$C_RESET" "$*" >&2; exit 1; }

# Runs a command, or prints it when --dry-run is set.
run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '   [dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

# Writes a file from stdin, or prints it when --dry-run is set.
write_file() {
  local path="$1" mode="${2:-0644}" owner="${3:-root:root}"
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '   [dry-run] write %s (mode %s, owner %s):\n' "$path" "$mode" "$owner"
    sed 's/^/      | /'
  else
    install -m "$mode" -o "${owner%%:*}" -g "${owner##*:}" /dev/stdin "$path"
  fi
}

# ── Argument parsing ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)            DOMAIN="${2:-}"; shift 2 ;;
    --turn-domain)       TURN_DOMAIN="${2:-}"; shift 2 ;;
    --origins)           ORIGINS="${2:-}"; shift 2 ;;
    --supabase-url)      SUPABASE_URL="${2:-}"; shift 2 ;;
    --supabase-anon-key) SUPABASE_ANON_KEY="${2:-}"; shift 2 ;;
    --email)             EMAIL="${2:-}"; shift 2 ;;
    --install-dir)       INSTALL_DIR="${2:-}"; shift 2 ;;
    --dry-run)           DRY_RUN=1; shift ;;
    --skip-tls)          SKIP_TLS=1; shift ;;
    -h|--help)           sed -n '2,60p' "$0"; exit 0 ;;
    *) die "Unknown argument: $1 (use --help)" ;;
  esac
done

[[ "$(id -u)" == "0" || "$DRY_RUN" == "1" ]] || die "Run as root (sudo)."
[[ -n "$DOMAIN" ]]            || die "--domain is required (e.g. calls.gagachat.app)"
[[ -n "$TURN_DOMAIN" ]]       || die "--turn-domain is required (e.g. turn.gagachat.app)"
[[ -n "$ORIGINS" ]]           || die "--origins is required (comma-separated frontend origins)"
[[ -n "$SUPABASE_URL" ]]      || die "--supabase-url is required"
[[ -n "$SUPABASE_ANON_KEY" ]] || die "--supabase-anon-key is required"
[[ -n "$EMAIL" || "$SKIP_TLS" == "1" ]] || die "--email is required for Let's Encrypt (or pass --skip-tls)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$SCRIPT_DIR/server.mjs" ]] || die "server.mjs not found next to this script ($SCRIPT_DIR)"

# ── 1. Detect the host's public and private IPs ──────────────────────────────
info "Detecting network addresses"
PRIVATE_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1)"
[[ -n "$PRIVATE_IP" ]] || PRIVATE_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[[ -n "$PRIVATE_IP" ]] || die "Could not determine the private IP. Set it manually in $TURN_CONF."

PUBLIC_IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
if [[ -z "$PUBLIC_IP" ]]; then
  warn "Could not auto-detect the public IP (no outbound access?)."
  warn "You MUST set external-ip manually in $TURN_CONF or TURN will not work."
  PUBLIC_IP="REPLACE_WITH_PUBLIC_IP"
fi
ok "private=$PRIVATE_IP public=$PUBLIC_IP"

# ── 2. Install packages ──────────────────────────────────────────────────────
info "Installing Node.js $NODE_MAJOR, coturn and Caddy"
if [[ "$DRY_RUN" == "0" ]]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https

  # Node.js from NodeSource.
  if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/^v\([0-9]*\).*/\1/')" -lt "$NODE_MAJOR" ]]; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install -y -qq nodejs
  fi

  # Caddy from its official repository.
  if ! command -v caddy >/dev/null 2>&1; then
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
      | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
      > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y -qq caddy
  fi

  # coturn.
  apt-get install -y -qq coturn
else
  run apt-get update -qq
  run apt-get install -y -qq curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https nodejs caddy coturn
fi
ok "packages installed"

# ── 3. Service user ──────────────────────────────────────────────────────────
info "Ensuring service user '$SERVICE_USER'"
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  run useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi
ok "user ready"

# ── 4. Install the gateway code ──────────────────────────────────────────────
info "Installing gateway into $INSTALL_DIR"
run install -d -m 0755 "$INSTALL_DIR"
for f in server.mjs package.json package-lock.json; do
  [[ -f "$SCRIPT_DIR/$f" ]] && run install -m 0644 "$SCRIPT_DIR/$f" "$INSTALL_DIR/$f"
done
if [[ -d "$SCRIPT_DIR/scripts" ]]; then
  run install -d -m 0755 "$INSTALL_DIR/scripts"
  run cp -r "$SCRIPT_DIR/scripts/." "$INSTALL_DIR/scripts/"
fi
if [[ "$DRY_RUN" == "0" ]]; then
  ( cd "$INSTALL_DIR" && npm ci --omit=dev --no-audit --no-fund >/dev/null 2>&1 ) \
    || ( cd "$INSTALL_DIR" && npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1 )
  chown -R root:"$SERVICE_USER" "$INSTALL_DIR"
  chmod -R g+rX "$INSTALL_DIR"
else
  run npm ci --omit=dev --prefix "$INSTALL_DIR"
fi
ok "gateway installed"

# ── 5. Shared TURN secret ────────────────────────────────────────────────────
# Reuse the existing secret on re-run so coturn and the gateway stay in sync.
info "Preparing the TURN shared secret"
TURN_SECRET=""
if [[ "$DRY_RUN" == "0" && -f "$ENV_FILE" ]]; then
  TURN_SECRET="$(grep -E '^TURN_SHARED_SECRET=' "$ENV_FILE" | cut -d= -f2- || true)"
fi
if [[ -z "$TURN_SECRET" ]]; then
  TURN_SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '/+=' | head -c 48)"
  ok "generated a new 48-character secret"
else
  ok "reusing the existing secret"
fi

# ── 6. Gateway environment file ──────────────────────────────────────────────
info "Writing $ENV_FILE"
write_file "$ENV_FILE" 0640 "root:$SERVICE_USER" <<EOF
# GaGa calling gateway — generated by provision-ecs.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Contains secrets. Keep mode 0640 root:$SERVICE_USER. Never expose via VITE_*.
PORT=8080
ALLOWED_ORIGINS=$ORIGINS
SUPABASE_URL=$SUPABASE_URL
SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
TURN_SHARED_SECRET=$TURN_SECRET
TURN_URLS=turn:$TURN_DOMAIN:3478?transport=udp,turn:$TURN_DOMAIN:3478?transport=tcp,turns:$TURN_DOMAIN:5349?transport=tcp
EOF
ok "environment written"

# ── 7. coturn configuration ──────────────────────────────────────────────────
info "Writing $TURN_CONF"
if [[ "$SKIP_TLS" == "1" ]]; then
  TLS_BLOCK="# TLS disabled (--skip-tls). TURNS on 5349 will not be available."
else
  TLS_BLOCK="cert=/etc/letsencrypt/live/$TURN_DOMAIN/fullchain.pem
pkey=/etc/letsencrypt/live/$TURN_DOMAIN/privkey.pem"
fi
write_file "$TURN_CONF" 0640 "root:$SERVICE_USER" <<EOF
# GaGa coturn — generated by provision-ecs.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
listening-port=3478
tls-listening-port=5349
listening-ip=$PRIVATE_IP
relay-ip=$PRIVATE_IP
external-ip=$PUBLIC_IP/$PRIVATE_IP
min-port=49160
max-port=49259
fingerprint
use-auth-secret
static-auth-secret=$TURN_SECRET
realm=$TURN_DOMAIN
server-name=$TURN_DOMAIN
$TLS_BLOCK
no-cli
no-multicast-peers
no-tlsv1
no-tlsv1_1
user-quota=4
total-quota=200
# Block relay traffic into private/metadata networks.
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=::1
denied-peer-ip=fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
denied-peer-ip=fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff
EOF

# Debian/Ubuntu ship coturn with TURNSERVER_ENABLED commented out.
if [[ "$DRY_RUN" == "0" && -f /etc/default/coturn ]]; then
  sed -i 's/^#\s*TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
  grep -q '^TURNSERVER_ENABLED=1' /etc/default/coturn || echo 'TURNSERVER_ENABLED=1' >> /etc/default/coturn
fi
ok "coturn configured"

# ── 8. Caddy reverse proxy ───────────────────────────────────────────────────
info "Configuring Caddy for $DOMAIN"
CADDY_SNIPPET="/etc/caddy/conf.d/gaga-calling.caddy"
run install -d -m 0755 /etc/caddy/conf.d
if [[ "$SKIP_TLS" == "1" ]]; then
  write_file "$CADDY_SNIPPET" 0644 "root:root" <<EOF
# GaGa calling gateway (TLS disabled — terminate TLS elsewhere).
http://$DOMAIN {
  reverse_proxy 127.0.0.1:8080
}
EOF
else
  write_file "$CADDY_SNIPPET" 0644 "root:root" <<EOF
# GaGa calling gateway. Caddy obtains and renews the certificate automatically.
$DOMAIN {
  encode zstd gzip
  reverse_proxy 127.0.0.1:8080 {
    header_up X-Real-IP {remote_host}
  }
  log {
    output file /var/log/caddy/$DOMAIN.log
    format json
  }
}
EOF
fi

# Make sure the main Caddyfile imports the snippet directory.
if [[ "$DRY_RUN" == "0" ]]; then
  if [[ ! -f /etc/caddy/Caddyfile ]]; then
    printf 'import /etc/caddy/conf.d/*.caddy\n' > /etc/caddy/Caddyfile
  elif ! grep -q 'conf.d/\*.caddy' /etc/caddy/Caddyfile; then
    printf '\nimport /etc/caddy/conf.d/*.caddy\n' >> /etc/caddy/Caddyfile
  fi
  caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 || warn "caddy validate reported issues; check /etc/caddy/Caddyfile"
fi
ok "Caddy configured"

# ── 9. systemd unit ──────────────────────────────────────────────────────────
info "Installing gaga-calling.service"
NODE_BIN="$(command -v node || echo /usr/bin/node)"
write_file /etc/systemd/system/gaga-calling.service 0644 "root:root" <<EOF
[Unit]
Description=GaGa self-hosted calling gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN $INSTALL_DIR/server.mjs
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
MemoryDenyWriteExecute=false
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF
ok "unit installed"

# ── 10. Firewall ─────────────────────────────────────────────────────────────
info "Opening host firewall ports"
if command -v ufw >/dev/null 2>&1; then
  run ufw allow 80/tcp   >/dev/null 2>&1 || true
  run ufw allow 443/tcp  >/dev/null 2>&1 || true
  run ufw allow 3478/udp >/dev/null 2>&1 || true
  run ufw allow 3478/tcp >/dev/null 2>&1 || true
  run ufw allow 5349/tcp >/dev/null 2>&1 || true
  run ufw allow 49160:49259/udp >/dev/null 2>&1 || true
  ok "ufw rules applied"
else
  warn "ufw not installed — open the ports with your host firewall of choice."
fi

# ── 11. Start services ───────────────────────────────────────────────────────
info "Starting services"
run systemctl daemon-reload
run systemctl enable coturn
run systemctl restart coturn
run systemctl enable gaga-calling
run systemctl restart gaga-calling
run systemctl enable caddy
run systemctl restart caddy

# ── 12. Verify ───────────────────────────────────────────────────────────────
if [[ "$DRY_RUN" == "0" ]]; then
  info "Verifying"
  sleep 2
  if systemctl is-active --quiet gaga-calling; then ok "gaga-calling is active"; else warn "gaga-calling is NOT active — run: journalctl -u gaga-calling -n 50"; fi
  if systemctl is-active --quiet coturn;        then ok "coturn is active";        else warn "coturn is NOT active — run: journalctl -u coturn -n 50"; fi
  if systemctl is-active --quiet caddy;         then ok "caddy is active";         else warn "caddy is NOT active — run: journalctl -u caddy -n 50"; fi

  if curl -fsS --max-time 5 http://127.0.0.1:8080/healthz | grep -q '^ok$'; then
    ok "gateway /healthz responds 'ok' on localhost"
  else
    warn "gateway /healthz did not respond on localhost:8080"
  fi

  if [[ "$SKIP_TLS" == "0" ]]; then
    if curl -fsS --max-time 15 "https://$DOMAIN/healthz" | grep -q '^ok$'; then
      ok "https://$DOMAIN/healthz responds 'ok' (TLS + proxy working)"
    else
      warn "https://$DOMAIN/healthz failed. DNS may not point here yet, or the certificate is still being issued."
    fi
  fi
fi

# ── Summary ──────────────────────────────────────────────────────────────────
cat <<EOF

────────────────────────────────────────────────────────────────────────
GaGa calling gateway provisioned
────────────────────────────────────────────────────────────────────────
  Signaling (HTTPS/WSS) : https://$DOMAIN
  TURN                  : turn:$TURN_DOMAIN:3478  (udp + tcp)
  TURNS                 : turns:$TURN_DOMAIN:5349 (tcp)
  Gateway env           : $ENV_FILE   (mode 0640 root:$SERVICE_USER)
  coturn config         : $TURN_CONF
  Install dir           : $INSTALL_DIR
  Logs                  : journalctl -u gaga-calling -f

REQUIRED — add these inbound rules to the Alibaba Cloud security group:
  TCP 80           0.0.0.0/0   (Let's Encrypt HTTP-01 challenge)
  TCP 443          0.0.0.0/0   (HTTPS + WSS signaling)
  UDP 3478         0.0.0.0/0   (TURN)
  TCP 3478         0.0.0.0/0   (TURN over TCP)
  TCP 5349         0.0.0.0/0   (TURNS)
  UDP 49160-49259  0.0.0.0/0   (TURN relay allocations)

REQUIRED — DNS:
  A  $DOMAIN       -> $PUBLIC_IP
  A  $TURN_DOMAIN  -> $PUBLIC_IP

REQUIRED — frontend:
  Rebuild with VITE_CALLING_API_URL=https://$DOMAIN and redeploy.

Then verify from a machine OUTSIDE the VPC:
  curl https://$DOMAIN/healthz
  # Expect: ok
EOF
