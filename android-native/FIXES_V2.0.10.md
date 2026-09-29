# GaGa Chat v2.0.10 Fix Set

## Android source fixes
- Production Supabase endpoint switched to `fcjgbbmfqdkucfpqjxae.supabase.co` (the current GaGa project).
- Call history DTO aligned with live schema: `chat_id`, `room_id`, `started_at` are real columns.
- Call duration conversion fixed: server seconds <-> Android milliseconds.
- Outgoing calls now create the durable call through authenticated `create-call` Edge Function instead of blind direct inserts.
- Failed ZEGO invitation no longer leaves a call row stuck in ringing.
- Call end reasons map to rejected/busy/missed/failed/ended more accurately.
- Incoming-call FCM payload parsing now supports `chat_id`, `caller_name`, `is_video`, `call_id`.
- Call-cancel/end pushes can dismiss the deterministic incoming-call notification.
- Deep-link routing now understands the backend FCM field names.
- Current FCM token is re-registered after login/session restore, not only on `onNewToken`.
- Google Services Gradle plugin is applied automatically when `app/google-services.json` is present; missing config emits a build warning instead of silently pretending push is ready.
- Version bumped to 2.0.10 / versionCode 12.

## Live Supabase fixes deployed
- `create-call` v32: authenticated caller, membership/block/busy checks, canonical call ID + room ID, `room_id` + `chat_id` persisted, Android FCM fast path added.
- `send-fcm-push` v29: uses `user_devices.push_token` and `revoked_at`, matching the Android device-token table.
- `zego-token` v49: room authorization now resolves by canonical `call_history.room_id` and supports active call states.
- `zego-callback` v24: resolves call UUID by `room_id` instead of trying to reverse a stripped UUID.
- `send-message` v22: sender JWT is verified with Supabase Auth before service-role writes.

## Remaining external build input
A production `app/google-services.json` for the GaGa Chat Firebase Android app is still required for real FCM delivery. It was not present in the uploaded source archive. Do not substitute the GaGa Wallet Firebase config.

The uploaded release keystore can be used only with its correct store/key passwords and alias. Those credentials were not included in the source archive or build log.

## Firebase + ZEGO token hardening (next pass)
- Added the matching `app/google-services.json` for package `gagachat.app`.
- Google Services plugin now processes Firebase config in production builds.
- Removed the hard-coded ZEGO AppSign from Android source.
- Call Kit initialization now requests a short-lived ZIM token from the authenticated `zego-token` Edge Function.
- FCM device-token registration uses `user_devices.push_token` and the backend sender reads the same table.
