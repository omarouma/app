#!/usr/bin/env bash
# Read-only public deployment check. Never includes user credentials or secrets.
set -uo pipefail
API_HOST=api.gagachat.app
API_BASE="https://${API_HOST}/api"
REPORT="${1:-backend-verification.txt}"
fail=0
(
  printf 'GaGa Chat public API verification\n'
  printf 'Endpoint: %s\n' "$API_BASE"
  printf 'Checked at: %s\n' "$(date -u +%FT%TZ)"
  if getent hosts "$API_HOST" >/dev/null; then
    echo 'DNS: PASS'
  else
    echo 'DNS: FAIL (hostname does not resolve)'
    fail=1
  fi
  for route in health ready; do
    response=$(curl --fail --silent --show-error --location --proto '=https' \
      --max-time 12 --connect-timeout 5 "${API_BASE}/${route}" 2>&1)
    code=$?
    if (( code != 0 )); then
      printf '%s: FAIL (curl exit %d) %s\n' "$route" "$code" "${response:0:180}"
      fail=1
      continue
    fi
    if [[ "$route" == health ]] && jq -e '.ok == true' <<<"$response" >/dev/null 2>&1; then
      echo 'health: PASS'
    elif [[ "$route" == ready ]] && jq -e '.ready == true' <<<"$response" >/dev/null 2>&1; then
      echo 'ready: PASS'
    else
      printf '%s: FAIL (response did not report ready state)\n' "$route"
      fail=1
    fi
  done
  if (( fail == 0 )); then echo 'RESULT: DEPLOYMENT READY';
  else echo 'RESULT: DEPLOYMENT NOT VERIFIED'; fi
  exit "$fail"
) | tee "$REPORT"
