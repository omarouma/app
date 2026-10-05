# Changelog

All notable changes to the GaGa Chat native Android app are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project adheres to [Semantic Versioning](https://semver.org/).

## [2.0.27] — versionCode 29

Final chat build: reliable messaging, complete media handling and a working
LiveKit call invitation / ringing flow. The **missing calling sound (the release
blocker) is fixed.**

### Fixed
- **In-app call sounds.** The app previously relied on the notification-channel
  sound, which only fires once, does not play while the app is foregrounded, and
  did not exist at all for outgoing calls. A new `CallSoundPlayer` plays a
  **looping incoming ringtone** and an **outgoing ringback tone** for the whole
  ring, respecting system volume, silent / vibrate-only / Do-Not-Disturb and
  transient audio focus, and stopping exactly once on every terminal path
  (accept, reject, cancel, timeout, connect, end, ViewModel clear).
- **Call history is actionable.** Tapping a call card in a chat now calls the
  peer back (audio or video).
- **Photo attachments show their size and kind** behind the "Tap to load"
  prompt, matching the video bubble.

### Added
- Bundled ring assets `res/raw/gaga_ringtone.wav` and `res/raw/gaga_ringback.wav`.
- **Call sounds** and **Call vibration** toggles under Settings → Notifications.

## [2.0.26] — versionCode 28

Calling stack replaced: **ZEGOCLOUD Call Kit is removed and LiveKit (WebRTC SFU)
takes over audio and video calls.** Signalling is now our own Supabase Realtime
broadcast channel, and call access tokens are minted server-side, so no calling
credential ships inside the APK.

### Changed
- **Media transport is now LiveKit** (`io.livekit:livekit-android:2.29.0`). The
  ZEGOCLOUD Call Kit / ZIM / Express dependency, its Maven repository
  (`maven.zego.im`), its forced MMKV pin and its ProGuard keeps are all gone.
- **Call signalling is ours.** LiveKit is a pure SFU with no notion of "ringing",
  so the invite / ring / accept / reject / busy / hang-up handshake now travels
  over Supabase Realtime broadcast on two topics: `call:user:<userId>` (a
  personal invite inbox, joined for the life of the session) and `call:<callId>`
  (per-call room, joined by both parties).
- **Authorisation is server-side.** The new `livekit-token` Supabase Edge
  Function authenticates the caller, verifies they are a participant of a live
  call, and mints a short-lived room-scoped LiveKit JWT. The **LiveKit API secret
  never ships in the APK** — the client only ever holds a token it cannot reuse
  for another room or after it expires. `zego-token` is deleted.
- **The app now owns its FCM entry point.** ZEGOCLOUD's Call Kit shipped the
  `FirebaseMessagingService` and forwarded ordinary pushes through a private
  broadcast action. That is replaced by `GagaFirebaseMessagingService` plus a
  testable `PushHandler`; `GagaPushReceiver` and the
  `com.zegocloud.zegouikit.call.fcm` intent filter are removed.
- **In-call UI is our own.** The old screen only *launched* a prebuilt call UI.
  The call surface now renders the remote video, the local camera preview, peer
  identity, live duration and mute / speaker / camera-flip / hang-up controls
  directly on LiveKit's `SurfaceViewRenderer`.
- **Talk time is measured from answer, not from dialling.** The duration timer
  starts only once a remote participant is actually in the room, so ring time is
  no longer billed as talk time (this is what produced the misleading
  "Voice call · 0m 0s" history rows).
- **A caller who leaves no longer strands the other side** in a dead room: a
  remote participant disappearing ends the call after a short grace period.
- **Deep links now route to calls properly.** `gagachat://call/<conversationId>
  ?callId=<id>&video=<bool>` opens the *incoming* call surface; the pending deep
  link is observed as state, so a warm-start notification tap and a live
  foreground invite both route (previously it was read once at composition).
  A call link can still never originate an outgoing call.

### Added
- `LiveKitCallManager` — the single wrapper around the LiveKit SDK (room
  lifecycle, track publication, renderers, audio routing, peer state).
- `CallSignalingCoordinator` — the Realtime invite/ring/accept/reject/hang-up
  layer that replaces ZIM.
- `supabase/functions/livekit-token/index.ts` — token minting plus the best-effort
  data-only incoming-call push that wakes a backgrounded device.
- Incoming-call route (`call/incoming?...`) with its own ringing surface, and a
  `livekit-token` section in `supabase/BACKEND_SETUP.md`.

### Removed
- ZEGOCLOUD Call Kit, ZIM, Express, MMKV, `maven.zego.im`, `ZegoCallManager`,
  `zego-token`, and every ZEGO-specific ProGuard rule and licence line.
- The leftover `app_id` (ZEGO AppID) field on `CreateCallResponse`; the call
  record is now fully described by `call_id`, `room_id`, `status`, `caller_id`,
  `callee_id` and `call_type`.

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
