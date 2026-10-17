#!/usr/bin/env bash
# Continue independent modules after a failure and collect screenshots before
# emulator shutdown. Preserve Gradle's exit code so failed tests stay failed.
set -uo pipefail
result=0
gradle -p android-native --no-daemon --max-workers=1 --continue \
  '-Dorg.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=2048m -Dfile.encoding=UTF-8' \
  -Pandroid.injected.androidTest.leaveApksInstalledAfterRun=true \
  :core:ui:connectedDebugAndroidTest \
  :feature:dailylife:connectedDebugAndroidTest \
  :feature:chat:connectedDebugAndroidTest \
  :feature:contacts:connectedDebugAndroidTest \
  :feature:profile:connectedDebugAndroidTest \
  :feature:calls:connectedDebugAndroidTest \
  :feature:qr:connectedDebugAndroidTest || result=$?
mkdir -p visual-checks
for package in app.gagachat.core.ui app.gagachat.core.ui.test app.gagachat.feature.dailylife.test app.gagachat.feature.chat.test app.gagachat.feature.profile.test; do
  adb pull "/sdcard/Android/data/$package/files/screenshots" "visual-checks/$package" || true
done
exit "$result"
