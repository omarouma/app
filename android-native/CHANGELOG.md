# Changelog

All notable changes to the GaGa Chat native Android app are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project adheres to [Semantic Versioning](https://semver.org/).

## [2.0.25] — versionCode 27

Release-readiness completion: the final §11 gaps (support, appearance, about)
are closed and the §13 acceptance record is added. No behavioural changes to
messaging, calling, auth or sync.

### Added
- **Help & Support screen.** The Settings "Help" row previously opened About, so
  there was no real support surface. There is now a dedicated screen with an
  expandable FAQ (ringing, stuck messages, media, adding people, storage,
  privacy, account deletion), a one-tap **Contact support** email action, and
  shortcuts to App permissions and About.
- **Chat wallpaper in Appearance.** The wallpaper (previously reachable only from
  the in-chat menu) is now a "CHAT WALLPAPER" section in Appearance with colour
  swatches, wired through `SettingsViewModel`.
- **About screen completeness** — Rate GaGa Chat (Play Store), Contact support,
  an Open-source licences dialog, and a tappable **Copy version info** row.
- **`docs/RELEASE_ACCEPTANCE.md`** — the §13 final release acceptance checklist
  covering all 13 specification sections, with per-item status and evidence.

### Changed
- **Theme options now describe themselves** (System default / Light / Dark) with
  a short explanation of each.
- **Settings "Help" row** renamed to "Help & Support" and routed to the new
  screen; the **Me → Help & Support** row now also opens it (was About).
- Removed dead `onOpenWallet`/`onOpenMyQr` parameters from the settings hub.

## [2.0.24] — versionCode 26

Release-readiness pass: navigation consolidation, a complete settings tree, a
state-aware permissions screen, and visual polish. No behavioural regressions to
messaging, calling or auth — this release is about making every visible control
reliable and honest.

### Changed
- **Navigation consolidated to four tabs: Chats · People · Calls · Me.** The
  standalone "More" screen is removed from navigation (its route is no longer
  registered), and the bottom bar no longer treats it as a top-level tab. The
  profile tab is now labelled **Me** and *is* the account hub.
- **"Me" hub trimmed to essentials** — My QR Code, Saved Messages, Settings and
  Support (Help & Support, About GaGa). Duplicated settings rows and the Wallet
  entry were removed from Me; the full preference tree lives in Settings.
- **Settings regrouped** into Account · Privacy · Security · Notifications &
  Sounds · Data & Storage · Appearance · Language & Accessibility · Permissions ·
  Help & About. Sign out / Delete account stay red at the bottom.
- **Privacy/Security de-duplicated.** Blocked users now lives only under Privacy;
  Security is limited to device/app protection (App lock). Subtitles were made
  accurate to the features that actually exist.

### Added
- **State-aware App permissions screen.** Each permission shows a plain-text
  state — *Allowed*, *Not allowed*, *Selected photos only* (Android 14+ partial
  media access) or *Managed by Android* (notifications pre-Android 13) — with an
  icon, so status is never conveyed by colour alone. States refresh on resume.
- **Background reliability troubleshooting row**, separate from the permission
  list, explaining battery-optimisation settings and that ringing cannot be
  guaranteed while the app is force-stopped.
- **Open app settings** action for permanently-denied permissions.

### Changed (visual)
- Compact list rows (56dp min height, 8dp vertical padding) while keeping an
  accessible ≥48dp touch target; subtitles use a medium weight for stronger
  legibility.
- One GaGa brand green (#00C300) for all non-destructive leading icons; red is
  reserved for destructive actions.

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
