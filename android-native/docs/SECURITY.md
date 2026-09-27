# GaGa Chat — Security Baseline

This document is the security companion to the rebuild blueprint (PDF §11). It
records exactly how the native Android client satisfies each security
requirement, where the enforcement lives, and what must be validated before a
release is promoted.

The guiding principle is simple: **the client is untrusted**. Every guarantee
that matters is enforced by the backend (Supabase PostgREST + Row Level
Security + Storage policies). The Android app is responsible for *not leaking*
secrets, *not persisting* sensitive data in the clear, and *not trusting* its
own local cache as authoritative.

---

## 1. No privileged secrets in the APK

The blueprint is explicit: API keys and secrets must never be hard-coded as
privileged secrets inside the APK. The build honours this as follows.

| Secret | Where it lives | Ships in APK? |
| --- | --- | --- |
| Supabase project URL | `local.properties` → `BuildConfig.SUPABASE_URL` | Yes (public, non-secret) |
| Supabase **anon** key | `local.properties` → `BuildConfig.SUPABASE_ANON_KEY` | Yes (public by design; RLS-gated) |
| Supabase **service_role** key | Backend only (never in the repo, never in `local.properties`) | **No** |
| Firebase `google-services.json` | Not committed; injected by CI | Config only, no privileged secret |
| Release signing keystore | CI secret store / secure release process | **No** |
| TURN credentials | Issued per-session by the backend | **No** |

`core/network/build.gradle.kts` reads the Supabase values from Gradle project
properties and exposes them through `buildConfigField`. `SupabaseConfig.fromBuildConfig()`
consumes them. The anon key is safe to embed because **every table is protected
by RLS** — possessing the anon key grants no data access without a valid user
JWT.

> **Rule:** the `service_role` key bypasses RLS. It must only ever exist on the
> server (Edge Functions / trusted backend). If it is ever found in the repo or
> in a built artifact, treat it as a security incident and rotate immediately.

`local.properties.example` documents the required keys and carries an explicit
warning that the service_role key must never ship.

---

## 2. Encrypted local session storage

Authentication tokens are the most sensitive thing the client holds. They are
never written to plain `SharedPreferences`, never logged, and never placed in
the Room database.

- **Implementation:** `core/network/session/SessionStore.kt` defines the
  `SessionStore` contract; `EncryptedSessionStore` is the production
  implementation backed by `EncryptedSharedPreferences` (AES-256-GCM, keys held
  in the Android Keystore).
- **Bound via Hilt:** `NetworkModule` / `SessionModule` binds the encrypted
  implementation as the single `SessionStore` used by `AuthRepository`.
- **What is stored:** `userId`, `accessToken`, `refreshToken`,
  `expiresAtMillis`, `email`, `phone`, `displayName` — nothing else.
- **Backup exclusion:** `res/xml/backup_rules.xml` and
  `res/xml/data_extraction_rules.xml` exclude `gaga_secure_session.xml`, the
  Room database (`gaga.db`), and the media cache. Tokens therefore never leave
  the device through cloud backup or device-to-device transfer.
- **Refresh policy:** `AuthSession.needsRefresh(now)` returns true 60 seconds
  before expiry; `DefaultAuthRepository.validateAndRefresh()` refreshes
  proactively on app start and before authenticated calls.

---

## 3. Backend authorization (RLS) — the real boundary

All data access goes through PostgREST with the user's JWT. The following
policies must exist in the Supabase project (they are the authoritative
enforcement point, not the client):

- **`users`** — a user may `select`/`update` only their own row
  (`auth.uid() = id`); public profile fields may be readable by authenticated
  users for contact discovery.
- **`conversations` / `conversation_members`** — a user may read a conversation
  only if a matching `conversation_members` row exists for `auth.uid()`. Writes
  to membership are restricted to the conversation owner/admin.
- **`messages`** — `insert` requires membership in the target conversation and
  `sender_id = auth.uid()`; `select` requires membership; `update`/`delete`
  require `sender_id = auth.uid()` (soft delete only).
- **`message_receipts`** — a user may write receipts only for messages in
  conversations they belong to, and only for their own `user_id`.
- **`call_sessions`** — participants only.
- **`devices`** — a user may upsert/read only their own device rows.
- **`blocks`** — a user may manage only blocks where they are the blocker.
- **Storage** — the `media` bucket uses per-conversation path prefixes; upload
  and download policies check conversation membership.

> **Every message mutation is authenticated and authorized.** The client sends
> the JWT on every request; the server rejects anything that fails RLS. The
> client never assumes a write succeeded until the server confirms it.

---

## 4. Server timestamps are authoritative

The blueprint requires server timestamps to be authoritative, with client
timestamps used only for optimistic display and ordering.

- `Message.createdAtClient` is set locally at send time and drives the
  optimistic bubble position.
- `Message.createdAtServer` is written by the database (`now()` default) and,
  once received, becomes the value used for `sortTimestamp` and day separators.
- `Message.sortTimestamp` prefers `createdAtServer` and falls back to
  `createdAtClient` only while a message is still pending.
- The same rule applies to `Conversation.updatedAt` and `CallSession` times.

This prevents a device with a skewed clock from reordering history or forging
recency.

---

## 5. Upload validation

Media uploads are validated on **both** sides:

- **Client (fast fail):** `MediaRepository.enqueueUpload` checks MIME type and
  size against `Constants.MAX_UPLOAD_BYTES` before enqueuing, so obviously
  invalid files never consume bandwidth.
- **Server (authoritative):** the Storage bucket enforces allowed MIME types
  and a maximum object size. A client that bypasses the local check is still
  rejected by the bucket policy.
- Uploads are idempotent: each carries a `clientMessageId` / `uploadId`, and
  the `PendingUploadEntity` row is the single source of truth for retry state.

---

## 6. Rate limiting, abuse controls, session revocation

- **Rate limiting / abuse:** enforced at the backend (Supabase auth rate limits
  plus Edge Function throttling for message send and OTP). The client surfaces
  `AppError.Server(429)` as a friendly "slow down" message via
  `ErrorMessages.kt`.
- **Session revocation:** because the server is authoritative, revoking a
  session (or rotating the refresh token) invalidates the client on its next
  refresh. `validateAndRefresh()` detects `401`/`403`, clears the encrypted
  session, and routes the user back to login.
- **Device management:** `devices` rows (deviceId, pushToken, platform,
  lastActive, appVersion) let the backend target and revoke individual devices.

---

## 7. Logging hygiene

- `AppLogger` is the only logging entry point. In release builds it is a no-op
  for verbose/debug levels.
- **Never logged:** access/refresh tokens, passwords, OTP codes, message
  bodies, media URLs with signed parameters, or full user rows.
- `proguard-rules.pro` strips `Log.v` / `Log.d` calls from release builds.
- Ktor's `HttpClient` is configured with `LogLevel.NONE` in
  `core/network/di/NetworkModule.kt`, so request/response bodies (which contain
  JWTs and message content) are never written to logcat.
- Crash reporting (Crashlytics) is configured to avoid attaching message
  content; only non-sensitive breadcrumbs are recorded.

---

## 8. Network transport

- `res/xml/network_security_config.xml` sets
  `cleartextTrafficPermitted="false"` for all domains. All traffic is HTTPS/WSS.
- The Realtime client uses `wss://` only.
- Certificate validation uses the platform trust store; no custom trust
  managers or `TrustAll` configurations exist anywhere in the codebase.

---

## 9. Permissions rationale

Every runtime permission is requested **just-in-time**, in context, and only
when the feature is used. The manifest declares:

| Permission | Why | When requested |
| --- | --- | --- |
| `INTERNET`, `ACCESS_NETWORK_STATE` | Network + connectivity-aware sync | Install-time |
| `POST_NOTIFICATIONS` | Message/call notifications (Android 13+) | First launch / on enable |
| `VIBRATE`, `WAKE_LOCK` | Call ringing + reliable delivery | Install-time |
| `CAMERA` | Video calls, in-app capture | On first camera use |
| `RECORD_AUDIO` | Voice messages, audio calls | On first record/call |
| `READ_MEDIA_IMAGES/VIDEO/AUDIO` (33+) / `READ_EXTERNAL_STORAGE` (≤32) | Attach existing media | On first attach |
| `ACCESS_COARSE/FINE_LOCATION` | Share location message | On first location share |
| `FOREGROUND_SERVICE` (+ `CAMERA`, `MICROPHONE`, `PHONE_CALL`) | Ongoing call / upload | During call/upload |
| `MANAGE_OWN_CALLS` | Self-managed call integration | Install-time |

No permission is requested at startup that is not needed for startup.

---

## 10. QA matrix (PDF §10 + §11)

Before release, verify on the following matrix:

- **OS versions:** Android 10, 11, 12, 13, 14, 15, 16.
- **Display sizes:** small phone, large phone, foldable (folded/unfolded),
  tablet; portrait primary, landscape behaviour explicitly decided.
- **Font scaling:** 85% → 200%; no clipped text, no fixed oversized containers.
- **Screen zoom:** zoom-in / zoom-out appearance stays correct.
- **Edge-to-edge:** insets consumed correctly (status bar, nav bar, IME).
- **Dark mode:** all surfaces, bubbles, and media placeholders legible.

### Crash / ANR checks

- Crashlytics crash-free sessions ≥ 99.5% on the internal track before staged
  rollout.
- ANR rate < 0.47% (Play vitals threshold).
- Cold start (Macrobenchmark) within budget on a low-end reference device.
- No `NetworkOnMainThreadException`, no unbounded `LaunchedEffect` listeners,
  no duplicate realtime subscriptions (one listener per lifecycle scope).

---

## 11. Pre-release security checklist

- [ ] `service_role` key absent from repo, `local.properties`, and built APK/AAB.
- [ ] `google-services.json` not committed; injected by CI.
- [ ] Release keystore stored in CI secret store, not in the repo.
- [ ] RLS enabled on every table; policies reviewed against §3.
- [ ] Storage bucket MIME/size limits configured.
- [ ] `network_security_config.xml` active (cleartext disabled).
- [ ] Backup/data-extraction rules exclude session, DB, and media cache.
- [ ] Ktor logging set to `NONE`; ProGuard strips verbose logs.
- [ ] Session refresh + revocation path tested (expired token → login).
- [ ] Rate-limit responses surface friendly errors, not crashes.
