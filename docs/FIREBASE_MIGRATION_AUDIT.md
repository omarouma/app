# GaGa Chat — Firebase Migration Audit (Stage 1)

**Date:** 2026-10-05
**Repository:** `omarouma/app` @ `main` (b762736, "Fix LiveKit media controls and photo review for GaGa 2.0.30")
**Shipped artifact audited:** `GaGa-2.0.30-release.apk` (versionCode 32, versionName 2.0.30)
**Firebase project:** `oumagachat` (Spark / free plan — **billing disabled**, no Cloud Storage bucket provisioned)
**Supabase project:** `fcjgbbmfqdkucfpqjxae`

This document records the **actual behaviour of the current source**, not the
intended behaviour. It is the Stage-1 completion gate from the specification
("Audit current source, identities, records, rules and storage dependencies →
Document actual behavior and migration coverage"). Every claim below is grounded
in a file that exists in the repository at the commit above.

---

## 1. Current architecture (as built)

| Layer | What actually ships today | Evidence |
| --- | --- | --- |
| **Authentication** | Supabase GoTrue is the identity provider. Email/password, OTP, recovery all go to `${SUPABASE_URL}/auth/v1`. Session stored in Keystore-backed `EncryptedSharedPreferences`. | `core/network/.../auth/SupabaseAuthApi.kt`, `core/data/.../repository/AuthRepository.kt`, `core/network/.../session/SessionStore.kt` |
| **Chat transport** | Supabase PostgREST (`messages` table) + Supabase Realtime. Local-first optimistic send with a Room outbox and WorkManager retry. | `core/data/.../repository/MessageRepository.kt`, `sync/workers/.../MessageSendWorker.kt` |
| **Firebase role** | **Mirror only.** A "Firebase Hybrid" flag (`FIREBASE_TRANSPORT_ENABLED`, **default `false`**) mirrors messages/typing into Firestore and presence into RTDB on a best-effort basis. It never carries a send. | `core/firebase/.../FirestoreChatMirror.kt`, `core/firebase/build.gradle.kts` |
| **Auth bridge** | A Supabase edge function `firebase-token` mints a Firebase **custom token** whose `uid` equals the caller's Supabase user id; the client calls `signInWithCustomToken`. This forces `FirebaseAuth.uid == Supabase.uid`. | `supabase/functions/firebase-token/index.ts`, `core/firebase/.../FirebaseAuthBridge.kt` |
| **Media** | Supabase Storage buckets (`chat-media`, `media`, `voice-messages`, `avatars`, `posts`, `stories`, `reels`). RLS keys on the **first path segment == `auth.uid()`**; the media buckets are **public-read**. | `supabase/migrations/20260925000100_backend_completion.sql` |
| **Calling** | LiveKit (WebRTC SFU). `livekit-token` edge function authenticates the Supabase session, verifies call membership, and mints a short-lived room-scoped JWT. Invite/ring uses Supabase Realtime + FCM. | `supabase/functions/livekit-token/index.ts`, `supabase/functions/create-call/*` |
| **Push** | FCM. Device tokens registered to Supabase `user_devices`; `create-call` fans out to `notifications` + `send-fcm-push`. | `app/.../push/*`, `supabase/functions/create-call/index.ts` |
| **Local DB** | Single Room database (`GagaDatabase`), **not account-scoped**; wiped with `clearAllTables()` on sign-out. | `core/database/.../GagaDatabase.kt`, `AuthRepository.clearLocalSession()` |
| **Privacy** | Server-authoritative in Supabase: `gaga_private` schema with audience policies, `gaga_get_privacy` / `gaga_save_privacy`, `gaga_validate_call`, `gaga_can_call`. | `supabase/migrations/20261005132605_account_privacy_enforcement.sql` |

---

## 2. Identity model — the critical finding

**There is currently no independent mapping between a Firebase identity and a
GaGa user id.** The two are kept equal by construction: the Supabase uid is
copied verbatim into the Firebase custom token (`const uid = callerId;` in
`firebase-token/index.ts`). Consequences:

1. Firebase Auth is **not** the identity provider — it is a shadow of Supabase.
   There is no Firebase registration, login, email-verification or password-reset
   flow in the app.
2. Because Firebase accounts are never created from an email address, the
   "never link accounts solely because someone submits a matching email" risk is
   currently *avoided by accident*, not by design. The moment Firebase
   email/password sign-up is introduced (as this migration requires), that
   protection must be added deliberately.
3. The Firestore security rules assume `request.auth.uid == senderId` where the
   id is the **Supabase** uid. If Firebase becomes the primary identity provider,
   the uid space changes and every rule, every mirrored document and every media
   path that embeds a uid must be reconciled.

**Migration coverage:** an explicit, server-owned identity-mapping record is
required before Firebase Auth can be switched on. It must be created only by a
trusted backend that proves ownership (a valid Firebase ID token **plus** a
verified legacy credential), never by matching an email string.

---

## 3. What the current rules actually enforce

### 3.1 Firestore (`firestore.rules`)

| Area | Current rule | Gap vs target |
| --- | --- | --- |
| `chats/{id}` read | `uid() in resource.data.participants` | OK |
| `chats/{id}` create | caller must be in `participants` | **A caller can add arbitrary participants** — no membership-change control. |
| `chats/{id}` update | any participant | **Any participant can rewrite `participants`** (add/remove anyone) and flip `type`/`title`. |
| messages create | `senderId == uid()` | OK |
| messages update | author, **or** any member may change `deliveredTo`/`readBy`/`reactions`/`updatedAt` | **Receipt forgery is possible**: a member can write another member's entry into `readBy`/`deliveredTo`. |
| `users/{uid}` read | **any signed-in user** | **Private profile fields (email, phone, settings) are world-readable to any authenticated user.** No field separation. |
| `presence/{uid}` | read: any auth | OK for now; no expiry. |
| `typing/{id}` | read: any auth | OK; no expiry in rules (client TTL only). |

### 3.2 Realtime Database (`database.rules.json`)

`presence/$uid`, `status/$uid`, `typing/$chatId/$uid`, `signaling/$callId`,
`receipts/$chatId/$uid` are writable by the owner. **No expiry/validation of the
typing timestamp** and **no disconnect handling** are expressed in rules — the
`typing` node has no TTL, so a crashed client leaves a permanent "typing…".

### 3.3 Storage (Supabase RLS)

Media buckets are **public-read** and write-scoped to `split_part(name,'/',1) =
auth.uid()`. There is **no conversation-membership check** on read: anyone who
knows a public object URL can fetch it, and authorization is not tied to Firebase
identity or to membership at request time. This is the single largest media gap
versus the target ("Private media with authorization based on Firebase identity
and conversation membership").

---

## 4. Data model coverage vs target

| Target data area | Exists today? | Where |
| --- | --- | --- |
| Conversations (type/title/photo/createdAt/lastActivity/membership) | Partial (Supabase `chats`) | Postgres |
| Membership (role/joinedAt/notif pref/archive/read position) | Partial | Postgres `chat_members`, `chat_reads` |
| Messages (stable id/sender/type/content/server+client ts/reply/edit/attachments) | Yes | Postgres `messages` |
| Attachments (object id/filename/mime/size/dimensions/duration/state) | Partial | Postgres metadata JSON |
| Requests (sender/recipient/status/timestamps) | Partial | Postgres |
| Receipts (sent/delivered/read) | Partial | Postgres `delivered_to`/`read_by` |
| Profiles (private vs exposed) | Yes (server-projected) | `gaga_private.profiles()` |
| Preferences (account vs device) | Partial | Postgres `user_settings` + local prefs |

**Firestore carries none of this as an authoritative store today** — only the
mirror fields written by `FirestoreChatMirror` (`type`, `updatedAt`,
`participants`, and per-message `senderId`/`type`/`createdAt`/`text`).

---

## 5. Gaps that block the target architecture

1. **No Firebase-first auth** (registration, login, email verification, password
   reset) and **no verified identity mapping**. → P0
2. **No trusted backend that verifies Firebase ID tokens.** Every edge function
   authenticates against Supabase GoTrue (`/auth/v1/user`). → P0
3. **Firestore is a mirror, not a transport.** No send queue, pagination,
   receipts, offline handling or membership model in Firestore. → P0
4. **Media authorization is not membership-based and not Firebase-aware**, and
   the media buckets are public-read. → P0
5. **Receipts/membership/profile rules are too permissive** (see §3.1). → P0
6. **Local DB is not account-scoped**; account switching relies on wiping the
   single database. → P0/P1
7. **No history-migration tooling** (export/import/reconcile). → P0
8. **No cutover/rollback procedure** documented. → P0

---

## 6. What "screenshots cannot establish" — and therefore what must be tested

The specification is explicit that a successful build or token response is not
proof. The following behaviours are **backend/runtime** properties that this
audit could not confirm from source alone and that must be exercised on real
devices/emulators during Stages 2–5:

- Two accounts exchanging messages with exactly one message and one notification
  per send (no duplicates).
- Offline send surviving process death and reconnecting in order.
- Outsiders being denied reads of messages, private profiles and attachments at
  the **rules** layer (not just the UI).
- Requests/blocking/privacy enforced beyond the UI.
- Two real devices hearing each other and showing live video over LiveKit, with
  correct ring/stop-ring on every terminal state.
- Account switching not exposing another account's cached data.

---

## 7. Environment constraints for this implementation pass

This sandbox has **no JDK, Gradle or Android SDK**, so the APK cannot be built or
device-tested here. The migration work delivered in this pass therefore focuses on
the parts that *can* be authored and reviewed deterministically — the trusted
backend, the security rules, the migration tooling and the Android source — with
the device-dependent acceptance items tracked explicitly in
`docs/RELEASE_ACCEPTANCE_CHECKLIST.md`.

---

## 8. Migration coverage summary

| Spec work item (§2) | Status after this pass |
| --- | --- |
| Existing-account migration (verified mapping, no email-only linking) | **Implemented** — `firebase-identity` function + `gaga_identities` table |
| Registration (name, unique GaGa id, email, password, terms) | **Android source** — `FirebaseAuthDataSource` |
| Email verification (link, check, resend+cooldown, change email, sign out) | **Android source** + backend `email_verified` enforcement |
| Login persistence (splash restore, refresh, cached load) | **Android source** |
| Recovery (reset email, expired link, resend limits) | **Android source** |
| Identity compatibility (media/call/privileged endpoints accept Firebase tokens) | **Implemented** — `_shared/auth.ts` used by all functions |
| History migration (inventory, export, import, reconcile) | **Implemented** — `tools/migration/*` |
| Cutover (single transport, dedup rules) | **Documented** — runbook |
| Rollback (preserve originals, compatible release) | **Documented** — runbook |
