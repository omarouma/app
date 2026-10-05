# GaGa Chat — Release Acceptance Checklist

**Date:** 2026-10-05
**Build under test:** `2.0.30` (baseline) → migrated build (this branch)
**Legend:** ✅ implemented in source (reviewable) · 🧪 requires real-device /
emulator verification · ⏳ deferred (P2) · ⛔ blocked in this sandbox (no Android
toolchain)

> The specification is explicit: *"screenshots alone cannot establish whether the
> backend behavior already works."* Items marked 🧪 are backend/runtime
> properties that must be exercised on two real devices before release; they
> cannot be signed off from source review alone.

| # | Acceptance item | Status | Where it is enforced / how to verify |
| --- | --- | --- | --- |
| 1 | Existing accounts retain history, membership and attachment access | ✅ + 🧪 | `firebase-identity` verified mapping; `tools/migration/*`; run reconcile |
| 2 | New accounts verify email and recover passwords successfully | ✅ + 🧪 | `FirebaseAuthDataSource`; `email_verified` enforced in rules/backend |
| 3 | Login persists through reopening and device restart | ✅ + 🧪 | Splash restore + Firebase token refresh; `SessionStore` |
| 4 | One tap sends exactly one message, photo or location | ✅ + 🧪 | `clientMessageId` idempotency; Firestore `merge`; dedup in `send-fcm-push` |
| 5 | Offline sends survive process termination and reconnect | ✅ + 🧪 | Durable outbox (`sync/workers`), Firestore offline persistence |
| 6 | Outsiders cannot read messages, private profiles or attachments | ✅ | `firestore.rules` (participant-only, `users/{uid}/private/**`), `media-auth` |
| 7 | Requests, blocking and privacy enforced beyond the UI | ✅ | `firestore.rules` + `gaga_private` server policies + call admission |
| 8 | Media uploads/downloads show progress and recover from failure | ✅ + 🧪 | `MediaUploadWorker`, per-item progress, `media-auth` retry |
| 9 | Calls ring on recipient, connect two-way audio/video, stop ringing | ⛔ 🧪 | `livekit-token` (Firebase-aware) + `create-call`; needs 2 devices |
| 10 | Call outcomes match on both devices and in history | ⛔ 🧪 | `call_history` single record; needs 2 devices |
| 11 | Notifications respect mute and preview preferences | ✅ | `send-fcm-push` reads per-chat `notificationPref` + privacy |
| 12 | Account switching does not expose another account's cached data | ✅ + 🧪 | Account-scoped Room database (`DatabaseModule`) |
| 13 | Supported Android versions, large text and dark mode pass checks | ⛔ 🧪 | minSdk 26 / target 35; needs device matrix |
| 14 | Release APK contains no privileged service credentials | ✅ | LiveKit secret + Firebase service account stay server-side |
| 15 | Firebase remains without an attached billing account | ✅ | Spark plan; no Cloud Storage this phase |

---

## Sign-off rules

- Items 6, 7, 11, 14, 15 can be signed off from **source + rules review** (✅).
- Items 1–5, 8, 12 require **two-account integration tests** on emulators/devices.
- Items 9, 10, 13 require **two physical devices** and a device matrix.
- Release is blocked until every 🧪 item is green on the release candidate.
