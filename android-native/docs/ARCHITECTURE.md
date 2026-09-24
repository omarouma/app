# Architecture

This document describes how the native GaGa Chat client is structured and how
data flows through it. It follows the *Professional Android Rebuild Blueprint*
(§2, §4, §5, §6, §7, §8).

## 1. Layers

```
┌──────────────────────────────────────────────────────────────┐
│ Presentation  — Jetpack Compose screens + ViewModels          │
│   • UI state is a single immutable data class per screen      │
│   • Screens never call the network or the database directly   │
├──────────────────────────────────────────────────────────────┤
│ Domain        — business rules (validation, formatting,       │
│                 call state machine, sync policy)              │
├──────────────────────────────────────────────────────────────┤
│ Repository    — contracts in :core:data                       │
│   • Local data source  (Room / DataStore / EncryptedPrefs)    │
│   • Remote data source (Supabase REST/Realtime/Storage)       │
├──────────────────────────────────────────────────────────────┤
│ Sync + conflict policy — outbox, idempotency, cursors         │
├──────────────────────────────────────────────────────────────┤
│ Push / WebRTC / Media storage                                 │
└──────────────────────────────────────────────────────────────┘
```

The **UI always renders from local state**. Remote data synchronizes in the
background. The backend is authoritative; the local database is a fast cache and
an offline/outbox layer.

## 2. Module graph

```
:app
 ├── :feature:*        (auth, home, chat, contacts, calls, profile, settings)
 ├── :core:ui          (theme + components)
 ├── :core:data        (repositories)
 │     ├── :core:database
 │     ├── :core:network
 │     ├── :core:model
 │     └── :core:common
 ├── :sync:workers ── :sync:outbox
 ├── :benchmark
 └── :baselineprofile
```

Feature modules depend on `core:*` only; they never depend on each other. The
`:app` module is the only place that knows about every feature, and it wires the
navigation graph.

## 3. Startup & persistent auth (PDF §3)

```
FIRST INSTALL
  Launch → session check → no session → Login/Register → OTP → Home

NORMAL LAUNCH
  Launch → read local secure session → Home immediately
              ├─ background token refresh
              └─ background profile/conversation sync

EXPIRED / REVOKED
  background validation fails → clear protected session → Auth screen
```

`AppViewModel` reads the encrypted session **synchronously** (no network on the
critical path) and exposes it as a `StateFlow`. `GagaApp` swaps between the auth
graph and the main graph based on that flow. Token refresh and sync run in the
background and never block the first frame.

## 4. Local-first data strategy (PDF §4)

- Every list screen observes a Room `Flow`. The first frame is painted from cache.
- Remote sync is **delta-based**: conversations are fetched by `updated_at`
  cursor, messages by `created_at` cursor. Full datasets are never reloaded on
  screen open.
- Realtime events are applied as **deltas** into Room; the UI reacts to the Room
  flow, so there is a single source of truth for rendering.
- A periodic `PeriodicSyncWorker` (15 min) reconciles anything missed while
  offline.

## 5. Chat room architecture (PDF §5)

- Messages are paginated: `INITIAL_MESSAGE_PAGE_SIZE = 40`, then
  `MESSAGE_PAGE_SIZE = 30` per older page.
- The list is rendered newest-at-bottom with `reverseLayout = true`.
- Date separators are computed from `sortTimestamp`.
- Presence and typing are **ephemeral** — they are never persisted to Room.

## 6. Idempotent / optimistic messaging (PDF §4, §5)

Every outgoing message gets a stable `clientMessageId` (UUID) at creation time.

1. The message is written to Room with status `PENDING` and rendered immediately.
2. A `MessageSendWorker` (or the foreground send path) posts it to PostgREST with
   `on_conflict=client_message_id`, so a retry can never create a duplicate.
3. On success the row is updated with the server id and status `SENT`.
4. Receipts (`delivered_at`, `read_at`) update the status to `DELIVERED`/`READ`.
5. On failure the status becomes `FAILED` and the bubble offers a retry.

The same `clientMessageId` is the Room unique index **and** the server conflict
key — one key, two layers, zero duplicates.

## 7. Media & attachments (PDF §6)

```
pick → local preview → optional compression → durable upload row (Room)
     → WorkManager upload → storage URL → confirm message
```

- Uploads are durable: `pending_uploads` survives process death and resumes.
- Progress is written back to the message row so the bubble shows a progress ring.
- Images are decoded at the display size (Coil) and cached in memory + disk;
  full-resolution bitmaps are never decoded into the chat list.

## 8. Real-time backend (PDF §7)

- Supabase Realtime (Phoenix channels over WebSocket) delivers `INSERT`/`UPDATE`
  deltas for messages, conversations and receipts.
- The socket is a single connection owned by `SupabaseRealtimeClient`; it is
  connected once per session and reconnected with backoff.
- Realtime is a **fast path**, not the source of truth: a missed event is always
  reconciled by the next delta sync.

## 9. Calling (PDF §8)

- `CallRepository` owns the session lifecycle and persists `call_sessions`.
- `CallViewModel` is a small state machine:
  `IDLE → OUTGOING_RINGING/INCOMING_RINGING → CONNECTING → CONNECTED → ENDED`.
- Signaling (offer/answer/ICE/ringing/accept/reject/busy/hangup) travels over the
  realtime channel; the media path (WebRTC) is intentionally decoupled.
- Ending a call writes a `CALL_EVENT` message into the conversation so the call
  appears in chat history, and the same session id backs the call-history list.

## 10. Sync & conflict policy

- **Server timestamps are authoritative.** Local `createdAtClient` is kept only
  for optimistic ordering before the server confirms.
- **Last-write-wins** for editable fields (message text, conversation pin/mute),
  keyed on server `updated_at`.
- **Deletes are tombstones** (`deleted_at`), never hard deletes, so a late sync
  cannot resurrect a deleted row.
- **Outbox** work is unique per message/conversation, so duplicate scheduling is
  impossible.

## 11. Performance engineering (PDF §9)

- Baseline Profile warms startup + first-screen code paths.
- Macrobenchmarks measure cold start (with/without profile) and scroll jank.
- Compose stability: immutable UI state, `key`ed lists, `derivedStateOf` for
  expensive derivations, and no work in composition.
- Coil memory + disk cache for avatars and media thumbnails.
- R8 full mode + resource shrinking in release.
