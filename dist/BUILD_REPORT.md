# GaGa Chat 2.0.18 — Build Report

## LATEST — Media stuck at "Preparing…": missing AndroidX Hilt compiler (ROOT CAUSE)

Reported symptom: photos/videos sent from the chatroom show the local preview but
sit forever behind a **"Preparing…"** spinner and never deliver (screenshot
`Screenshot_20261003-174128.jpg`).

### Root cause
Every WorkManager worker in `:sync:workers` is a Hilt worker (`@HiltWorker` +
`@AssistedInject`): `MediaUploadWorker`, `MessageSendWorker`, `MessageSyncWorker`,
`ConversationSyncWorker`, `PeriodicSyncWorker`, `ScheduledMessageWorker`. Hilt's
`HiltWorkerFactory` resolves them through generated `<Worker>_AssistedFactory`
classes, which are produced **only** by the AndroidX Hilt compiler
(`androidx.hilt:hilt-compiler`).

The shared `gaga.android.hilt` convention plugin added **only Dagger's** Hilt
compiler (`com.google.dagger:hilt-android-compiler`). The AndroidX compiler was
declared solely in the `app` module, which owns no workers, so **no worker assisted
factories were ever generated**. At runtime `HiltWorkerFactory.createWorker()`
could not instantiate `MediaUploadWorker`, so `MediaUploadWorker.doWork()` never
ran, `processQueue()` never drained the durable upload queue, and the optimistic
message stayed `PENDING` with `uploadProgress = 0` → the bubble rendered
"Preparing…" indefinitely.

This also silently disabled **all** background work: message retry/outbox,
conversation/message sync, periodic sync, and scheduled ("send later") messages.

Evidence: the previously shipped APK contained `MediaUploadWorker_Factory`
(Dagger) but **no** `MediaUploadWorker_AssistedFactory`, and the
`:sync:workers` KSP processor classpath contained only
`com.google.dagger:hilt-android-compiler`.

### Fix
- `build-logic/.../AndroidHiltConventionPlugin.kt`: also add
  `ksp(androidx.hilt:hilt-compiler)` so every Hilt module generates worker
  assisted factories.
- `app/build.gradle.kts`: drop the now-redundant per-module
  `ksp(libs.androidx.hilt.compiler)` (provided by the convention plugin).

### Verification
The rebuilt APK now contains all six assisted factories:
`MediaUploadWorker_AssistedFactory`, `MessageSendWorker_AssistedFactory`,
`MessageSyncWorker_AssistedFactory`, `ConversationSyncWorker_AssistedFactory`,
`PeriodicSyncWorker_AssistedFactory`, `ScheduledMessageWorker_AssistedFactory`.

### Server-side audit (Supabase + Firebase) — no blocking issues found
- **Supabase Storage**: `chat-media`/`voice-messages` (private) and
  `avatars`/`media`/`posts`/`stories`/`reels` (public) all exist. Authenticated
  upload to `chat-media/<uid>/...` → 200; signed-URL read → 200; public URL on a
  private bucket → 400 (correct); cross-user folder write → 403 (RLS correct).
  12 MB upload succeeds (bucket limit ≥ 12 MB).
- **Supabase DB**: all app tables present (`chats`, `chat_reads`, `messages`,
  `call_history`, `user_devices`, `blocked_users`, `saved_messages`,
  `group_members`, `groups`, `notifications`, `wallets`, `wallet_transactions`,
  `profiles`, `users`, `presence`, `friendships`, `friend_requests`, `typing`).
  RPC `delete_own_account` → 204. Edge function `zego-token` mints a valid ZIM
  token (200, `appID` + `zimToken`).
- **Firebase**: project `oumagachat` ACTIVE; Android app
  `1:545448312835:android:d71f67bf2c8f96f4cd8e36` (`gagachat.app`) registered;
  admin SDK key valid; FCM available. The app uses Firebase only for FCM push +
  Crashlytics (no RTDB / Firebase Auth).

### APK
`GaGa-2.0.18-mediafix-release.apk` — 94,761,034 bytes —
SHA-256 `8d0177516210996be170e49641ec19e89eeac2c8077590e992e47d2edfa5464c`,
signed v2/v3 with `CN=GaGa Chat`
(SHA-256 `d59afa7c5372c3632d58f0b31156954b5f2200871317ffaf42de305448da8663`).

## Previous — Chatroom media reliability: photo & video sending + rendering

Focus: the chatroom screen. Root-caused and fixed the long-standing "photo/video
won't send / shows broken" reports, then polished the whole media experience.
Full analysis in `android-native/AUDIT_chat_media.md`.

### 1. Photos silently corrupted on multi-select (FIXED — root cause)
`ChatViewModel.resolveUri` copied each picked `content://` Uri into the app cache
using a filename derived **only** from `System.currentTimeMillis()`
(`upload_<ts>.<ext>`). Selecting several photos for one album — or two quick
sends in the same millisecond — made every copy resolve to the *same* path, so
earlier files were clobbered before their upload began. The album then showed the
wrong image repeated, or an upload failed because the file had vanished. Cache
names are now unique (`<ts>_<8-char random>`), and the same fix is applied to the
compressed-photo path (`compressLargeImage`) and the camera capture
(`MediaPicker.takePhoto`).

### 2. Robust MIME / extension resolution (FIXED)
`contentResolver.getType(uri)` returns null for some providers, which produced
`application/octet-stream` and an object path ending `.octet-stream`; Storage then
served the wrong Content-Type and the photo/video could not render. `resolveUri`
now falls back to a MIME guessed from the Uri path (`guessMime`) and derives a
sane extension (`extensionFor`), normalising `jpeg→jpg`, `mpeg→mp3`,
`quicktime→mov`, `x-matroska→mkv`.

### 3. Broken bubbles after the OS cleared the cache (FIXED — root cause)
Every renderer preferred `message.localMediaPath` over the resolved signed URL.
Once Android reclaimed the cache directory the local file was gone, so the
sender's own photo/video rendered as a broken/blank bubble **even though a valid
signed URL existed** — the single most likely reason users reported "it didn't
send". A new `rememberExistingLocalMedia(path)` returns the local path *only while
the file still exists*, and `MediaImage`, `MediaVideo`, `AudioContent` and the
full-screen `MediaViewer` now try it first and fall back to the signed remote URL.

### 4. Videos had no preview (FIXED)
The backend derives a thumbnail from `mediaUrls[1]`, which is null for a single
video, so a video bubble was a bare grey box. `MediaRepository.processQueue` now
extracts a poster frame (`MediaMetadataRetriever.getFrameAtTime`, downscaled to
512 px) and uploads it as a sibling object (`<uploadId>_thumb.jpg`), best-effort so
a failure never fails the clip. The URL is persisted in message `metadata.thumbnail`
and read back by `DtoMappers`; `MediaVideo` shows the frame plus a duration badge.

### 5. Album grid rendered blank while uploading (FIXED)
`enqueueAlbumUpload` now stores the local copies on the optimistic row's
`mediaUrls`, so `MultiImageGrid` shows every tile instantly (with a spinner on any
tile still being signed) and an album-level upload overlay (Preparing / % / Failed).
`dispatchLocked` strips any local references from `mediaUrls` so only `http(s)`
URLs are ever sent to the backend.

### 6. Stale `mediaUrls` on single-media commit (FIXED)
`MessageDao.updateMedia` now also clears `mediaUrls`, so a single photo/video (or
an album the user reduced to one photo in the review step) never carries leftover
local paths that would flip it into grid rendering.

### 7. Video review + captions (IMPROVED)
A picked video now opens a new `VideoReviewSheet` (poster frame via Coil's
`VideoFrameDecoder`, play affordance, caption field) instead of uploading
immediately. `enqueueUpload`/`sendMedia` gained an optional `caption`, so videos
(and any single media) can carry a caption.

### 8. Data integrity
`Message.toEntity()` was dropping `scheduledAt`, so a scheduled message lost its
send time on any re-persist. Fixed.

## Build & verification
- `:app:assembleRelease` → **BUILD SUCCESSFUL** in 7m 1s (511 tasks).
- APK: `gagachat.app` · versionName **2.0.18** · versionCode **20** · minSdk 26 · targetSdk 35.
- Signed (v2/v3) with cert `CN=GaGa Chat, OU=Mobile, O=GaGa, L=Dhaka, ST=Dhaka, C=BD`
  (SHA-256 `d59afa7c5372c3632d58f0b31156954b5f2200871317ffaf42de305448da8663`).
- Artifact: `GaGa-2.0.18-chatfix-release.apk` (94,761,026 bytes),
  SHA-256 `4cc668591728f7ac6b8c41df01c184991a58770a1fbeb7de90ec39bd983e7154`.

## Source (this build)
- `feature/chat/.../presentation/ChatViewModel.kt` — collision-safe `resolveUri`,
  `guessMime`, `extensionFor`, unique compressed-photo name, `sendMedia(caption)`.
- `feature/chat/.../presentation/components/SignedMedia.kt` — `rememberExistingLocalMedia`.
- `feature/chat/.../presentation/components/MessageBubble.kt` — renderer fallbacks,
  video duration badge, grid placeholders + overlay.
- `feature/chat/.../presentation/components/MediaViewer.kt` — renderer fallbacks.
- `feature/chat/.../presentation/components/MediaPicker.kt` — unique camera name.
- `feature/chat/.../presentation/components/VideoReviewSheet.kt` (new).
- `feature/chat/.../presentation/ChatScreen.kt` — video review wiring.
- `core/data/.../repository/MediaRepository.kt` — video thumbnail, album local
  paths, caption, `updateMedia` thumbnail.
- `core/data/.../repository/MessageRepository.kt` — metadata thumbnail, local-ref filter.
- `core/data/.../mapper/DtoMappers.kt` — thumbnail from metadata.
- `core/database/.../dao/MessageDao.kt` — `updateMedia` clears `mediaUrls`.
- `core/database/.../mapper/EntityMappers.kt` — persist `scheduledAt`.

---

## This build — Cover media upload, real audio, video calling & scheduled messages

### 1. Cover photo **and** cover video upload (fixed)
The profile banner previously stored a single `cover_image` string and the uploader
could not tell a photo from a video, so cover videos silently failed (the file was
written to the image path and the UI rendered a broken image). Cover media is now a
first-class, split field:

- **Model/DB:** new nullable `coverVideo` column on `UserRow` (network DTO), `User`
  (domain model) and `UserEntity` (Room). `GagaDatabase` bumped **5 → 6** with a
  `MIGRATION_5_6` that `ALTER TABLE users ADD COLUMN cover_video TEXT`; the migration is
  registered in `DatabaseModule`. Mappers (`DtoMappers`, `EntityMappers`) carry the new
  field both ways.
- **Uploader:** `ProfileViewModel.persistCover(uid, url, isVideo)` writes
  `UserRow(id = uid, coverVideo = url)` for a video and `UserRow(id = uid, coverImage = url)`
  for a photo, so the two never overwrite each other. Because the Ktor `Json` config uses
  `explicitNulls = false`, the partial upsert updates only the intended column.
- **Rendering:** `ProfileScreen.CoverBanner(coverImage, coverVideo, onOpenVideo)` prefers
  the dedicated `coverVideo`, falls back to the photo, and tolerates legacy rows that
  stored a video URL inside `cover_image` (detected via `looksLikeVideo`). Tapping a cover
  video opens it in the full-screen player.

### 2. Real audio — voice-message playback (fixed)
Voice notes were routed through the default audio stream, so on many devices they played
over the earpiece at the wrong volume, or were treated as a ringtone/notification and
ducked. `VoicePlayback` now configures the `MediaPlayer` with
`AudioAttributes(USAGE_MEDIA, CONTENT_TYPE_SPEECH)`, so clips play through the media
stream at speech tuning with correct routing and no ducking. `MessageBubble` shows a
progress spinner while an `AudioContent` clip is preparing, so the play button no longer
looks inert during buffering.

### 3. Video calling — runtime permissions (fixed)
`ActiveCallScreen` now gates the in-call UI on the runtime permissions the call actually
needs: it computes `requiredPermissions` (camera for video calls, microphone for all
calls), launches `permissionLauncher`, waits on `permissionsResolved`, and shows an
explicit `permissionDenied` state with a path back to Settings. Previously a video call
could start with the camera permission never granted, producing a black local preview.

### 4. Scheduled messages (implemented)
The composer's schedule action was a stub. It is now a complete, durable feature:

- **Model/DB:** `Message.scheduledAt: Long?` (local-only; never serialised to the backend)
  plus a new `MessageStatus.SCHEDULED` value. `MessageEntity` gains `scheduled_at`;
  `GagaDatabase` bumped **6 → 7** with `MIGRATION_6_7` registered in `DatabaseModule`.
- **DAO:** `MessageDao` adds `getScheduled`, `getDueScheduled`, `updateScheduledAt` and
  `deleteScheduled`. The list queries deliberately have **no status filter**, so a
  scheduled row still renders in the thread (with a "Scheduled" label and a clock tick).
- **Outbox:** `OutboxScheduler` gains `enqueue`/`cancel` for scheduled sends, implemented
  by `DefaultOutboxScheduler`; a new `@HiltWorker` `ScheduledMessageWorker` calls
  `MessageRepository.dispatchScheduled(clientMessageId)` when the due time arrives.
- **Repository:** `MessageRepository.scheduleMessage(...)`, `cancelScheduled(localId)` and
  `dispatchScheduled(clientMessageId)` (interface declarations included).
- **UI:** new `ScheduleMessageDialog` (in `PollAndLiveDialogs.kt`) with native
  `DatePickerDialog`/`TimePickerDialog` and presets (In 1 hour / In 3 hours / Tonight 8PM /
  Tomorrow 9AM); confirm stays disabled until the chosen instant is in the future.
  `ChatScreen` opens it from the schedule action and calls `ChatViewModel.scheduleSend(...)`;
  `ChatViewModel.cancelScheduled(...)` removes a pending send. `MessageBubble.StatusTick`
  handles the new `SCHEDULED` state (exhaustive `when`) and `MessageMeta` shows the label.

## Build & verification
- `:app:compileReleaseKotlin` → **BUILD SUCCESSFUL** (0 errors)
- `:app:assembleRelease` → **BUILD SUCCESSFUL** (signed)
- APK: `gagachat.app`, versionCode **20**, versionName **2.0.18**, minSdk 26, targetSdk 35,
  compileSdk 35; signer DN `CN=GaGa Chat, OU=Mobile, O=GaGa, L=Dhaka, ST=Dhaka, C=BD`;
  certificate SHA-256 `D5:9A:FA:7C:53:72:C3:63:2D:58:F0:B3:11:56:95:4B:5F:22:00:87:13:17:FF:AF:42:DE:30:54:48:DA:86:63`.
- APK SHA-256 `2b1e5fcb868465fe8a45e891e44ffbf35b076e926b21dfc376505d4ff203c576` (94,744,640 bytes).

## Source
- Branch `codex/android-repair-2.0.18`.
- Files touched this build: `core/model/.../Message.kt`, `core/model/.../User.kt`,
  `core/network/.../dto/RowDtos.kt`, `core/database/.../entity/{MessageEntity,UserEntity}.kt`,
  `core/database/.../GagaDatabase.kt`, `core/database/.../dao/MessageDao.kt`,
  `core/database/.../mapper/EntityMappers.kt`, `core/database/.../di/DatabaseModule.kt`,
  `core/data/.../mapper/DtoMappers.kt`, `core/data/.../repository/MessageRepository.kt`,
  `core/common/.../sync/outbox/OutboxScheduler.kt`,
  `sync/workers/.../DefaultOutboxScheduler.kt`, `sync/workers/.../ScheduledMessageWorker.kt` (new),
  `feature/profile/.../presentation/{ProfileScreen,ProfileViewModel}.kt`,
  `feature/chat/.../presentation/{ChatScreen,ChatViewModel}.kt`,
  `feature/chat/.../presentation/components/{MessageBubble,PollAndLiveDialogs,VoicePlayback}.kt`,
  `feature/calls/.../presentation/ActiveCallScreen.kt`.

---

## Prior build (commit `33e4da4`) — Link previews, performance/accessibility/settings & verification plan (spec areas 13, 16, 17)

### 1. Link previews with SSRF protection (Area 13)
- New `LinkPreview` model (`core/model`) with `hasContent` and a `displayHost` that
  strips the leading `www.`.
- New `LinkPreviewFetcher` (`core/network`) built on OkHttp with strict timeouts
  (connect 6 s / read 8 s / call 12 s) and redirects followed manually (max 5 hops,
  each hop re-validated). It only accepts `http`/`https` and `text/html` bodies, caps
  the body at 512 KB, and parses OpenGraph / Twitter-card / `<title>` /
  `link rel=image_src` metadata with HTML-entity decoding and URL absolutisation.
- **SSRF guard:** the host is resolved with `InetAddress.getAllByName` and every
  address is rejected if it is loopback, any-local, link-local, site-local, multicast,
  or in the IPv4 `0.0.0.0/8`, `100.64/10`, `192.0.0.0/24`, `198.18/15`, `240/4` or
  IPv6 `fc00::/7` ranges; `localhost`/`.local`/`.internal`/`.home.arpa` are blocked
  outright. The fetcher never throws — failures return `null`.
- New `LinkDetector` (`core/common`) extracts the first URL from a message body.
- New `LinkPreviewRepository` (`core/data`) with a `Mutex`-guarded bounded LRU cache
  (64 entries) that caches both hits and negatives, wired through `DataModule`.
- `ChatViewModel.requestLinkPreview(url)` fetches once per URL; `MessageBubble`
  renders a `LinkPreviewCard` (image, site name, title, description) under the first
  URL in a TEXT message, tappable to open externally. `ChatScreen` threads the preview
  map through `MessageList`.

### 2. Performance, accessibility & settings (Area 16)
- **Cache budget + Clear cache:** `SettingsViewModel.refreshCacheSize()` sums the Coil
  disk cache and the app's media cache directories on the IO dispatcher and formats a
  human-readable size; the Storage screen shows it as the *"Currently using …"*
  subtitle on **Clear media cache**, and the size is recomputed after clearing.
- **Chinese locale:** `AppLanguage` now offers **English, Bengali and Chinese**
  (`zh` / 中文), mapped in `SettingsPreferences` and applied through the existing
  `AppLocaleStore` / `LocaleHelper` path.
- **Verified present and unchanged:** auto-download controls + policy
  (`MediaDownloadPolicy`), dark mode (`ThemeMode`), large fonts (`TextScale`), the
  screen-reader labels on delivery ticks and live-location state (status is never
  colour-only), message pagination (`loadOlder` + `MESSAGE_PAGE_SIZE`), and
  size-bounded image thumbnails via Coil.

### 3. Two-account verification plan (Area 17)
- Added `docs/TWO_ACCOUNT_VERIFICATION_PLAN.md`: the twelve required two-account
  tests (attachments, interrupted upload, kill/reopen, denied permissions, slow
  network, failed tiles, live-location stop/expiry, concurrent voting, unauthorised
  access, foreground/background calls, large text + mixed languages, long
  media-heavy scroll) with exact steps, the passing result, the implementing code
  path, and a result matrix.

### Build & verification
- `:core:data`, `:feature:settings`, `:app:compileReleaseKotlin` → BUILD SUCCESSFUL
- `:app:assembleRelease` → BUILD SUCCESSFUL (signed)
- APK metadata, signature, alignment and embedded backend ids all verified.

### Source
- Branch `codex/android-repair-2.0.18`.
- Files touched this build: `core/model/.../LinkPreview.kt` (new),
  `core/network/.../linkpreview/LinkPreviewFetcher.kt` (new),
  `core/common/.../util/LinkDetector.kt` (new),
  `core/data/.../repository/LinkPreviewRepository.kt` (new),
  `core/data/.../di/DataModule.kt`,
  `core/data/.../preferences/SettingsPreferences.kt`,
  `feature/chat/.../presentation/ChatViewModel.kt`,
  `feature/chat/.../presentation/ChatScreen.kt`,
  `feature/chat/.../presentation/components/MessageBubble.kt`,
  `feature/settings/.../presentation/SettingsViewModel.kt`,
  `feature/settings/.../presentation/SettingsSubScreens.kt`,
  `docs/TWO_ACCOUNT_VERIFICATION_PLAN.md` (new).

---

## This build — Message actions, Polls & Live location (spec areas 8, 10, 11, 13)

### 1. Message actions (Area 13)
- **Delete for me** — Room schema bumped to **v5** with an additive `hiddenForMe`
  column (`MIGRATION_4_5`); hidden rows are excluded from `observeLatest`,
  `getLatest`, `getOlderThan` and the unread count so they vanish locally without
  affecting other members. The action sheet now offers both **Delete for everyone**
  (sender only) and **Delete for me**.
- **Clear chat** — `MessageRepository.clearConversation` wipes the local thread from
  the overflow menu with a confirmation notice.

### 2. Chat header overflow (Area 11)
- Added **Mute / Unmute notifications** (`ConversationRepository.setMuted`) and
  **Clear chat** entries, each with snackbar feedback.

### 3. Polls (Area 10)
- New poll composer dialog (question + 2–10 options, "Add option").
- `MessageRepository.sendPoll` persists a TEXT message carrying
  `pollQuestion`/`pollOptions`; the payload rides the existing `metadata` jsonb
  column, so **no backend schema change** is required.
- Poll bubble renders each option with a proportional vote bar and count, highlights
  the current user's single choice, and casts/moves a vote on tap. Votes are stored
  under `opt:<index>` keys in the existing `reactions` jsonb column, so they sync
  through the same realtime path as emoji reactions (`votePoll`).

### 4. Live location (Area 8)
- Composer "Live location" now opens a **duration picker** (15 min / 1 h / 8 h)
  behind the same location-permission gate as a static share.
- `MessageRepository.sendLiveLocation` posts a LOCATION message with a
  `liveExpiresAt` instant; `ChatViewModel` refreshes the fix every 30 s while the
  share is active and auto-stops at expiry (`updateLiveLocation` / `stopLiveLocation`).
- Live bubble shows a **LIVE** chip, a once-a-second countdown ("Updates for 4m 12s")
  and a **Stop** action; once lapsed it degrades to a static location card.

### Build & verification
- `:core:data`, `:feature:chat`, `:app:compileReleaseKotlin` → BUILD SUCCESSFUL
- `:app:assembleRelease` → BUILD SUCCESSFUL (signed)
- APK metadata, signature, alignment and embedded backend ids all verified.

### Source
- Branch `codex/android-repair-2.0.18`.
- Files touched this build: `core/model/.../Message.kt`,
  `core/database/.../entity/MessageEntity.kt`, `GagaDatabase.kt` (v5),
  `dao/MessageDao.kt`, `mapper/EntityMappers.kt`,
  `core/network/.../rest/SupabaseRestApi.kt`,
  `core/data/.../mapper/DtoMappers.kt`,
  `core/data/.../repository/MessageRepository.kt`,
  `feature/chat/.../presentation/ChatViewModel.kt`,
  `feature/chat/.../presentation/ChatScreen.kt`,
  `feature/chat/.../presentation/components/MessageBubble.kt`,
  `feature/chat/.../presentation/components/PollAndLiveDialogs.kt` (new).

---

## Artifact
- File: `dist/GaGa-2.0.18-release.apk`
- Package: `gagachat.app`
- versionName: `2.0.18`  |  versionCode: `20`
- minSdk 26 · targetSdk 35 · compileSdk 35
- Signature: v2 + v3 valid · cert SHA-256 `a8e5af4f380fafec5edd2189641ada3b5b1abba3f5a64f3867a38c3ea90d53a2`
- zipalign: OK
- Embedded config verified: Supabase ref `fcjgbbmfqdkucfpqjxae`, Firebase app id `1:545448312835:android:d71f67bf2c8f96f4cd8e36`

---

## This build — Calling robustness + composer polish

### 1. Call failure "Could not reach this contact (calling error 6000011)" — FIXED
- **Root cause (confirmed against ZEGO docs):** ZIM error `6000011` = *"The user doesn't
  exist"*. ZIM registers a userID **only on first login**, so a callee who has never
  opened GaGa Chat has no ZIM account and cannot receive an invitation. Previously the
  app fired the invitation immediately and surfaced the raw code.
- **Fix — signaling channel is now observed and gated:**
  - `ZegoCallManager` tracks the ZIM signaling state via
    `invitationEvents.setPluginConnectListener(...)` into a `ZimConnection`
    state flow (`UNKNOWN / DISCONNECTED / CONNECTING / CONNECTED`).
  - An `ErrorEventsListener` (`events.setErrorEventsListener`) captures init/runtime
    errors into `lastErrorCode`.
  - `startCall()` now calls `awaitConnection(8s)` and refuses with an actionable
    message if the channel never connects, instead of sending a doomed invitation.
  - ZIM codes are mapped to human copy, e.g. `6000011` →
    *"This contact can't receive calls yet. Ask them to open GaGa Chat once, then try again."*
- **UI:** `CallViewModel` exposes `callingReady`; `ActiveCallScreen` shows
  *"Connecting…"* while ZIM warms up, and the error-state **Retry** now genuinely
  re-attempts the call (attempt counter re-keys the launch effect).

### 2. Message composer — per-conversation drafts
- New `DraftStore` (`@Singleton`) persists a draft per conversation id, so text typed
  in a chat survives leaving and returning.
- `ChatViewModel` hydrates the draft on open and persists on every keystroke; clears on
  send, edit-submit and edit-cancel.

### 3. Duplicate-send protection
- Media sends (`sendMedia`, `sendImageAlbum`) are guarded by a 700 ms debounce
  (`beginMediaSend()`), preventing double-taps from posting twice. Text send clears
  the draft synchronously.

### 4. Attachment sheet — scrollable on short screens
- The "Add attachment" sheet (`MessageComposer`) now uses
  `heightIn(max = 420.dp) + verticalScroll`, so all 9 options
  (Photos, Camera, Video, Audio file, Contact, Location, Live location, Document, Poll)
  remain reachable on small displays. Touch targets stay ≥ 48 dp.

## Build & verification
- `:app:compileReleaseKotlin` → BUILD SUCCESSFUL
- `:app:assembleRelease` → BUILD SUCCESSFUL (signed)
- APK metadata, signature, alignment and embedded backend ids all verified.

## Source
- Branch `codex/android-repair-2.0.18`.
- Files touched this build: `feature/calls/.../call/ZegoCallManager.kt`,
  `feature/calls/.../presentation/CallViewModel.kt`,
  `feature/calls/.../presentation/ActiveCallScreen.kt`,
  `core/data/.../preferences/DraftStore.kt` (new),
  `feature/chat/.../presentation/ChatViewModel.kt`,
  `feature/chat/.../presentation/components/MessageComposer.kt`.

---

## Prior build (commit `46ee7d9`) — chatroom P0 fixes
- **Location map failure** — switched OSM (403 policy-error tiles) to the Esri ArcGIS
  "World Street Map" basemap (`{z}/{y}/{x}`), added an identifying User-Agent, a
  graceful "Map preview unavailable" fallback, and a compact location card
  (thumbnail + place/coords + Open map / Directions).
- **Chat header repeated name** — `presenceSubtitle()` no longer echoes the title; it
  now shows presence only ("last seen …", "N members", "typing…").
- **Attachment menu** — renamed "Share" → "Add attachment", corrected labels
  (Audio file / Live location / Document), 4-column grid, keyboard dismissed on open,
  draft preserved.
