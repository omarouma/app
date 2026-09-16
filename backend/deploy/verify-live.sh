#!/usr/bin/env bash
set -Eeuo pipefail
: "${GAGA_API_BASE:=https://api.gagachat.app/api}"
health="$(curl --fail --silent --show-error --proto '=https' --tlsv1.2 "$GAGA_API_BASE/health")"
ready="$(curl --fail --silent --show-error --proto '=https' --tlsv1.2 "$GAGA_API_BASE/ready")"
node -e 'const h=JSON.parse(process.argv[1]),r=JSON.parse(process.argv[2]);if(!h.ok||!r.ready)process.exit(1);console.log(JSON.stringify({health:true,ready:true,version:h.version}))' "$health" "$ready"
api_host="$(node -e 'console.log(new URL(process.argv[1]).hostname)' "$GAGA_API_BASE")"
openssl s_client -connect "$api_host:443" -servername "$api_host" </dev/null 2>/dev/null | openssl x509 -noout -checkend 604800
