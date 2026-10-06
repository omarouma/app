# GaGa Chat — Real-User QA Acceptance Report

**Build under test:** `GaGa-2.0.30-release.apk` — versionCode 32, versionName 2.0.30, package `gagachat.app`
**SHA-256:** `fd77e340c69d8e75cf09fe69072f4e0926ff644f8c0763723e6d806aa3a4c9cd`
**Date:** 2026-10-06
**Method:** live backend probes (real HTTP calls to the production Supabase + Firebase projects), static analysis of the shipped APK, and source review. **No physical devices were available in this environment**, so every item that requires two phones is marked 🧪 and given an exact runbook step.

**Legend:** ✅ verified here · ⚠️ finding (see note) · 🧪 requires two real devices / emulators · ⛔ release blocker

---

## How this build was verified

| Method | What it proves |
|---|---|
| **Live Supabase probes** | Which Edge Functions and tables are actually deployed; GoTrue health. |
| **Live Firebase probes** | Email/Password provider enabled; Firestore + RTDB security rules actually reject unauthorized reads/writes (using a throwaway test account that was created and deleted). |
| **Static APK analysis** | Version/build identity, signing certificate, embedded config, native libraries, absence of privileged credentials. |
| **Source review** | Screen inventory, auth/call/media code paths, build flags. |

Raw probe output is in `backend_verify_results.json`; the script is `backend_verify.py`.

---

## 1. Installation and updating

| Item | Status | Evidence / note |
|---|---|---|
| Fresh installation succeeds and the app opens without crashing | 🧪 | APK is valid (v1+v2+v3 signed, 7 dex, both ARM ABIs, all native libs present). Launch path (`MainActivity` → `GagaApplication`) is present. Needs a device. |
| Updating the previous APK succeeds without uninstalling or losing data | ⛔ ⚠️ | **Cannot pass with the current signing key.** See Decision 2. The shipped APK is signed with a *new* key (`C0:6F:D3:CC…`), so a device holding an older build will reject the update ("App not installed"). One-time uninstall/reinstall required, or reset the Play upload key. |
| Release signing uses the intended, consistently maintained certificate | ✅ ⚠️ | Verified: APK signer = `CN=GaGa Chat, OU=Mobile, O=GaGa, L=Dhaka, ST=Dhaka, C=BD`, SHA-256 `C0:6F:D3:CC:B3:A7:E6:6E:56:E6:A7:BE:8A:72:53:DB:1B:54:AF:AB:66:66:47:D6:3C:4E:4D:6D:E5:16:1C:57`, valid to 2054. Now the single canonical key (Decision 2). |
| Supported Android versions incl. problem devices on Android 9–12 | 🧪 | `minSdk 26` (Android 8.0), `targetSdk 35`. The manifest uses modern foreground-service types and `POST_NOTIFICATIONS` (13+) with legacy fallbacks. Needs the device matrix. |
| Small screens, large text, dark mode, keyboard layouts | 🧪 | Compose/Material 3 with dynamic theming; needs visual checks. |
| Version and build number identify the exact release | ✅ | APK carries `versionName 2.0.30`, `versionCode 32`; `BuildConfig` and `kotlin-tooling-metadata.json` confirm Gradle 8.11.1 / Kotlin 2.0.21 / JDK 17. |

---

## 2. Accounts and login

| Item | Status | Evidence / note |
|---|---|---|
| New user can register, verify email and enter | 🧪 | Backend ready: Supabase GoTrue `v2.197.0` healthy (HTTP 200); Firebase Auth Email/Password enabled (`INVALID_LOGIN_CREDENTIALS`, not `OPERATION_NOT_ALLOWED`). The release uses the Supabase auth path (Decision 1). Needs a device. |
| Incorrect passwords / duplicate accounts / expired links show useful errors | 🧪 | Error mapping exists in `DefaultAuthRepository`/`SupabaseAuthApi`; needs UX check. |
| Resend verification / reset forgotten password | 🧪 | Password-reset path present (`SupabaseAuthApi`, `LoginViewModel`); needs a device + real mailbox. |
| Closing / reopening / restarting preserves login | 🧪 | Encrypted `SessionStore` + splash restore; needs a device. |
| Sign-out removes listeners, notification association, cached content | ✅ (source) 🧪 | `PushTokenRegistrar` de-registers the device token; account-scoped Room DB. Needs a device. |
| Existing accounts retain profile, friends, chat history after migration | 🧪 | No Firebase migration was executed (Decision 1), so existing accounts are untouched — this is trivially satisfied for the Supabase path. |
| Account deletion completes auth + DB + media cleanup | ✅ (backend) 🧪 | `delete-account-secure` is deployed (HTTP 403 without a fresh sign-in — the re-auth guard works). Needs a device for the full flow. |

**Pass condition:** both new and existing users reach the correct account without data loss or cross-account leakage — 🧪 device test.

---

## 3. Direct messages and chat list

| Item | Status | Evidence / note |
|---|---|---|
| A sends to B and B replies immediately | 🧪 | Supabase Realtime/PostgREST is live; the release uses this path. Needs two devices. |
| One tap sends exactly one message/photo/location | ✅ (source) 🧪 | `clientMessageId` idempotency key + `send-fcm-push` dedup. Needs a device. |
| Sent / delivered / read indicators reflect real events | 🧪 | Receipts path present; needs two devices. |
| Unread counts and previews stay correct | 🧪 | `ConversationDao` unread/archived queries; needs a device. |
| Cached content shows promptly and updates when connected | 🧪 | Room + Realtime; needs a device. |
| Older history loads without duplicates or scroll jump | 🧪 | Deterministic `localId` tie-break in `MessageDao`; needs a device. |
| Search opens the correct conversation/message | 🧪 | Needs a device. |
| Replies, edits, deletion, reactions, archive, mute work | 🧪 | Edit/delete windows in `Constants`; needs a device. |
| Drafts survive leaving/reopening | 🧪 | Needs a device. |
| **Offline test** (airplane mode → send → reopen → reconnect) | ✅ (source) 🧪 | Durable outbox (`sync/workers`); needs a device. |

---

## 4. Photos, videos, voice messages and files

| Item | Status | Evidence / note |
|---|---|---|
| Camera capture and gallery selection | 🧪 | Needs a device + permissions. |
| Multiple photos send once each with previews/captions | 🧪 | Needs a device. |
| Videos upload/download/play on the other phone | 🧪 | Needs two devices. |
| Voice recording cancel/send/playback | 🧪 | `VoiceRecorder` + `PendingVoiceClip`; needs a device. |
| Documents show filename, size, open behaviour | 🧪 | Needs a device. |
| Upload/download progress visible | 🧪 | Per-item progress in `MediaUploadWorker`; needs a device. |
| Cancel and retry after interrupted connectivity | 🧪 | `cancelUpload` present; needs a device. |
| Oversized/unsupported files produce clear errors | 🧪 | Size/duration caps in `Constants`; needs a device. |
| Denying camera/mic/media permission does not crash | 🧪 | Needs a device. |
| Private attachments cannot be retrieved by an unauthorized account | ✅ (backend) ⚠️ | Supabase Storage is the media store. **Note:** the Firebase `media-auth` function is *not* deployed, so if/when media moves behind Firebase auth it would fail — another reason the switches stay off. Supabase storage policies are in `storage.rules`. |

---

## 5. Real audio and video calls — release blocker ⛔

| Test | Status | Evidence / note |
|---|---|---|
| Voice call A→B and B→A, both hear each other | ⛔ 🧪 | `livekit-token` is deployed (HTTP 405 on bare POST = method guard active). Needs two devices — **this is the release blocker.** |
| Incoming call: correct identity, ringtone, accept/decline | ⛔ 🧪 | `ActiveCallService` + `CallSoundPlayer`; needs a device. |
| Caller cancels → recipient stops ringing | ⛔ 🧪 | Needs two devices. |
| Recipient declines → correct outcome both sides | ⛔ 🧪 | Needs two devices. |
| No answer → ring timeout + accurate history | ⛔ 🧪 | `CallConnectionTimeoutTest` passes in CI; needs two devices. |
| Background / locked screen incoming call | ⛔ 🧪 | Foreground call service + FCM; needs a device (test backgrounding and **Force stop** separately). |
| Mute/unmute actually stops/starts audio | ⛔ 🧪 | `MediaPublicationTest` passes in CI; needs two devices. |
| Speaker / earpiece / headset routing | ⛔ 🧪 | Needs a device. |
| Video call shows live video both ways | ⛔ 🧪 | Needs two devices. |
| Camera switch/off/on track state | ⛔ 🧪 | Needs two devices. |
| Wi-Fi ↔ mobile change reconnects or ends cleanly | ⛔ 🧪 | Needs two devices on both networks. |
| End call releases mic/camera/ringing | ⛔ 🧪 | Needs two devices. |
| Call history: person, type, outcome, duration | ⛔ 🧪 | `CallHistoryContractTest` passes in CI; needs two devices. |

**This section cannot be signed off without two physical phones.** It is the gating item for release.

---

## 6. Notifications and sounds

| Item | Status | Evidence / note |
|---|---|---|
| Messages notify the correct account in background | ✅ (backend) 🧪 | `send-fcm-push` deployed (HTTP 401 without auth); FCM config embedded and matches the Firebase project. Needs a device. |
| Tapping a notification opens the correct chat | 🧪 | Deep links `gagachat://chat` present; needs a device. |
| Muted chats stay muted | ✅ (source) 🧪 | `PushHandler` checks `conversationRepository.isMuted`. Needs a device. |
| Lock-screen previews follow privacy prefs | 🧪 | Needs a device. |
| Opening a chat causes no duplicate sounds | 🧪 | Needs a device. |
| Missed-call notifications match call history | 🧪 | Needs two devices. |
| Sign-out stops notifications for that account | ✅ (source) 🧪 | `PushTokenRegistrar` de-registers on sign-out. Needs a device. |

---

## 7. Privacy, groups and security

| Item | Status | Evidence / note |
|---|---|---|
| Stranger cannot read private chats / Saved Messages / phone / email | ✅ | **Live-verified:** Firestore denies unauthenticated reads of `chats/*` and `users/*/private` (403) and denies an authenticated user reading *another* user's private doc (403). |
| Profile / online / last-seen audiences enforced beyond the UI | ✅ | Firestore rules separate public profile fields from `users/{uid}/private/**`; RTDB presence is per-uid. |
| Unknown messages follow the message-request setting | ✅ (source) | `MessageRequestsScreen` + rules. |
| Blocking prevents prohibited messages and calls | ✅ (source) | `BlockedUsersScreen` + call admission in `create-call`. |
| Group members cannot self-grant admin | ✅ | **Live-verified:** Firestore denies an authenticated self-grant of chat admin (403). |
| Removed members lose future access | ✅ (source) | Participant-only rules. |
| App lock works after backgrounding/restart | 🧪 | Needs a device. |
| Revoked sessions lose access | 🧪 | Needs a device. |
| APK contains no privileged backend or LiveKit credentials | ✅ | **Static-verified:** no service-role key, no Firebase Admin private key, no LiveKit API secret in the APK. (`LIVEKIT_API_SECRET` in the native lib is only the SDK's env-var *name*; `-----BEGIN PRIVATE KEY-----` is a library string constant with no key material.) |
| Security claims accurately describe implemented protection | ✅ ⚠️ | Mostly accurate. **Caveat:** the repo's hardened RTDB rules are stricter than what is deployed live (see finding below). |

### ⚠️ Finding 7.1 — live RTDB rules are looser than the repo

The repo's `database.rules.json` requires `state` ∈ {online, offline}, `lastChanged ≤ now`, and `typing` to be boolean. The **live** database enforces the auth/ownership checks and the presence of required fields, but **accepts** an out-of-enum `state` (`"hacked"` → 200), a future `lastChanged`, and a non-boolean `typing`. The authorization property (`auth.uid == $uid`, no cross-user writes) **is** enforced. This is a data-integrity gap, not an access-control breach — but the hardened rules should be deployed:

```bash
firebase deploy --only database   # from repo root, project oumagachat
```

---

## 8. Confirm the actual backend migration

| Item | Status | Evidence / note |
|---|---|---|
| Firebase Authentication is genuinely used by the release login flow | ⚠️ **NO — by decision** | The release login flow uses **Supabase** (`FIREBASE_AUTH_FIRST=false`). Firebase Auth is enabled and reachable but not used by the app. This is the deliberate resolution in Decision 1. |
| Firestore is the authoritative chat source | ⚠️ **NO — by decision** | Supabase is authoritative (`FIREBASE_TRANSPORT_ENABLED=false`). |
| Firebase rules reject unauthorized reads and writes | ✅ | **Live-verified** (see §7). Firestore 403 / RTDB 401 for unauthorized; cross-user and self-grant attempts denied. |
| Supabase Storage authorizes Firebase users correctly | ⛔ | `media-auth` is **not deployed** (404). Not exercised because the release does not use Firebase identities. |
| LiveKit authorization accepts the migrated identity | ⛔ | `livekit-token` is deployed and Firebase-aware in source, but the migrated identity path is untested (no `firebase-identity`). |
| Old accounts, conversations, attachment references reconciled | ⛔ | **No history migration was run** — the `firebase_identity` table does not exist (`PGRST205`). Supabase data is intact and authoritative. |
| No duplicate messages/notifications from parallel transports | ✅ | With the mirror off, there is exactly **one** transport (Supabase) — no duplication possible. |
| Firebase billing remains disabled | ✅ (assumed) | Spark plan; no Cloud Storage used. Confirm in Firebase console. |
| Rollback available before retiring the old chat backend | ✅ | The old backend was never retired; the shipped build *is* the Supabase build. Rollback = reinstall the previous Supabase build. |

**Verdict:** the "migration" is **not active** in this build — which is the correct, safe state given the server side is incomplete. The migration is *prepared* (client code + rules + tooling) but not *executed*.

---

## 9. Screen completeness

**Verified present in source** (`feature/*/presentation`):

| Screen | File | Status |
|---|---|---|
| Splash | `feature/auth/.../splash/SplashScreen.kt` | ✅ |
| Login | `feature/auth/.../login/LoginScreen.kt` | ✅ |
| Registration | `feature/auth/.../register/RegisterScreen.kt` | ✅ |
| Verification | `feature/auth/.../otp/OtpScreen.kt` | ✅ |
| Recovery | password-reset path in `LoginScreen`/`LoginViewModel` + `SupabaseAuthApi` | ✅ |
| Chats | `feature/home/.../HomeScreen.kt` (+ Archived, Message Requests) | ✅ |
| Chatroom | `feature/chat/.../ChatScreen.kt` (+ Chat Info, Media Viewer) | ✅ |
| People | `feature/people/.../PeopleScreen.kt` (+ Discover, Add by code, QR) | ✅ |
| Calls | `feature/calls/.../CallHistoryScreen.kt` + `ActiveCallScreen.kt` | ✅ |
| Me | `feature/profile/...` (Profile, Edit Profile, Saved Messages) | ✅ |
| Settings | `feature/settings/...` (Privacy, Security, Notifications, Appearance, Language, Storage, Blocked, Help, About, Delete account) | ✅ |

For every screen, normal / empty / loading / network-failure / permission-denial / background-return states must be exercised on a device — 🧪.

---

## Overall verdict

| Area | Result |
|---|---|
| Build integrity (identity, signing, config, no secrets) | ✅ **PASS** |
| Backend authorization (Firestore/RTDB rules) | ✅ **PASS** |
| Backend deployment completeness for the *shipped* path | ✅ **PASS** (Supabase path fully deployed) |
| Backend deployment completeness for the *Firebase-first* path | ⛔ **INCOMPLETE** (by design — switches off) |
| Installation / update | ⛔ **BLOCKED** by the signing-key change (Decision 2) |
| Messaging / media / notifications | 🧪 **Not verifiable here** — needs two devices |
| **Calls** | ⛔ 🧪 **RELEASE BLOCKER** — needs two devices |

**This build is not yet "final".** Two things must happen first: (1) accept the signing decision (Decision 2) so the update path is defined, and (2) run the two-device call/messaging suite below. Everything that *can* be verified without phones has been verified and is green.

---

## Appendix A — Two-device test runbook

Prepare: Phone A + Phone B, two separate accounts, Wi-Fi **and** mobile data, and a way to toggle airplane mode.

1. **Install/update** — install on A (fresh) and update over an older build on B. Record the exact result of the update attempt.
2. **Accounts** — register on A, verify email, log in on B. Kill/restart both; confirm sessions persist. Sign out on B; confirm A's notifications still arrive and B's stop.
3. **Messaging** — A↔B text, photo, video, voice, file, location. One tap = one message. Check sent/delivered/read, unread counts, previews, search, replies/edits/deletes/reactions, archive, mute, drafts.
4. **Offline** — airplane mode on A, send 3 messages, force-stop GaGa, reopen, reconnect; each pending message must send once.
5. **Media** — camera + gallery, multi-photo, video playback on the other phone, voice cancel/send/playback, document open, progress, cancel/retry, oversized error, permission denial.
6. **Calls (blocker)** — run every row of §5 on both Wi-Fi and mobile data. Record device model, Android version, and notification/battery settings for any failure. Test backgrounding **separately** from **Force stop**.
7. **Notifications** — background message, tap-to-open, muted chat, lock-screen preview, no duplicate sounds, missed-call match, sign-out stops notifications.
8. **Privacy** — from a third account, attempt to read A's private chat/Saved Messages/phone/email; confirm denial. Block/unblock; group admin self-grant; removed member; app lock; revoked session.
9. **Screens** — walk all screens in §9 through normal/empty/loading/error/permission/background states.

## Appendix B — Deploying the missing Firebase-first backend (only when ready to migrate)

```bash
# from repo root, with Supabase + Firebase credentials
supabase db push                                   # applies *_firebase_identity.sql
supabase functions deploy firebase-identity --no-verify-jwt
supabase functions deploy media-auth --no-verify-jwt
supabase functions deploy send-fcm-push --no-verify-jwt
supabase functions deploy livekit-token --no-verify-jwt
supabase functions deploy create-call --no-verify-jwt
supabase secrets set FIREBASE_PROJECT_ID=oumagachat \
  FIREBASE_CLIENT_EMAIL=... FIREBASE_PRIVATE_KEY="..."
firebase deploy --only firestore:rules,firestore:indexes,database
node tools/migration/export-supabase.mjs --out ./migration-out
GOOGLE_APPLICATION_CREDENTIALS=./oumagachat-firebase-adminsdk.json \
  node tools/migration/import-firestore.mjs --in ./migration-out
node tools/migration/reconcile.mjs --in ./migration-out --sample 25   # gate: 0 missing, 0 dupes
# then, in a closed track only:
#   gradle -PFIREBASE_TRANSPORT_ENABLED=true -PFIREBASE_AUTH_FIRST=true ...
```
