# GaGa Chat — Calling Fix, Alibaba Cloud Real-Time Setup, Frontend Pass, Build & Deploy

**Release:** 1.0.2 · **Branch:** `improve/screens-and-calling` · **PR:** [#2](https://github.com/omarouma/app/pull/2)
**Commits:** `819e456` (calling + Alibaba Cloud), `cb4d666` (preconnect fix + guard)
**Public preview:** https://sites.super.myninja.ai/165e00ac-3c19-4313-a0f7-a5f26b39fa31/41bbc85b/index.html

---

## 1. What was wrong with calling

The calling stack was already self-hosted (no paid SDK), but six concrete defects
were breaking real calls. Each one is fixed and verified.

### B1 — Leaked looping ringtone

Two independent owners requested the incoming-call ringtone for the same call:
the app-level `useIncomingCallNotifications` hook and the globally mounted
`CallOverlay`. `sounds.ts` held the ringtone in a local variable, so the second
request overwrote the first handle. The first ringtone kept looping forever with
no way to stop it — audible on every incoming call, and it survived the call
ending.

**Fix:** a module-level singleton `activeRingtone` plus a `stopActiveRingtone()`
helper that is called before any new ringtone starts and from `stopAllSounds()`.
Only one ringtone can ever be live.

### B2 — One `AbortController` for every ICE fetch

`AlibabaCall` created a single `AbortController` in the constructor and reused it
for every `fetchIce` call. The first request that hit its timeout aborted the
controller, which permanently aborted **every subsequent request** — including
the 45-minute TURN credential renewal and every ICE restart. Long calls would
lose relay connectivity and never recover.

**Fix:** a fresh `AbortController` per request, with a comment explaining why
reuse is fatal here.

### B3 — Double `getUserMedia`

The store acquired camera/mic to pre-check permission, then the WebRTC engine
acquired it again to actually start the call. Two acquisitions in quick
succession throw `NotReadableError` on several mobile browsers, and the camera
indicator flashed twice.

**Fix:** a new `src/lib/callMedia.ts` implements a single-slot prepared-stream
hand-off. The store calls `prepareCallStream(callId, video)`; the engine calls
`takePreparedStream(callId, video)` and falls back to `getUserMedia` only if the
slot is empty or the `callId` does not match. `callMediaConstraints()` is shared
so both paths request identical constraints (echo cancellation, noise
suppression, 640×360 @ 20–30 fps front camera).

### B4 — Unbounded notification state

`notificationSentRef` grew without limit for the lifetime of the session, and the
caller-info cache was likewise unbounded.

**Fix:** the notified set is capped at 20 (trimmed to 10, insertion order
preserved) and the caller cache is cleared past 100 entries.

### B5 — Duplicate, partly fake in-call controls

`CallPage` rendered its own control grid *and* `CallOverlay` rendered one. In the
`CallPage` grid the **Speaker** button was a no-op and the **Keypad** button sent
a hard-coded `sendDTMF('1')` regardless of which key the user pressed.

**Fix:** `CallPage` is now a thin initiator with exactly three responsibilities —
request permission before dialling, kick off `startCall` once with retry, and
show a permission/error state with Retry and Cancel. All in-call UI lives in
`CallOverlay`. The duplicate grid is gone.

### B6 — Incomplete realtime payloads

`call_history` used the default replica identity (primary key only), so
`postgres_changes` UPDATE payloads carried an incomplete `old` record.

**Fix:** `supabase/migrations/20260820000600_realtime_replica_identity.sql` sets
`REPLICA IDENTITY FULL` for `call_history`, `call_signaling`, `messages`,
`chats`, `notifications`, `friend_requests`, `friendships`, `typing` and
`presence`, guarded by an `information_schema.tables` existence check. The same
block is appended to `supabase_full_setup.sql` as section 29.

### B7 — Verification

| Check | Result |
|---|---|
| `npx tsc -b` | 0 errors |
| `npx eslint .` | 0 errors, 0 warnings |
| `npx vitest run` | 141/141 passing (16 files) |
| `node --test` (gateway) | 3/3 passing |
| `npm run smoke` (gateway end-to-end) | 13/13 passing |
| `npm run build` | 140 hosting files |
| `npm run verify:release` | Release 1.0.2 verified |

---

## 2. Frontend improvements

### Real audio-output selection

The "Audio output" button in `CallOverlay` previously only showed a toast telling
the user to change their OS settings. It now enumerates `audiooutput` devices via
`navigator.mediaDevices.enumerateDevices()` and applies the choice with
`HTMLMediaElement.setSinkId()`. Because `setSinkId` is Chromium-only, the control
is **hidden entirely** where it is unsupported rather than presenting a dead
button. The remote-audio element's ref is owned by the parent so `setSinkId`
applies to the element that actually plays the call.

### Dead group-calling panel removed

`CallOverlay` carried a full "Add participant" slide-up panel that mapped friends
and recent contacts, but `inviteToCall` in the store throws
`'Group calling is not enabled yet.'` — the panel could never work. It has been
removed along with its now-unused state, effect, and `useFriendStore` import.

### Fabricated-data audit

Every screen was checked for invented user-facing metrics. **None were found.**

- `AnalyticsPage` — carries an explicit comment that the series is real backend
  data and never a fabricated placeholder; `defaultAnalytics` is all zeros.
- `ProfilePage` — friend/follower/following counts come from `displayUser` with
  real fallbacks.
- `CreatorCenterPage` — the arrays are decorative configuration (e.g.
  `{ value: '16+', label: 'Creator Categories' }`), not user data.
- `GoogleAd` / `AdBanner` — `MOCK_ADS` is a legitimate fallback used only when
  AdSense is not configured.

### Stale Supabase preconnect (found during deploy verification)

`index.html` preconnected to `alzwgikndwbecuqmlrca.supabase.co` while
`VITE_SUPABASE_URL` is `fcjgbbmfqdkucfpqjxae.supabase.co`. Every page load warmed
up a dead origin and the shipped HTML leaked a stale hostname. Fixed, and
`verify-build-output.mjs` now **fails the release** if any `*.supabase.co` host in
`index.html` is not the live project ref.

---

## 3. Alibaba Cloud real-time calling setup

### Architecture

```
Browser A ──┐                        ┌── Browser B
            │  HTTPS/WSS             │
            └──► Caddy (TLS) ──► gaga-calling gateway (Node 22, systemd)
                                        │
                                        ├─ GET  /healthz   liveness
                                        ├─ GET  /ice       HMAC-SHA1 TURN creds (1h)
                                        └─ WS   /signal    offer/answer/ICE relay
                                        │
                                   coturn (TURN/TURNS)
                                        │
                                   relayed media (UDP 49160-49259)
```

The gateway is a **signaling relay only** — it never touches media. Media flows
peer-to-peer, or through coturn when a direct path is impossible (symmetric NAT,
carrier-grade NAT, restrictive corporate firewalls). TURN relay is mandatory for
reliable mobile calling; without it a meaningful share of calls simply fail to
connect.

### One-command provisioning

`alibaba-calling/provision-ecs.sh` is idempotent and supports `--dry-run`. It
performs twelve steps:

1. Detect private and public IP
2. Install Node 22 (NodeSource), coturn, Caddy (Cloudsmith)
3. Create the `gagacall` system user
4. Install the gateway to `/opt/gaga-calling` + `npm ci --omit=dev`
5. Generate or reuse a 48-character TURN secret
6. Write `/etc/gaga-calling.env` (mode 0640, root:gagacall)
7. Write `/etc/turnserver.conf` and enable coturn in `/etc/default/coturn`
8. Write `/etc/caddy/conf.d/gaga-calling.caddy` and ensure the Caddyfile imports it
9. Install `gaga-calling.service` with systemd hardening
10. Configure ufw (80, 443, 3478 udp+tcp, 5349, 49160-49259/udp)
11. Enable and restart services
12. Verify

It then prints the required Alibaba security-group rules, the DNS records to
create, and the frontend rebuild instructions.

```bash
./provision-ecs.sh --dry-run \
  --domain calls.gagachat.app --turn-domain turn.gagachat.app \
  --origins https://gagachat.web.app,https://gagachat.firebaseapp.com \
  --supabase-url https://fcjgbbmfqdkucfpqjxae.supabase.co \
  --supabase-anon-key "$VITE_SUPABASE_ANON_KEY" --email ops@gagachat.app
```

### External verification

`alibaba-calling/verify-remote.sh` checks a deployment from outside the VPC:
TLS chain via `openssl s_client` (expects `Verify return code: 0`), `/healthz`
returns `ok`, unauthenticated `/ice` returns 403, the `/signal` WebSocket upgrade
returns 101, and a TURN STUN binding succeeds via `turnutils_stunclient`.

```bash
./verify-remote.sh https://calls.gagachat.app turn.gagachat.app
```

### Local end-to-end smoke test

`alibaba-calling/scripts/local-smoke.mjs` boots the real `createCallingServer` on
an ephemeral port with a stubbed verifier and runs thirteen checks. It uses a
buffered socket reader so a message arriving between `await`s is never dropped —
the original listener-based version raced and reported false failures.

```
ok - GET /healthz returns 200 "ok"
ok - GET /ice returns TURN + TURNS with time-limited credentials
ok - GET /ice without a token is rejected (403)
ok - GET /ice from a disallowed origin is rejected (403)
ok - WS /signal without auth is closed 1008
ok - WS /signal with an invalid token is closed 1008
ok - caller receives ready(caller=true)
ok - callee receives ready(caller=false)
ok - both peers receive peer-ready
ok - offer is relayed caller -> callee
ok - answer is relayed callee -> caller
ok - ICE candidate is relayed caller -> callee
ok - callee sending an offer is rejected (role enforcement)
13/13 checks passed
```

### Runbook

`alibaba-calling/ALIBABA-CLOUD-SETUP.md` covers eleven sections: architecture,
prerequisites (including an explicit warning never to put the TURN secret in a
`VITE_*` variable), one-command provisioning, manual provisioning, Alibaba
security-group rules, DNS and certbot for `turns:`, frontend configuration,
verification (on-instance, external, gateway self-test, twelve real-device
checks), operations (logs, restart, secret rotation, code updates, monitoring,
cost), a ten-symptom troubleshooting table, and scope/limits.

### Security posture (already correct, verified)

- CSP `connect-src` already permits `https://calls.gagachat.app` and
  `wss://calls.gagachat.app` — no change needed.
- `Permissions-Policy: camera=(self), microphone=(self), geolocation=(), payment=(), fullscreen=(self), autoplay=(self)`.
- TURN credentials are HMAC-SHA1, time-limited to one hour, and minted
  server-side only.
- Gateway hardening: origin allowlist, 12-second auth timeout, 40 msg/sec rate
  limit, 64 pending messages, max 1000 clients, 70 KB max payload, role
  enforcement (only the caller may send an offer).
- Client hardening: bounded reconnect (4 attempts, exponential backoff capped at
  8 s), 45-minute credential renewal, ICE restart, quality sampling every 2 s.

---

## 4. Build and deploy

| Step | Result |
|---|---|
| `npx tsc -b` | 0 errors |
| `npx eslint .` | 0 errors, 0 warnings |
| `npx vitest run` | 141/141 passing |
| `npm run build` | built in ~25 s, 140 hosting files |
| `npm run verify:release` | Release 1.0.2 verified |
| `npm run check:calling` | gateway syntax OK |
| Gateway `node --test` | 3/3 passing |
| Gateway `npm run smoke` | 13/13 passing |

**GitHub:** pushed to `improve/screens-and-calling`; PR #2 updated with a full
change summary.

**Public preview:** https://sites.super.myninja.ai/165e00ac-3c19-4313-a0f7-a5f26b39fa31/41bbc85b/index.html
(verified: `index.html` 200, `sw.js` 200, `manifest.json` 200, and the only
Supabase host in the shipped HTML is the live project).

### One remaining blocker

The Firebase **live** deploy is still blocked on the `FIREBASE_SERVICE_ACCOUNT`
GitHub secret, which is not configured in the repository. The CI workflow
otherwise passes (Node 22, lint, typecheck, tests, calling syntax check, build).
Until that secret is added, the public preview above is the working deployment
target. Adding the secret is a one-time action in
**Settings → Secrets and variables → Actions**.

---

## 5. Files changed

**Calling fixes**
- `src/lib/sounds.ts` — ringtone singleton
- `src/lib/alibabaCall.ts` — per-request `AbortController`, prepared-stream reuse
- `src/lib/callMedia.ts` — **new**, prepared-stream hand-off
- `src/store/useCallStore.ts` — release prepared stream on every terminal path
- `src/hooks/useIncomingCallNotifications.ts` — bounded state
- `src/pages/CallPage.tsx` — thin initiator
- `src/components/calling/CallOverlay.tsx` — audio-output picker, dead panel removed
- `supabase/migrations/20260820000600_realtime_replica_identity.sql` — **new**
- `supabase_full_setup.sql` — section 29

**Alibaba Cloud**
- `alibaba-calling/provision-ecs.sh` — **new**
- `alibaba-calling/verify-remote.sh` — **new**
- `alibaba-calling/scripts/local-smoke.mjs` — **new**
- `alibaba-calling/ALIBABA-CLOUD-SETUP.md` — **new**
- `alibaba-calling/README.md`, `alibaba-calling/package.json` — updated

**Frontend / build**
- `index.html` — live Supabase preconnect
- `scripts/verify-build-output.mjs` — stale-host guard
