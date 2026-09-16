#!/usr/bin/env bash
# Offline installation/lifecycle smoke test only. Does not validate backend services.
set -euo pipefail
apk="${1:?Usage: emulator-smoke.sh APK}"
report="android/device-smoke"
mkdir -p "$report"
adb wait-for-device
adb logcat -c
trap 'adb logcat -d -v threadtime > "$report/logcat.txt"; adb shell dumpsys activity activities > "$report/activities.txt"' EXIT
adb install -r "$apk"
# Lifecycle smoke runs with notifications granted. Permission UX needs separate tests.
sdk="$(adb shell getprop ro.build.version.sdk | tr -d '\r')"
if (( sdk >= 33 )); then
  adb shell pm grant gagachat.app android.permission.POST_NOTIFICATIONS
fi
launch() {
  adb shell am start -W -n gagachat.app/app.gagachat.mobile.ui.AuthActivity > "$report/launch-$1.txt"
  for attempt in {1..20}; do
    if adb shell pidof gagachat.app >/dev/null; then break; fi
    sleep 1
  done
  adb shell pidof gagachat.app >/dev/null
  sleep 2
  adb shell uiautomator dump /sdcard/gaga-smoke.xml >/dev/null
  adb pull /sdcard/gaga-smoke.xml "$report/ui-$1.xml" >/dev/null
  grep -q 'package="gagachat.app"' "$report/ui-$1.xml"
  adb exec-out screencap -p > "$report/screen-$1.png"
}
launch initial
adb shell settings put system accelerometer_rotation 0
adb shell settings put system user_rotation 1
launch rotated
adb shell input keyevent KEYCODE_HOME
launch resumed
adb shell settings put system user_rotation 0
adb shell am force-stop gagachat.app
launch restarted
adb logcat -d -b crash > "$report/crashes.txt"
if grep -q 'Process: gagachat.app' "$report/crashes.txt"; then
  echo 'Application crash detected' >&2
  exit 1
fi
printf 'PASS: APK install, launch, rotation, foreground resume and cold restart. Backend/auth/calls not tested.\n' > "$report/RESULT.txt"
