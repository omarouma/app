# GaGa Chat 2.0.18 — Build Report

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
