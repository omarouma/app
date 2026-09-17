#!/usr/bin/env bash
#
# GaGa Chat — verify a *deployed* calling gateway from outside the VPC.
#
# Run this from your laptop (or any host that is NOT the ECS instance) after
# provision-ecs.sh has finished and DNS has propagated.
#
#   ./verify-remote.sh https://calls.gagachat.app turn.gagachat.app
#
# It checks the things that a local test cannot prove:
#   * TLS certificate is valid and trusted
#   * /healthz is reachable over the public internet
#   * /ice rejects unauthenticated callers
#   * the WSS upgrade endpoint is reachable
#   * the TURN port answers STUN binding requests
#
set -euo pipefail

DOMAIN_URL="${1:-}"
TURN_HOST="${2:-}"

if [[ -z "$DOMAIN_URL" || -z "$TURN_HOST" ]]; then
  echo "usage: $0 https://calls.example.com turn.example.com" >&2
  exit 2
fi

PASS=0; FAIL=0
ok()   { printf ' ok  %s\n' "$*"; PASS=$((PASS+1)); }
bad()  { printf 'FAIL  %s\n' "$*"; FAIL=$((FAIL+1)); }
info() { printf '\n== %s\n' "$*"; }

info "TLS certificate"
if command -v openssl >/dev/null 2>&1; then
  HOST="${DOMAIN_URL#https://}"; HOST="${HOST%%/*}"
  if echo | openssl s_client -servername "$HOST" -connect "$HOST:443" 2>/dev/null | grep -q 'Verify return code: 0'; then
    ok "certificate for $HOST verifies against the system trust store"
  else
    bad "certificate for $HOST did not verify (self-signed, expired, or wrong hostname)"
  fi
else
  echo "     (openssl not installed — skipping)"
fi

info "Signaling gateway"
HEALTH="$(curl -fsS --max-time 10 "$DOMAIN_URL/healthz" 2>/dev/null || true)"
if [[ "$(printf '%s' "$HEALTH" | tr -d '[:space:]')" == "ok" ]]; then
  ok "$DOMAIN_URL/healthz returned 'ok'"
else
  bad "$DOMAIN_URL/healthz did not return 'ok' (got: '${HEALTH:0:80}')"
fi

CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$DOMAIN_URL/ice?call=00000000-0000-0000-0000-000000000000" 2>/dev/null || echo 000)"
if [[ "$CODE" == "403" ]]; then
  ok "/ice rejects an unauthenticated request with 403"
else
  bad "/ice returned $CODE for an unauthenticated request (expected 403)"
fi

# A WSS upgrade with no auth should be accepted at the transport level and then
# closed by the gateway. curl reports 101 for a successful upgrade.
UPGRADE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  "$DOMAIN_URL/signal" 2>/dev/null || echo 000)"
if [[ "$UPGRADE" == "101" ]]; then
  ok "/signal accepts a WebSocket upgrade (101)"
else
  bad "/signal returned $UPGRADE for a WebSocket upgrade (expected 101)"
fi

info "TURN relay"
if command -v turnutils_stunclient >/dev/null 2>&1; then
  if turnutils_stunclient -p 3478 "$TURN_HOST" >/dev/null 2>&1; then
    ok "TURN answered a STUN binding request on udp/3478"
  else
    bad "TURN did not answer on udp/3478"
  fi
else
  echo "     (turnutils_stunclient not installed — install coturn-utils to test TURN)"
  echo "     Manual check: turnutils_stunclient -p 3478 $TURN_HOST"
fi

printf '\n────────────────────────────────────────\n'
printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" == "0" ]] || exit 1
