# GaGa Chat — Migration Guide (Capacitor WebView → Native Android)

This document explains why the rebuild was necessary, what changed, and how the
existing backend and product surface are preserved while the client is replaced.

---

## 1. Why the rebuild

The shipped `GaGa-v1.0.0-release.apk` is a **Capacitor WebView wrapper**. Its
`assets/capacitor.config.json` declares `appId: gagachat.app`, `appName: GaGa`,
and `webDir: dist`, and `assets/capacitor.plugins.json` lists the native bridge
plugins. In practice this means:

- The entire UI is a React 19 + TypeScript + Vite PWA rendered inside a single
  `WebView`.
- Every screen transition, list scroll, and keystroke round-trips through the
  JS bridge and the WebView compositor.
- Cold start pays for WebView initialisation + JS bundle parse + first React
  render before anything is visible.
- Scrolling long chat histories decodes full-resolution images on the JS thread.
- There is no true local-first cache; the app is network-bound.

This is the root cause of the sluggishness the blueprint targets. The rebuild
replaces the WebView with a **native Kotlin + Jetpack Compose** client that
renders on the Android UI thread, caches in Room, and syncs deltas in the
background.

---

## 2. What is preserved

The rebuild is a **client replacement**, not a backend rewrite. The following
are unchanged and reused:

- **Supabase project** — same PostgREST tables, same Realtime channels, same
  Storage bucket, same GoTrue auth. The native client speaks the same REST and
  WebSocket protocols the web app used.
- **Firebase project** — same FCM sender, same Analytics/Crashlytics.
- **Branding & UI direction** — the violet/teal palette, bubble shapes, and
  layout language are carried into the Compose theme (`core/ui/theme`).
- **Product surface** — auth, home, chat, contacts, profile, settings, calls.
- **Web deployment** — `https://oumagachat.web.app` remains live; the native
  app deep-links into the same routes (`https://oumagachat.web.app/...`) and
  also accepts the `gagachat://` scheme.

---

## 3. Concept mapping

| Web (Capacitor) concept | Native (Compose) equivalent |
| --- | --- |
| React component tree | Composable functions (`feature/*/presentation`) |
| Zustand store | `ViewModel` + `StateFlow` (`UiState` data classes) |
| React Query / fetch hooks | `Repository` + `Flow` from Room, Ktor for network |
| `localStorage` / IndexedDB | Room (`core/database`) + DataStore for prefs |
| Supabase JS client | `SupabaseRestApi` (Ktor) + `SupabaseRealtimeClient` (WebSocket) |
| Capacitor plugin bridge | Native Android APIs (CameraX, MediaStore, FCM, WebRTC) |
| React Router | Navigation-Compose (`navigation/*Navigation.kt`) |
| Service worker / PWA cache | WorkManager outbox + Room cache |
| `<img>` full-res decode | Coil with size-aware requests + thumbnails |

---

## 4. Data model continuity

The native domain models (`core/model`) mirror the existing backend schema so
no server migration is required:

- `User` ↔ `users`
- `Conversation` / `ConversationMember` ↔ `conversations` / `conversation_members`
- `Message` ↔ `messages` (including `client_message_id` for idempotency)
- `MessageReceipt` ↔ `message_receipts`
- `CallSession` ↔ `call_sessions`
- `Device` ↔ `devices`
- `Block` ↔ `blocks`

The one addition the native client relies on is the **`client_message_id`
unique constraint** on `messages`. If the existing table does not already have
it, add it (see §5). This is what makes "one send tap = exactly one message"
true even across retries and reconnects.

---

## 5. Required backend additions

These are additive and backward-compatible with the web app:

1. **`messages.client_message_id`** — `text` column with a `unique` constraint
   (nullable for legacy rows). The native client sends
   `Prefer: resolution=merge-duplicates` with `on_conflict=client_message_id`,
   so a retried insert updates the existing row instead of duplicating it.
2. **`devices` table** — `(user_id, device_id)` primary key, `push_token`,
   `platform`, `last_active`, `app_version`. Used for push targeting and
   per-device revocation.
3. **`call_sessions` table** — call history and signalling metadata.
4. **RLS policies** — see `docs/SECURITY.md` §3. The web app already relies on
   RLS; the native client assumes the same policies.
5. **Realtime publication** — ensure `messages`, `conversations`,
   `message_receipts`, and `call_sessions` are in the `supabase_realtime`
   publication so the native WebSocket client receives deltas.

---

## 6. Rollout strategy

The native app is a **new artifact** (`gagachat.app`, versionCode 1) that can
coexist with the WebView build during transition:

1. **Internal testing track** — install alongside the existing app; validate
   auth, home, chat, media, calls, and push against the live backend.
2. **Closed testing** — a small external cohort; monitor Crashlytics and Play
   vitals.
3. **Staged rollout** — 5% → 20% → 50% → 100%, gated on crash-free sessions and
   ANR thresholds.
4. **Retire the WebView build** once the native app is at 100% and stable.

Because both clients share the same backend and the same `client_message_id`
idempotency key, a user switching between them cannot create duplicate messages.

---

## 7. What was intentionally NOT carried over

Per blueprint §15 ("What NOT to Do"), the native client deliberately avoids:

- Direct Firebase/Supabase calls from composables (all access is via
  repositories).
- Full-dataset reloads on every screen open (Room cache + delta sync instead).
- Multiple realtime listeners attached to the same lifecycle scope.
- Blank screens while a remote request is in flight (cached data renders first).
- Treating the local database as authoritative server truth.
- Full-resolution image decode in the chat list.
- Judging performance from debug builds.
- Logging tokens or sensitive data.

---

## 8. Verification of the migration

The migration is considered complete when the **Definition of Done** (PDF §14)
passes end-to-end on the native build:

- Install → Auth → account create/login → Home shows real backend data.
- Second launch with a valid session goes straight to Home.
- Home renders the cached conversation list without a blocking loader.
- Chat opens cached messages instantly and syncs new ones in the background.
- One send tap creates exactly one message.
- Text/photo/video/file/location/audio all show pending/sent/failed states.
- Delivery/read receipts update correctly.
- Own/other avatars render correctly in chat.
- Call start/receive/end works and appears in call history.
- Contacts/profile/settings do not refetch entire datasets.
- Compatibility matrix passes (see `docs/SECURITY.md` §10).
- Release build is signed, optimized, crash/ANR-checked, and RLS-validated.
