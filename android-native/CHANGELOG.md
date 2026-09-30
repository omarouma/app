# Changelog

All notable changes to the GaGa Chat native Android app are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project adheres to [Semantic Versioning](https://semver.org/).

## [2.0.16] — versionCode 18

### Fixed
- **Account deletion now works.** The client called the Supabase RPC
  `delete_my_account`, which does not exist on the live database, so every
  "Delete account" attempt failed with HTTP 404 (`PGRST202`). The call now
  targets the real function `delete_own_account`, which the server scopes to
  `auth.uid()` (verified live: returns `204` and removes the caller's row).
  This also satisfies the Play Store account-deletion requirement.

### Verified (live backend, end-to-end)
- **Auth:** email/password sign-up and login return valid GoTrue JWTs; the
  `on_auth_user_created` trigger auto-provisions the `users` profile row.
- **REST:** all 16 tables reachable; every column referenced by the client
  exists on the live schema.
- **Writes / RLS:** `user_devices`, `presence`, `friend_requests`,
  `friendships`, `blocked_users`, `groups`, `group_members`, `wallets`,
  `typing`, profile updates, and Storage avatar uploads all succeed under RLS.
- **Edge Functions:** `create-call` returns `{call_id, room_id, app_id:
  372536818, status:"ringing"}`; `zego-token` returns a real ZIM token
  (`appID 372536818`) for both dashed and dash-less user ids.
- **Storage:** bucket `chat-media` upload / list / public-read all pass.
- **Realtime:** WebSocket join succeeds; a live `postgres_changes` INSERT is
  received; the `broadcast` channel delivers an `offer` payload between two
  clients (WebRTC signalling path).

### Changed
- Version bumped to `2.0.16` (`versionCode 18`).
- Release build keeps R8/resource-shrinking **disabled** deliberately so the
  reflection-heavy stack (Hilt, Ktor, kotlinx-serialization, ZEGOCLOUD Call
  Kit) is never stripped — guaranteeing a working, publishable artifact.

## [2.0.15] — versionCode 17

### Fixed
- **Launch crash ("GaGa has stopped") resolved.** The Crashlytics SDK was on
  the runtime classpath but the Crashlytics Gradle plugin was never applied,
  so `FirebaseInitProvider` threw
  `IllegalStateException("The Crashlytics build ID is missing…")` during
  process start, before any UI appeared. The plugin
  (`com.google.firebase.crashlytics` 3.0.2) is now applied whenever
  `google-services.json` is present.
- **32-bit ARM launch crash prevented.** ZEGOCLOUD's Call Kit pulls in
  `com.tencent:mmkv:2.2.2`, which ships no `armeabi-v7a` native library; the
  auto-run `PrebuiltCallInitializer` then threw `UnsatisfiedLinkError`. MMKV
  is pinned to `1.3.17` (last release with `armeabi-v7a`, identical API
  surface).
- Added an early `CrashReportingInitializer` that installs the crash reporter
  before any other `ContentProvider` runs, so residual failures are captured to
  a retrievable file.

## [2.0.12] – [2.0.14]

- Attachment pipeline improvements (durable upload queue, optimistic send,
  idempotent `local_id`), chat read receipts, typing indicators, and general
  stability work.
