#!/usr/bin/env bash
# Verify the packaged QA app itself, after assembly. This intentionally checks
# native bytecode rather than the legacy Vite project at repository root.
set -euo pipefail
APK="${1:-app/build/outputs/apk/qa/app-universal-qa.apk}"
test -f "$APK"
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
while IFS= read -r dex; do
  unzip -p "$APK" "$dex" | strings >> "$TMP"
done < <(unzip -Z1 "$APK" | grep -E '^classes[0-9]*\.dex$')
grep -Fq 'https://api.gagachat.app/api' "$TMP" || {
  echo 'Required Alibaba API endpoint missing from packaged APK' >&2
  exit 1
}
grep -Fq 'Lcom/google/firebase/messaging/FirebaseMessaging;' "$TMP" || {
  echo 'Required Firebase Messaging client missing from packaged APK' >&2
  exit 1
}
if grep -Eiq 'supabase|postgrest|gotrue|flutter' "$TMP"; then
  echo 'Forbidden backend or framework reference found in packaged APK' >&2
  exit 1
fi
echo 'QA APK: Alibaba API endpoint + Firebase Messaging found; Supabase absent'
