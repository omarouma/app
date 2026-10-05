# GaGa 2.0.28 call repair

Repository: omarouma/app. Base: f68b3d9e800f5d27b7509aa8908eceb4e0f29762.
Repair branch: codex/gaga-livekit-call-repair. Source is published for CI validation and review; production release still requires the matching signing key and physical-device testing.

## Implemented changes

| Problem | Repair |
| --- | --- |
| Supabase broadcast channels omitted the Phoenix `realtime:` prefix. | Prefix outgoing channel joins, leaves and token-refresh frames; normalize incoming topics for the existing coordinator. Postgres topics retain their existing format. |
| Caller sends to an inbox it has never joined; immediate signals can be dropped. | Publish through Supabase's authenticated HTTP broadcast endpoint. Publication no longer depends on the caller's socket membership. Network errors are bounded and logged. This remains best-effort delivery. |
| FCM callback returns before asynchronously posting a call notification. | Complete the lightweight settings read and notification post within the FCM worker callback, with a four-second limit. |
| Incoming notification can remain indefinitely when the UI never opens. | Expire it after 45 seconds. |
| Answer/reject/failure can leave timers, sound or a room active. | Centralize failure cleanup; cancel setup jobs; disconnect on reject/busy; ignore local disconnect callbacks already handled by the UI. Prevent repeated answer taps and incoming-invite timer resets. |
| Accepted call joins an empty SFU room and never leaves “Connecting.” | Give peer arrival a 45-second deadline, and switch an accepted outgoing call from its no-answer timer to that connection deadline. |
| Slow token request or room connection can leave “Connecting” indefinitely. | Bound token requests to 15 seconds and room connection to 20 seconds. Bound conversation lookup and call creation too; surface a retryable error. |
| Ringback competes with LiveKit's initial audio-focus request; suspended preference reads can restart an obsolete ringtone. | Start ringback after the SDK acquires communication audio; incoming tones own ringtone focus; outgoing tones use communication signalling audio without taking focus. Generation checks prevent obsolete playback; vibration applies only to incoming calls. Outgoing ringback uses call audio even when the phone's incoming ringer is in silent/vibrate mode, subject to the in-app sound preference. |
| Android sends `rejected`, which the live database rejects. | Persist `declined` while retaining the Android domain status. Duration remains stored in seconds. |
| Connected calls stay `ringing` in server history. | Persist `connected` when a remote participant appears. A conditional update cannot revive a completed row. |
| Token function reads callee push tokens under the caller's own permissions, yielding no devices. | Remove this obsolete duplicate path. Call creation already dispatches privileged `create-call → send-fcm-push` notifications. Token requests no longer perform push/device operations. |
| Backend denies token recovery for connected calls older than two minutes. | Keep a 120-second limit for unanswered calls; permit connected-call recovery up to 24 hours. Room access remains restricted to authenticated participants. |
| Fresh build compiles identical KSP round and final Hilt Java files twice. | Exclude only a round copy with an identical final copy from javac; keep unique generated sources. |
| Repair workflow uses old artifact names and an outdated signing fingerprint. | Test token authorization and Android call-history contracts; derive filenames from app version; match the supplied 2.0.27 signing certificate before signing; retain unsigned outputs if its key is unavailable. |

App version is now 2.0.28, versionCode 30. Minimum Android version and ARM ABI support are unchanged.

## Backend deployment

Supabase GaGa project `fcjgbbmfqdkucfpqjxae`: `livekit-token` version 6 is active.
The gateway JWT setting remains disabled as before; the function itself validates the bearer session through Supabase Auth and verifies call participation before minting any token.
No database policies, Firebase rules, stored messages, media or web hosting assets were modified.

## Verification

- Nine Node tests cover unauthenticated access, identity impersonation, unknown calls, nonparticipants, completed calls, stale ringing calls, long connected calls, abandoned connected rows, Android identity formatting, room grants and token signatures.
- Deployed unauthenticated token request returned HTTP 401.
- Live Supabase check on a random temporary test channel: prefixed channel join succeeded, and an HTTP broadcast reached its WebSocket receiver without the publisher joining it. No user inbox was targeted.
- Uploaded Firebase Android app ID and package match the repository's build configuration.
- Seven Android tests passed: four messaging regressions, two call-history contracts, and one accepted-call peer-arrival deadline test. The call test verifies cleanup at 45 seconds. Together with the nine backend tests, 16 tests passed.
- Final release APK and AAB built successfully after the peer-arrival change: `BUILD SUCCESSFUL in 21m 2s`, 543 tasks (13 executed, 530 up-to-date).
- APK metadata verified: gagachat.app, version 2.0.28, versionCode 30, minSdk 26 and targetSdk 35. APK and AAB are unsigned; verification confirmed that neither has a release signature.
- The environment restarted before final packaging; JDK, Gradle and Android SDK were restored and the final build rerun. The preserved Android XML test reports are included, and the backend tests were rerun successfully.
- The source patch applies cleanly to the repository base and passes `git diff --check`. The CI YAML parses and its shell steps pass `bash -n`.

Commands:

```sh
node --test supabase/functions/livekit-token/tests/token.test.mjs
python3 android-native/ci/prepare.py
cd android-native
gradle --no-daemon --no-build-cache --max-workers=2 -Pksp.incremental=false \
  :core:network:testReleaseUnitTest :core:data:testReleaseUnitTest :feature:calls:testReleaseUnitTest \
  :app:assembleRelease :app:bundleRelease
```

Use JDK 17, Gradle 8.11.1 and Android SDK 35/build-tools 34.0.0.

## Required release checks

1. Use the same signing key as the uploaded 2.0.27 APK. Its SHA-256 certificate fingerprint is `f3eab57a0acda4d380681056d325503180e0f7185cd8773a7887a8048e207cc2`. An unsigned APK cannot be installed; a different key cannot upgrade that installation.
2. Test on two physical phones with distinct accounts: foreground, background, locked screen and normal process removal. Verify incoming notifications and microphone permissions on each device. Android force-stop prevents normal delivery until the user reopens the app.
3. Verify ringtone, ringback, reject, caller cancellation, no-answer timeout, duplicate invites, network loss and a call longer than three minutes; confirm bidirectional audio, speaker/earpiece and Bluetooth, plus video where supported.
4. Verify each logged-in device registers a current FCM token. The inspected database contained four device rows but only two with push tokens. Server Firebase credentials and actual delivery have not been proven by a two-device test.
5. Public broadcast signalling remains a security limitation: sender IDs are checked locally but are not cryptographic proof. Before broad release, migrate call signalling to private authorized channels or a server-authoritative authenticated signalling path. Media-room token authorization is already enforced.
6. Background ringing still depends on Android notification/full-screen behavior and channel settings. This repair does not add Telecom integration or an ongoing foreground call service.
7. Rotate the LiveKit API secret previously posted in conversation; update the server secret only. Never put it or the Firebase service-account key in Android, GitHub source, website code or public artifacts.

## References

- https://supabase.com/docs/guides/realtime/protocol
- https://supabase.com/docs/guides/realtime/broadcast
- https://firebase.google.com/docs/cloud-messaging/android/receive-messages
- https://firebase.blog/posts/2025/04/fcm-on-android/
