#!/usr/bin/env bash
# =============================================================================
# GaGa Chat — live backend probe
# =============================================================================
# Signs up two throwaway users and exercises every REST/Auth operation the
# native Android app performs, printing OK/FAIL per operation. Read-only with
# respect to real data: it only touches rows it creates.
#
# Usage:  bash backend_probe.sh
#
# It reads SUPABASE_URL / SUPABASE_ANON_KEY from
# android-native/ci/backend-public.json so no secret needs to be typed.
#
# Column/argument names mirror the app's own DTOs
# (core/network/.../dto/RowDtos.kt and SupabaseRestApi.kt) so a FAIL here means
# the live schema genuinely diverged from what the app sends.
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$ROOT/android-native/ci/backend-public.json"
[ -f "$CONFIG" ] || { echo "Missing $CONFIG"; exit 1; }

SUPABASE_URL="$(python3 -c "import json;print(json.load(open('$CONFIG'))['SUPABASE_URL'])")"
ANON_KEY="$(python3 -c "import json;print(json.load(open('$CONFIG'))['SUPABASE_ANON_KEY'])")"
BASE="${SUPABASE_URL%/}"

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf '  \033[32mOK\033[0m   %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31mFAIL\033[0m %s  (%s)\n' "$1" "$2"; }
uuid() { python3 -c 'import uuid;print(uuid.uuid4())'; }

# request METHOD PATH TOKEN [BODY] [EXTRA_HEADER]
# Echoes "<http_status>\n<body>".
request() {
  local method="$1" path="$2" token="$3" body="${4:-}" extra="${5:-}"
  local args=(-s -o /tmp/gaga_body -w '%{http_code}' -X "$method" "$BASE$path"
    -H "apikey: $ANON_KEY" -H "Content-Type: application/json")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$extra" ] && args+=(-H "$extra")
  [ -n "$body" ] && args+=(--data "$body")
  local status; status="$(curl "${args[@]}")"
  echo "$status"; echo "$(cat /tmp/gaga_body)"
}
status_of() { echo "$1" | head -1; }
body_of()   { echo "$1" | tail -n +2; }

echo "GaGa backend probe → $BASE"
echo

echo "== Auth =="
STAMP="$(date +%s)"
SIGNUP_A="$(request POST /auth/v1/signup "" "{\"email\":\"probe-a-$STAMP@gaga.test\",\"password\":\"Probe!$STAMP\",\"data\":{\"display_name\":\"Probe A\"}}")"
A_STATUS="$(status_of "$SIGNUP_A")"
A_TOKEN="$(body_of "$SIGNUP_A" | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)"
A_ID="$(body_of "$SIGNUP_A" | python3 -c "import sys,json;print(json.load(sys.stdin).get('user',{}).get('id',''))" 2>/dev/null)"
[ "$A_STATUS" = "200" ] && ok "signup user A" || bad "signup user A" "HTTP $A_STATUS"

SIGNUP_B="$(request POST /auth/v1/signup "" "{\"email\":\"probe-b-$STAMP@gaga.test\",\"password\":\"Probe!$STAMP\",\"data\":{\"display_name\":\"Probe B\"}}")"
B_TOKEN="$(body_of "$SIGNUP_B" | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)"
B_ID="$(body_of "$SIGNUP_B" | python3 -c "import sys,json;print(json.load(sys.stdin).get('user',{}).get('id',''))" 2>/dev/null)"
[ -n "$B_TOKEN" ] && ok "signup user B" || bad "signup user B" "no token"

echo
echo "== Profile / users =="
R="$(request POST '/rest/v1/users?on_conflict=id' "$A_TOKEN" "{\"id\":\"$A_ID\",\"name\":\"Probe A\",\"username\":\"probe_a_$STAMP\"}" 'Prefer: resolution=merge-duplicates,return=minimal')"
st="$(status_of "$R")"; { [ "$st" = "201" ] || [ "$st" = "200" ] || [ "$st" = "204" ]; } && ok "users upsert" || bad "users upsert" "HTTP $st $(body_of "$R" | head -c 120)"
R="$(request GET "/rest/v1/users?select=id,name&id=eq.$A_ID" "$A_TOKEN")"
[ "$(status_of "$R")" = "200" ] && ok "users select" || bad "users select" "HTTP $(status_of "$R")"

echo
echo "== Chats =="
CHAT_ID="dm_probe_$STAMP"
R="$(request POST '/rest/v1/chats' "$A_TOKEN" "{\"id\":\"$CHAT_ID\",\"type\":\"direct\",\"participants\":[\"$A_ID\",\"$B_ID\"]}" 'Prefer: return=minimal')"
[ "$(status_of "$R")" = "201" ] && ok "chats insert" || bad "chats insert" "HTTP $(status_of "$R") $(body_of "$R" | head -c 120)"
R="$(request GET "/rest/v1/chats?select=id,participants&participants=cs.%7B$A_ID,$B_ID%7D" "$A_TOKEN")"
[ "$(status_of "$R")" = "200" ] && ok "chats find_direct" || bad "chats find_direct" "HTTP $(status_of "$R")"

echo
echo "== Messages =="
# The privacy guard blocks DMs between strangers by design (MESSAGE_NOT_ALLOWED).
# Assert the guard, then open B's inbox to EVERYONE and assert the happy path —
# exactly the two branches the app handles.
LOCAL_ID="probe-$STAMP"
R="$(request POST '/rest/v1/messages' "$A_TOKEN" "{\"chat_id\":\"$CHAT_ID\",\"sender_id\":\"$A_ID\",\"type\":\"text\",\"content\":\"hello from probe\",\"local_id\":\"$LOCAL_ID\"}" 'Prefer: return=minimal')"
st="$(status_of "$R")"; body="$(body_of "$R")"
if [ "$st" = "201" ] || [ "$st" = "200" ] || [ "$st" = "204" ]; then
  ok "messages insert (allowed)"
elif [ "$st" = "403" ] && echo "$body" | grep -q MESSAGE_NOT_ALLOWED; then
  ok "messages insert blocked by privacy guard (by design)"
else
  bad "messages insert" "HTTP $st $(echo "$body" | head -c 140)"
fi
R="$(request POST '/rest/v1/rpc/gaga_save_privacy' "$B_TOKEN" '{"patch":{"messages":"EVERYONE"}}')"
[ "$(status_of "$R")" = "200" ] && ok "gaga_save_privacy" || bad "gaga_save_privacy" "HTTP $(status_of "$R") $(body_of "$R" | head -c 120)"
R="$(request POST '/rest/v1/messages' "$A_TOKEN" "{\"chat_id\":\"$CHAT_ID\",\"sender_id\":\"$A_ID\",\"type\":\"text\",\"content\":\"hello from probe\",\"local_id\":\"$LOCAL_ID\"}" 'Prefer: return=minimal')"
st="$(status_of "$R")"; { [ "$st" = "201" ] || [ "$st" = "200" ] || [ "$st" = "204" ]; } && ok "messages insert (allowed path)" || bad "messages insert (allowed path)" "HTTP $st $(body_of "$R" | head -c 140)"
R="$(request GET "/rest/v1/messages?select=id&chat_id=eq.$CHAT_ID&local_id=eq.$LOCAL_ID" "$A_TOKEN")"
[ "$(status_of "$R")" = "200" ] && ok "messages by local_id" || bad "messages by local_id" "HTTP $(status_of "$R")"

echo
echo "== Auxiliary tables =="
NOW_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
for spec in \
  "chat_reads:{\"chat_id\":\"$CHAT_ID\",\"user_id\":\"$A_ID\",\"last_read_at\":\"$NOW_ISO\"}" \
  "call_history:{\"id\":\"$(uuid)\",\"chat_id\":\"$CHAT_ID\",\"caller_id\":\"$A_ID\",\"callee_id\":\"$B_ID\",\"type\":\"voice\",\"status\":\"ringing\"}" \
  "typing:{\"chat_id\":\"$CHAT_ID\",\"user_id\":\"$A_ID\",\"is_typing\":true}" \
  "presence:{\"user_id\":\"$A_ID\",\"is_online\":true,\"last_seen\":\"$NOW_ISO\",\"updated_at\":\"$NOW_ISO\"}" ; do
  table="${spec%%:*}"; payload="${spec#*:}"
  R="$(request POST "/rest/v1/$table" "$A_TOKEN" "$payload" 'Prefer: return=minimal,resolution=merge-duplicates')"
  st="$(status_of "$R")"
  { [ "$st" = "201" ] || [ "$st" = "200" ] || [ "$st" = "204" ]; } && ok "$table insert" || bad "$table insert" "HTTP $st $(body_of "$R" | head -c 140)"
done

# notifications are server-authored: the client only reads and marks them read.
R="$(request GET "/rest/v1/notifications?select=id&user_id=eq.$B_ID&limit=1" "$A_TOKEN")"
[ "$(status_of "$R")" = "200" ] && ok "notifications select" || bad "notifications select" "HTTP $(status_of "$R")"

echo
echo "== Call RPCs (existence) =="
# Each RPC is called with its real argument names. A missing function answers
# 404 PGRST202; an existing one answers 200 (allowed), 403 (service-role only)
# or 400 (bad args) — all of which prove the signature is present.
declare -A RPC_ARGS=(
  [gaga_create_call]="{\"p_chat_id\":\"x\",\"p_callee_id\":\"$(uuid)\",\"p_type\":\"voice\",\"p_caller_id\":\"$A_ID\",\"p_request_id\":\"$(uuid)\"}"
  [gaga_can_call]="{\"callee\":\"$B_ID\"}"
  [gaga_validate_call]="{\"call_id\":\"$(uuid)\",\"caller\":\"$A_ID\",\"incoming\":false}"
  [gaga_touch_call]="{\"p_call_id\":\"$(uuid)\"}"
  [gaga_finish_call]="{\"p_call_id\":\"$(uuid)\",\"p_status\":\"ended\",\"p_duration_seconds\":0}"
)
for fn in gaga_create_call gaga_can_call gaga_validate_call gaga_touch_call gaga_finish_call; do
  R="$(request POST "/rest/v1/rpc/$fn" "$A_TOKEN" "${RPC_ARGS[$fn]}")"
  st="$(status_of "$R")"; body="$(body_of "$R")"
  if [ "$st" = "404" ] && echo "$body" | grep -q PGRST202; then
    bad "$fn exists" "404 PGRST202 (missing)"
  else
    ok "$fn exists (HTTP $st)"
  fi
done

echo
echo "== Edge Functions =="
for fn in create-call livekit-token firebase-token translate-message delete-account-secure send-fcm-push; do
  st="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/functions/v1/$fn" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $A_TOKEN" -H 'Content-Type: application/json' --data '{}')"
  if [ "$st" = "404" ]; then bad "$fn deployed" "404 not found"; else ok "$fn deployed (HTTP $st)"; fi
done

echo
echo "---------------------------------------------"
printf '  %d OK, %d FAIL\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
