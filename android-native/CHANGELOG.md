# Changelog

All notable changes to the GaGa Chat native Android app are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project adheres to [Semantic Versioning](https://semver.org/).

## [2.7.1] — versionCode 46

**Settings Center functional-wiring release (Master Spec §8).** The Settings
Center previously persisted all 100+ controls to DataStore but nothing in the app
ever read them back — every switch was cosmetic. This release closes the loop
end-to-end for the P0 privacy and consumer keys by following the mandated
pipeline: **Preference → Storage → Functional Consumer → Backend Enforcement →
Test**.

### Added
- **`SettingsCenterPreferences`** — a typed facade over the generic
  `ExpandedSettingsPreferences` store that exposes each wired setting as a
  strongly-typed `Flow<Boolean>` and routes privacy toggles through the
  authoritative `AccountPrivacy` bridge (`gaga_get_privacy` / `gaga_save_privacy`
  RPCs). A `seedDiscoveryFromServer()` routine mirrors the server's privacy policy
  into the local store on Settings Center open, so the UI always reflects the
  value the backend actually enforces.
- **`SettingsToggleStore`** and **`AccountPrivacyController`** seams so consumers
  can be unit-tested without Android `DataStore`, with Hilt `@Binds` wiring the
  existing singleton implementations.

### Fixed
- **Privacy toggles are now enforced, not just stored (Backend Enforcement).**
  `people.searchable.username/phone/email`, `chats.typingIndicator` and
  `ai.priorityRecommendations` now write through to the server-side
  `user_settings.privacy_settings` JSONB (`discover_id`, `discover_phone`,
  `discover_email`, `typing_indicator`, `recommendations`), which the
  `gaga_profiles` discovery projection and RLS policies read. Turning a toggle off
  now actually removes the field from search/discovery server-side.
- **"Upload media on Wi-Fi only" and "Data saver" now gate uploads.** The durable
  media-upload queue (`MediaRepository.drainQueue`) consults `NetworkMonitor` and
  leaves every row queued when the active network is metered and either policy is
  on — so no cellular data is spent, and WorkManager retries once back on Wi-Fi.
- **"Enter to send" is honoured.** `MessageComposer` now switches the keyboard
  IME action between *Send* and *New line* based on `chats.enterToSend`.
- **"Link previews" and "Typing indicator" are honoured.** `ChatViewModel` skips
  link-preview fetches and typing broadcasts when the corresponding toggles are
  off.

### Tests
- Added `SettingsCenterPreferencesTest` (6 cases: default parity, local+server
  writes, server enforcement, seeding, failure tolerance, deferral truth table)
  and `MediaUploadNetworkPolicyTest` (metered deferral vs. unmetered drain).
  Full unit suite: **82 tests, 0 failures** across `core:model`, `core:network`,
  `core:data`, `feature:calls` and `feature:chat`.

## [2.7.0] — versionCode 45

**Friends, Calls & GaGa Today correctness release.** Applies the product
specification's P0 tracker items on top of the 2.6.0 rebuild: the friend-request
lifecycle is now atomic and consistent across both accounts, the call-state
heartbeat no longer drops a connected/reconnecting call, and GaGa Today surfaces
backend failures as errors instead of masking them as empty data.

### Fixed
- **Friend request lifecycle (FR-02..FR-06, FR-08).** Accept/decline/cancel now
  go through three new atomic, `security definer` RPCs
  (`gaga_accept_friend_request`, `gaga_decline_friend_request`,
  `gaga_cancel_friend_request`) that validate the caller, honour blocks, are
  idempotent on replay, and insert **both** friendship edges in one transaction —
  so two separate accounts always see a consistent request/friendship state
  without manual intervention. When the RPCs are absent (older backend) the
  client transparently falls back to the legacy REST path.
- **Decline status mismatch.** The legacy fallback previously wrote `"declined"`,
  which the backend guard rejected; it now writes the canonical `"rejected"`.
- **Request-status mapping.** `"rejected"` now maps to `DECLINED` (and
  `"canceled"` to `CANCELLED`) instead of silently falling through to `PENDING`.
- **Call state heartbeat (CALL-08).** `markCallConnected` now accepts the
  `accepted`/`connected`/`reconnecting` states as well as
  `calling`/`ringing`/`connecting`, mirroring the server-side `gaga_touch_call`
  guard, so a reconnecting call is no longer torn down by its own heartbeat.
- **GaGa Today error surfacing (§6).** A split-bills backend failure now renders
  an explicit error card with Retry (and a Today home tile) instead of being
  displayed as an empty "No split bills yet" state.

### Added
- `supabase/migrations/20261014000000_friend_request_lifecycle_rpcs.sql` — the
  atomic friend-request lifecycle RPCs (idempotent, block-aware, both-edge
  insert), for CI/operator application.
- `RpcAvailability` — detects a missing PostgREST function (PGRST202) so the
  client degrades gracefully on backends that predate the new RPCs.
- Unit tests: `FriendRequestLifecycleContractTest` (6), `FriendRequestLifecycleTest`
  (9) plus an updated `CallHistoryContractTest`.

### Build
- versionCode **45** · versionName **2.7.0** · `applicationId` `gagachat.app`
- minSdk 26 · targetSdk 35 · compileSdk 35 · ABIs `arm64-v8a`, `armeabi-v7a`
- Signed release APK (v2 + v3) and AAB produced; full unit suite green.

## [2.6.0] — versionCode 44

**Consolidated rebuild.** Every improvement from the 2.4.0 consolidation and the
2.5.0 startup/onboarding wave is rebuilt together into a single, canonical 2.6.0
artifact, with the codebase modernised (no deprecated Compose Material icons).

### Changed
- **Rebuilt with the full public backend configuration.** `ci/prepare.py`
  regenerates `app/google-services.json` from `ci/backend-public.json` so the
  Firebase project (`oumagachat`, sender `545448312835`) is wired exactly as in
  the Firebase console, and `local.properties` carries the Supabase URL/key.
- **Compose Material icon modernisation.** All 29 uses of deprecated
  `Icons.Filled.*` / `Icons.Default.*` icons were migrated to their
  `Icons.AutoMirrored.Filled.*` equivalents across 14 files (chat, home, profile,
  settings, wallet, groups, dailylife, onboarding, auth). This restores correct
  RTL mirroring and removes every Compose icon deprecation warning.

### Carried forward
- 2.5.0 startup & onboarding funnel (Welcome → Introduction → Sign up/Log in →
  Verification → Profile → Privacy → Permissions → Welcome to GaGa!).
- 2.4.0 Settings Center V2.0, chat-to-action drafts, call-screen upgrade,
  profile cover video, chatroom sprints A/B/C.
- 2.3.0 GaGa Circles, GaGa Safe, Language Bridge, Lite Mode.

### Build
- versionCode **44** · versionName **2.6.0** · `applicationId` `gagachat.app`
- minSdk 26 · targetSdk 35 · compileSdk 35 · ABIs `arm64-v8a`, `armeabi-v7a`
- Signed release APK (v2 + v3) and AAB produced; full unit suite green.

## [2.4.0] — versionCode 42

**Consolidation release.** Every improvement branch is merged into `main`; this
is the single, canonical 2.4.0 build. It carries the Settings Center, the
chat-to-action drafts, the profile cover video and the real call-screen upgrade
on top of the 2.3.0 Circles / Safe / Lite Mode / Language Bridge wave.

### Added
- **Settings Center V2.0.** The settings surface expands to **30 searchable
  categories**, each with a real destination or an honest, clearly-labelled
  state, replacing the previous flat list.
- **Chat-to-action drafts (GaGa Today).** Long-press a message to turn it into a
  task, reminder, event or expense; the editor opens pre-filled and stores
  **exactly once** behind an "Add to GaGa Today?" confirmation. Dismissing the
  dialog creates nothing.
- **Profile cover video.** A looping cover clip on the profile, using the same
  compression / upload pipeline as avatars.
- **Call-screen upgrade.** Real LiveKit media controls, an audio-device picker,
  picture-in-picture, on-screen diagnostics and actionable 403 messaging.
- **Backend call-lifecycle RPCs** and a reproducible `send-fcm-push` edge
  function, so call admission and push delivery are server-authoritative.

### Changed
- Chatroom **Sprint A / B / C**: accurate delivery receipts and call-event
  statuses, per-type upload caps (image 25 MB · video 100 MB · audio 25 MB ·
  document 50 MB) and save-to-device for documents.
- Media render states are unified so overlapping video / media lifecycle labels
  no longer clash.

### Fixed
- Profile cover compression build (missing `ByteArrayOutputStream` import).
- Chat Translate action icon (`Icons.Filled.Language`) so the action compiles.
- Call-screen unit-test regression; the Supabase publishable key is wired.

## [2.3.0] — versionCode 41

Consolidates every improvement on top of 2.2.1 and adds the next wave of
signature features, all wired to the live backend.

### Added
- **GaGa Circles.** Groups carry a **circle type** — General, Family, Friends,
  Class, Work, Business — that decides which structured tools are surfaced
  around the _same_ secure group chat. The transport is never forked; a circle
  only changes the tools around the conversation. Circle picker on create / edit,
  a circle badge in the groups list, and a new `circle_type` column with
  circle-aware create / update RPCs.
- **GaGa Safe.** Trusted contacts with priority ordering, a timed **safe
  check-in** with a background worker that fires the due alert, **safe arrival**
  and **SOS** resolution with owner-only escalation, and a "GaGa Safe" card on
  the Today / Daily Life screen.
- **Language Bridge (Translate).** Long-press any message → **Translate**, powered
  by a new `translate-message` edge function: 16 target languages, auto source
  detection, a clear cloud-processing disclosure and a graceful "not configured"
  state.
- **Lite Mode.** One switch that reduces real network use — auto-download of
  media is disabled and heavy sync is deferred while it is on.

### Fixed
- Group create / update falls back to the original RPC signature when the live
  project has not yet applied the circles migration, so **group creation keeps
  working everywhere**.
- Cancellation-safe repository calls and the `mark_chat_read` migration folded in.

## [2.2.1] — versionCode 39

Split-bill and location Smart Actions.

### Added
- **Shared split bills.** Detect a split bill in chat, create it from a dedicated
  dialog, and track it in GaGa Today; shares are bounded before aggregation and
  the detected currency is carried through.
- **Location actions.** Detect and map locations locally, then surface them as
  chat actions.

## [2.2.0] — versionCode 38

Smart Actions and a richer Today dashboard.

### Added
- **Smart Actions.** Chat messages are analysed locally for tasks, reminders,
  events and expenses, and offered as one-tap actions.
- **Richer GaGa Today dashboard** with the new event and action surfaces.

## [2.1.0] — versionCode 37

### Added
- **GaGa Today + Action Messages MVP.** The first cut of turning a chat message
  into a structured Today item, with server-confirmed storage.

## [2.0.28] – [2.0.34]

Reliability wave between the LiveKit migration and the Today features.

### Fixed
- **LiveKit call delivery, sounds and connection timeouts** (2.0.28): reliable
  ringing, looping ringtone / ringback and a bounded connection timeout.
- **Account privacy enforcement** (2.0.29): per-recipient message policy
  (EVERYONE / FRIENDS / REQUESTS) and blocking, enforced server-side.
- **LiveKit media controls and photo review** (2.0.30).
- **Native Daily Life** (2.0.31): bookkeeping, reminders and shared shopping.
- **Daily-life screens, navigation and server-confirmed feedback** (2.0.32).
- **LiveKit room lifecycle isolation** and bounded media controls (2.0.33).
- **Backend hardening and chatroom reliability** (2.0.34): call-history sync
  failures propagate so refresh can show retry feedback, device-local
  call-history removal persists across refresh without deleting peer records,
  and unacknowledged record edits are rejected with clear busy / error feedback.

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
