#!/usr/bin/env bash
set -euo pipefail

variant="${1:?Usage: collect-artifacts.sh qa|release}"
case "$variant" in qa|release) ;; *) echo "Unsupported variant: $variant" >&2; exit 2;; esac

build_tools="$(find "${ANDROID_HOME:?ANDROID_HOME is required}/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)"
test -x "$build_tools/apksigner"
test -x "$build_tools/aapt2"

destination="dist/$variant"
mkdir -p "$destination"
mapfile -t apks < <(find "app/build/outputs/apk/$variant" -type f -name '*.apk' | sort)
test "${#apks[@]}" -gt 0

for apk in "${apks[@]}"; do
  "$build_tools/apksigner" verify --verbose "$apk"
  # Capture badging first: piping straight into `grep -q` makes aapt2 die with
  # SIGPIPE (exit 141) once grep exits early, which `set -o pipefail` turns into
  # a spurious failure.
  badging="$("$build_tools/aapt2" dump badging "$apk")"
  grep -q "package: name='gagachat.app' versionCode='30117'" <<<"$badging"
  cp "$apk" "$destination/$(basename "$apk")"
done

if [[ "$variant" == release ]]; then
  aab="app/build/outputs/bundle/release/app-release.aab"
  test -f "$aab"
  cp "$aab" "$destination/GaGaChat-v3.1.17-release.aab"
fi

(cd "$destination" && sha256sum * > SHA256SUMS.txt)
echo "Verified ${#apks[@]} $variant APK(s)."
