#!/usr/bin/env bash
# ecs-deploy.sh - One-shot GaGa Chat API deployment on the Alibaba ECS host.
# Run as root on Ubuntu 24.04 (image ubuntu_24_04_x64_20G_alibase_20260828.vhd).
#
# Installs: Docker Engine, Node 20 (for build/verify tooling), coturn.
# Deploys: the production docker-compose stack (api + nginx proxy) with the
# runtime env at /etc/gagachat/runtime.env, gated on /api/ready.
#
# Pre-flight expectations (see RUNBOOK-ACCOUNT-UNBLOCK.md + aliyunprovision.sh):
#   * RDS MySQL 8, Tair/Redis and OSS bucket already created (private, same region)
#   * ACR image built and pushed:  registry.ap-southeast-3.aliyuncs.com/<ns>/gagachat-api@sha256:<digest>
#   * /etc/gagachat/runtime.env present (chmod 600) with the 14 runtime secrets
#     (mirror of backend/.env.example: RDS_*, REDIS_URL, OSS_*, PUBLIC_BASE,
#      JWT_SECRET, TURN_*, FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_PROJECT_ID)
#
# Usage:  ./ecs-deploy.sh            # full install (idempotent)
#         ./ecs-deploy.sh --verify   # health gates only, no changes
set -euo pipefail

VERIFY_ONLY=0
[[ "${1:-}" == "--verify" ]] && VERIFY_ONLY=1

GAGA_ROOT=/opt/gagachat
RUNTIME_ENV=/etc/gagachat/runtime.env
COMPOSE_FILE="$GAGA_ROOT/deploy/docker-compose.production.yml"
PUBLIC_BASE="${PUBLIC_BASE:-https://api.gagachat.app/api}"
ACR_DOMAIN="registry.ap-southeast-3.aliyuncs.com"

log()  { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die()  { printf '[%s] ERROR: %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; exit 1; }

# ---------- pre-flight ----------
[[ "$(id -u)" == 0 ]] || die "run as root"
. /etc/os-release; [[ "${VERSION_ID:-}" == 24.* ]] || die "expected Ubuntu 24.04, found ${PRETTY_NAME:-unknown}"

if [[ ! -f "$RUNTIME_ENV" ]]; then
  die "missing $RUNTIME_ENV - create it from backend/.env.example (chmod 600) first"
fi
[[ "$(stat -c %a "$RUNTIME_ENV")" == "600" ]] || chmod 600 "$RUNTIME_ENV"

# required secrets (mirrors cloud/readiness.js)
REQUIRED_KEYS="RDS_HOST RDS_DATABASE RDS_USER RDS_PASSWORD REDIS_URL OSS_REGION
OSS_BUCKET OSS_ACCESS_KEY_ID OSS_ACCESS_KEY_SECRET PUBLIC_BASE JWT_SECRET
TURN_HOST TURN_SECRET FIREBASE_SERVICE_ACCOUNT_JSON"
for key in $REQUIRED_KEYS; do
  grep -qE "^${key}=" "$RUNTIME_ENV" || die "runtime.env missing ${key}"
done

if [[ "$VERIFY_ONLY" -eq 0 ]]; then
  # ---------- packages ----------
  if ! command -v docker >/dev/null; then
    log "installing Docker Engine"
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl >/dev/null
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
    systemctl enable --now docker
  fi
  if ! command -v node >/dev/null || [[ "$(node -v | cut -c2-3)" != "20" ]]; then
    log "installing Node 20 (build/verify tooling)"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
    apt-get install -y -qq nodejs >/dev/null
  fi
  if ! command -v turnserver >/dev/null; then
    log "installing coturn"
    apt-get update -qq && apt-get install -y -qq coturn >/dev/null
  fi

  # ---------- workspace ----------
  mkdir -p "$GAGA_ROOT/deploy"
  if [[ -d "$GAGA_ROOT/repo/backend" ]]; then
    log "repo already present at $GAGA_ROOT/repo"
  else
    log "clone the gagachat repo to $GAGA_ROOT/repo (or rsync backend/ there)"
    git clone --depth 1 https://github.com/omarouma/app.git "$GAGA_ROOT/repo" 2>/dev/null \
      || log "WARN: git clone failed - rsync backend/ + deploy/ into $GAGA_ROOT manually"
  fi
  # copy the compose + nginx assets from the repo (works for rsync too)
  if [[ -d "$GAGA_ROOT/repo/backend/deploy" ]]; then
    cp -f "$GAGA_ROOT"/repo/backend/deploy/{docker-compose.production.yml,nginx-api.conf} "$GAGA_ROOT/deploy/"
  elif [[ -f "$COMPOSE_FILE" ]]; then
    log "using compose assets already in $GAGA_ROOT/deploy"
  else
    die "no docker-compose.production.yml found - place it in $GAGA_ROOT/deploy"
  fi

  # ---------- coturn ----------
  TURN_HOST_FROM_ENV=$(grep -E '^TURN_HOST=' "$RUNTIME_ENV" | cut -d= -f2-)
  TURN_SECRET_FROM_ENV=$(grep -E '^TURN_SECRET=' "$RUNTIME_ENV" | cut -d= -f2-)
  cat > /etc/turnserver.conf <<TURN
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0
external-ip=\$(detect-external-ip)
realm=gagachat.app
server-name=gagachat.app
use-auth-secret
static-auth-secret=${TURN_SECRET_FROM_ENV}
min-port=49160
max-port=49260
no-cli
no-tls
no-dtls
pidfile=/run/turnserver.pid
TURN
  sed -i 's/^#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn 2>/dev/null || true
  systemctl enable --now coturn || systemctl restart coturn

  # ---------- api container ----------
  GAGA_API_IMAGE=$(grep -E '^GAGA_API_IMAGE=' "$RUNTIME_ENV" | cut -d= -f2- || true)
  [[ -n "${GAGA_API_IMAGE:-}" ]] || die "runtime.env missing GAGA_API_IMAGE (ACR digest, e.g. ${ACR_DOMAIN}/<ns>/gagachat-api@sha256:...)"
  export GAGA_API_IMAGE

  log "pulling $GAGA_API_IMAGE"
  docker compose -f "$COMPOSE_FILE" pull api

  log "starting stack (api + proxy on 127.0.0.1:8080)"
  docker compose -f "$COMPOSE_FILE" up -d
fi

# ---------- health gates (always) ----------
log "waiting for /api/ready on the local proxy (max 120s)"
READY_OK=0
for i in $(seq 1 60); do
  CODE=$(curl -s -o /tmp/ready.json -w '%{http_code}' "http://127.0.0.1:8080/api/ready" || true)
  if [[ "$CODE" == "200" ]] && jq -e '.ready==true and .database=="rds-mysql" and .realtime=="redis" and .media=="oss"' /tmp/ready.json >/dev/null 2>&1; then
    READY_OK=1; break
  fi
  sleep 2
done
[[ "$READY_OK" -eq 1 ]] || { cat /tmp/ready.json 2>/dev/null; die "/api/ready gate FAILED - check: docker compose -f $COMPOSE_FILE logs api"; }

CODE=$(curl -s -o /tmp/health.json -w '%{http_code}' "http://127.0.0.1:8080/api/health" || true)
[[ "$CODE" == "200" ]] || die "/api/health returned $CODE"
jq -e '.ok==true and .database=="rds-mysql" and .realtime=="redis"' /tmp/health.json >/dev/null \
  || die "/api/health body failed the contract: $(cat /tmp/health.json)"

log "ready: $(cat /tmp/ready.json)"

# ---------- public gate ----------
log "public endpoint check (requires DNS + TLS in front - ALB/SLB or Caddy)"
if curl -s --max-time 10 -o /tmp/pub.json "$PUBLIC_BASE/ready" 2>/dev/null \
   && jq -e '.ready==true' /tmp/pub.json >/dev/null 2>&1; then
  log "public endpoint VERIFIED at $PUBLIC_BASE"
else
  log "public endpoint not reachable yet - expected until DNS/TLS cutover is done"
fi

log "deployment gates PASSED (local stack healthy)"
log "next: point api.gagachat.app at this host, then run deploy/verify-live.sh"
