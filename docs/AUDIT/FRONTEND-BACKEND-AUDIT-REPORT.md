# GaGa Chat — Full Frontend + Backend Audit Report

**Date:** September 2026 (audit session)
**Scope:** Verify every screen, design/layout style, feature and functionality is present in the built APK (v3.1.17-qa), and audit the backend end-to-end.
**Artifacts audited:**
- APK: `GaGaChat-v3.1.17-qa` (universal), package `gagachat.app`, versionCode 30117
- Android source: `/workspace/existing-app/app-gagachat-native-3.1.17/android/`
- Backend source: `/workspace/existing-app/app-gagachat-native-3.1.17/backend/` (v3.9.0)

---

## VERDICT: ✅ PASS — no gaps found

Everything in the PDF Master Guide's frontend spec (screens, design system, features) is compiled into the APK, and the backend is fully consistent with the app's API usage. Backend tests re-run during this audit: **8/8 release-regression PASS + 60/60 smoke PASS**.

---

## PART 1 — FRONTEND AUDIT (APK CONTENTS)

### 1.1 APK identity & build config (aapt2 dump badging — verified)

| Property | Value |
|---|---|
| package | `gagachat.app` (namespace `app.gagachat.mobile`) |
| versionName | 3.1.17-qa |
| versionCode | 30117 |
| minSdk | 24 (Android 7.0+) |
| targetSdk | 36 |
| compileSdk | 36 |
| label | GaGaChat (all locales) |
| launchable-activity | `app.gagachat.mobile.ui.AuthActivity` |

### 1.2 Screens — 21 activities in the APK manifest (19 app screens + 2 library)

Every screen from the source manifest is compiled and declared in the final APK manifest (verified via `aapt2 dump xmltree` + dex class check):

1. `ui.AuthActivity` — phone-first auth: register/login, OTP verify, 24-country picker (+880 default), POST_NOTIFICATIONS runtime request
2. `ui.MainActivity` — home tabs: Chats / Calls / Contacts / Wallet / Me, live WS updates
3. `ui.ChatActivity` — live WS chat, typing indicator, local search, delete-for-everyone, image/audio/file attachments
4. `ui.VoiceNoteActivity` — MediaRecorder voice-note composer, preview/discard/send
5. `ui.CallActivity` — WebRTC call screen: mute 🎤 / camera 📷 / flip 🔄 / hangup 📞, speakerphone on video
6. `ui.IncomingCallActivity` — full-screen incoming call (showWhenLocked, turnScreenOn, showForAllUsers, excludeFromRecents)
7. `ui.SettingsActivity` — theme (system/light/dark), language, biometric unlock, export data, delete account, logout
8. `ui.NotificationSettingsActivity` — per-channel notification preferences
9. `ui.ConnectionStatusActivity` — /health + /ready live checks
10. `ui.StorageActivity` — media size + clear temp media
11. `ui.SafetyActivity` — block/report + blocked users list
12. `ui.CreateGroupActivity` — group creation
13. `ui.GroupActivity` — group info/members management
14. `ui.SearchActivity` — user search
15. `ui.CallHistoryActivity` — call history list
16. `ui.WalletActivity` — top-up/send/withdraw/history + coming-soon gating
17. `ui.ProfileActivity` — avatar, name, bio, username, QR, share link
18. `ui.AddFriendsActivity` — add by username, friend requests, QR scan
19. `ui.ImageViewActivity` — image preview/save
+ `com.journeyapps.barcodescanner.CaptureActivity` (QR scanner, zxing)
+ `com.google.android.gms.common.api.GoogleApiActivity` (Play services resolution)

All 19 app activities have both (a) a manifest entry and (b) a compiled class in the dex — no orphan screen or missing declaration.

### 1.3 Compiled code — 36 Kotlin source files → 46 top-level classes → 292 dex entries

All 46 top-level classes verified present in classes.dex/classes2.dex (292 entries including inner classes and lambdas):

- **ui/** (21): Ui (design system), AvatarView, + all 19 activities
- **realtime/** (8): GaGaService (file also contains CallBus, CurrentChat, NotifManagerCompat), GaGaWs, CallNotifications, MessageOutboxWorker, BootReceiver
- **net/** (3): Api, ImageCompressor, ProgressRequestBody
- **prefs/** (2): AppPrefs, SessionStore
- **model/** (6): Chat, Contact, Me, Message, CallEvent, WalletInfo (in Models.kt)
- **calls/** (1): CallEngine (WebRTC PeerConnectionFactory, Camera2Enumerator, ephemeral TURN)
- **firebase/** (2): GaGaFirebaseMessagingService, PushTokenRegistrar
- **root** (3): GaGaApp, R, BuildConfig

### 1.4 Design system (layout & style)

- **Architecture:** programmatic UI — zero XML layouts. Entire UI toolkit in `ui/Ui.kt` (129 lines): `dp()`, `vertical()/horizontal()` layouts, `text()/title()/subtitle()`, `secondaryColor()/primaryColor()/onPrimaryColor()/surfaceColor()` (Material3 DayNight tokens → auto dark/light), `card()`, `input()`, `button()`, `spinner()`, `progress()`, `pillBackground()`, `space()`, `bubble()` chat bubbles
- **Theme:** `Theme.GaGaChat` — parent `Theme.Material3.DayNight.NoActionBar`, transparent status/nav bars, `windowLightStatusBar` adaptive; `Theme.GaGaChat.Starting` splash theme
- **LINE-inspired** visual language: colored chat bubbles, pills, accent tabs
- **Strings: 233 app strings × 12 app locales** (ar, bn, de, es, fr, hi, id, pt, ru, tr, ur, zh) + system default; per-app language selection via AppLocalesMetadataHolderService (M-04), `lang_*` selectors for all 12 + system
- APK resources also carry 88 library locale configs (AndroidX/zxing) — matches expectations
- Assets verified in APK: `gaga_logo_master` (brand logo, Auth/Main), `ic_stat_gaga` (notification small icon), `ic_launcher` + `ic_launcher_round` (adaptive icon, all densities), `splash_background`, `ic_call_answer` / `ic_call_answer_video` / `ic_call_decline` (call-notification actions). Avatar fallback is programmatic (deterministic hue + initials — no static asset needed)

### 1.5 Key feature strings verified in APK resources

`tab_chats`, `tab_calls`, `tab_contacts`, `tab_wallet`, `tab_me`, `wallet_coming_soon_title`, `wallet_topup/send/withdraw`, `incoming_call_title`, `incoming_video_call`, `call_notification_*` (answer/answer_video/decline/hang_up actions + texts), `delete_account`, `delete_message`, `my_qr`, `scan_qr`, `share_profile_link`, `typing`, `notification_settings`, `biometric_title`, `settings_appearance`, `theme_dark`, `theme_light`, `lang_*`, `export_data`, `add_friends`, `add_by_username`, `add_friend_via_link`, `voice_note_*` (11 strings), `search_hint`, `report_user`, `block_user`, `group_title`, `group_members_hint`, `create_group`, `connection_title`, `connection_ready/unhealthy/checking`, `storage_media_size`, `clear_temp_media`, `audio_attachment`, `file_attachment`, `attachment_unsupported` — **all present.**

### 1.6 Runtime permission model

17 permissions declared: INTERNET, ACCESS_NETWORK_STATE, POST_NOTIFICATIONS, FOREGROUND_SERVICE (+ DATA_SYNC / MICROPHONE / CAMERA types for GaGaService), RECEIVE_BOOT_COMPLETED, VIBRATE, USE_BIOMETRIC, USE_FINGERPRINT, CAMERA, RECORD_AUDIO, MODIFY_AUDIO_SETTINGS, WAKE_LOCK, USE_FULL_SCREEN_INTENT, com.google.android.c2dm.permission.RECEIVE (FCM), DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION.

### 1.7 Firebase & WebRTC baked in

- Firebase config baked into APK resources: `google_app_id 1:545448312835:android:d57316588ac5a8f9cd8e36`, project `oumagachat`, sender `545448312835`, rtdb URL `asia-southeast1` (matches google-services.json for package `gagachat.app`)
- `libjingle_peerconnection_so.so` present in **4 ABIs** (arm64-v8a, armeabi-v7a, x86, x86_64) — every device architecture covered for native calls
- M-02 honored: TURN credentials are ephemeral, fetched at runtime via GET /calls/turn — nothing static in the APK

### 1.8 PDF module map — every module COMPLETE in APK

| PDF module | Implementation in APK | Status |
|---|---|---|
| Onboarding (auth) | AuthActivity (register/login/OTP/24-country picker) | ✅ |
| Home | MainActivity 5 tabs + live WS updates | ✅ |
| Chat | ChatActivity (WS, typing, search, delete-for-everyone, attachments) | ✅ |
| Media | upload-ticket → PUT → complete, ImageCompressor, ProgressRequestBody progress, ImageViewActivity preview, outbox retry | ✅ |
| Voice Notes | VoiceNoteActivity (record/preview/discard/send) | ✅ |
| Groups | CreateGroupActivity + GroupActivity (info/members/add/remove) | ✅ |
| Calls | CallEngine (WebRTC) + CallActivity + IncomingCallActivity + CallHistoryActivity + CallNotifications | ✅ |
| Wallet | WalletActivity + wallet tab (top-up/send/withdraw/history + coming-soon gate per PDF §19) | ✅ (gated) |
| Profile | ProfileActivity (avatar/name/bio/username/QR/share) | ✅ |
| Safety | SafetyActivity (block/report/blocked list) | ✅ |
| Settings | Settings + NotificationSettings + Storage + ConnectionStatus screens | ✅ |
| Local data | MessageOutboxWorker offline queue, SessionStore/AppPrefs persistence | ✅ |

---

## PART 2 — BACKEND AUDIT

### 2.1 Endpoint inventory — 50 routes (verified by extraction)

**Auth (6):** POST /auth/register · /auth/login · /auth/verify · /auth/refresh · /auth/logout · /auth/otp/request
**Users (5):** GET /users/me · PUT /users/me · GET /users/me/export · POST /users/me/delete · GET /users/:username
**Chats & messages (12):** GET /chats · POST /chats/dm · POST /chats/group · DELETE /chats/:id · GET /chats/:id/messages · POST /chats/:id/messages · DELETE /chats/:id/messages/:messageId · POST /chats/:id/read · GET /chats/:id/group · PUT /chats/:id/group · POST /chats/:id/members · DELETE /chats/:id/members/:userId
**Contacts (3):** GET /contacts · POST /contacts · DELETE /contacts/:id
**Friend requests (3):** GET /friend-requests · POST /friend-requests/:id/accept · POST /friend-requests/:id/reject
**Blocks (3):** GET /blocks · POST /blocks · DELETE /blocks/:id
**Search & reports (2):** GET /search · POST /reports
**Calls (4):** POST /calls · POST /calls/:id/end · GET /calls/history · GET /calls/turn
**Wallet (4):** GET /wallet · POST /wallet/send · POST /wallet/topup · POST /wallet/withdraw
**Media (3):** POST /media/upload-ticket · POST /media/:id/complete · GET /media/:id
**Devices (2):** POST /devices · DELETE /devices
**System (2):** GET /health · GET /ready
**Staging-only (1):** POST /upload — multer local adapter; **503 `object_storage_not_configured` in production** so the OSS ticket flow is the only production media path (intentional)

**WebSocket:** /ws upgrade — Bearer auth + session check, 5s connect timeout, maxPayload 64KB, query-token fallback disabled in production.

### 2.2 Android → backend mapping — 46 unique calls, 0 misses

Every API call site in the app (39 raw sites; 46 unique normalized calls) was extracted from the Kotlin sources and matched against the backend inventory (path params normalized to `:x`):

- **Auth:** /auth/register, /auth/login, /auth/verify, /auth/refresh, /auth/logout, /auth/otp/request ✅
- **Users:** /users/me (GET/PUT), /users/me/export, /users/me/delete, /users/:username ✅
- **Chats:** /chats, /chats/dm, /chats/group, /chats/:id, /chats/:id/messages (GET/POST/DELETE), /chats/:id/read, /chats/:id/group (GET/PUT), /chats/:id/members (POST/DELETE) ✅
- **Contacts:** /contacts (GET/POST/DELETE) ✅
- **Friend requests:** /friend-requests, /friend-requests/:id/accept, /friend-requests/:id/reject ✅
- **Blocks:** /blocks (GET/POST/DELETE) ✅
- **Search/Reports:** /search, /reports ✅
- **Calls:** /calls/turn, /calls, /calls/:id/end, /calls/history ✅
- **Wallet:** /wallet, /wallet/send, /wallet/topup, /wallet/withdraw — WalletActivity dispatch verified: `send` → POST /wallet/send, `topup`/`withdraw` → POST /wallet/$mode ✅
- **Media:** /media/upload-ticket, /media/$id/complete, /media/:id ✅
- **Devices:** POST /devices (FCM token registration) ✅
- **System:** /health, /ready (ConnectionStatusActivity) ✅

**Result: 0 misses.** Every app call resolves to a real route with matching verb and path shape. Full listing: `audit/reports/android-api-calls.txt` (39 raw sites) + mapping verified programmatically.

### 2.3 WebSocket protocol — client ↔ server consistent

Server `handleWsMessage` (server.js) handles exactly the message types the app sends; every relay is authorization-checked:

| Client message | Server handler | Authorization enforced |
|---|---|---|
| `ping` → `pong` (client pingInterval 25s) | echoes `pong` with timestamp | connection already authed |
| `typing` (chat_id, to) | relays `typing` to recipient | `isMember(chat_id)` for both users + `isBlockedEither` check |
| `call_signal` (call_id + FLAT ICE fields) | relays to the other call participant | `callById` ownership (caller or callee only) + block check |
| `presence` | setLastSeen + redis presence + broadcast to contacts | authed user |

Messages themselves are sent via HTTP POST /chats/:id/messages (idempotent, outbox-retried offline); the WS channel delivers events to recipients with per-delivery session validation.

### 2.4 Session validation & token rotation

- **WS connect:** Bearer token on `Authorization` header → `verify()` + `db.isSessionActive(sid, sub)` → HTTP 401 if invalid (query-token fallback disabled in production)
- **Per-delivery:** `validSocketSession(ws)` re-verifies on **every outgoing event**; closes 4001 `session_expired` on failure → logout/revocation takes effect instantly even across multiple ECS instances
- **App recovery:** `GaGaWs.disconnected` → close code 4001 → `Api.refreshTokens(failedToken)` → reconnect, backoff reset to 1s
- **HTTP 401:** OkHttp Authenticator → POST /auth/refresh (once) → retry; concurrent-rotation safe via `failedToken` comparison + `@Synchronized` refresh

### 2.5 Rate limits — 7 namespaces (verified in source)

| Namespace | Limit | Key |
|---|---|---|
| auth-ip | 30 / 10 min | req.ip |
| otp-phone | 5 / 15 min | phone |
| refresh-ip | 120 / 10 min | req.ip |
| account-delete | 5 / hour | req.userId |
| search | 120 / min | req.userId |
| reports | 10 / hour | req.userId |
| media | 240 / min | req.userId |

### 2.6 Security headers & hardening (verified in source)

`Cache-Control: no-store` · CSP `default-src 'none'; frame-ancestors 'none'` · `Cross-Origin-Resource-Policy: same-site` · `Referrer-Policy: no-referrer` · HSTS `max-age=31536000; includeSubDomains` · `X-Content-Type-Options: nosniff` · `X-Frame-Options: DENY`
Body limits: express.json 1MB, urlencoded 64KB, WS payload 64KB, WS upgrade timeout 5s.
Wallet demo mode: `DEMO_WALLET_ENABLED = !IS_PRODUCTION && ENABLE_DEMO_WALLET` → 503 `wallet_not_available` in production (no money minted — test asserts "no welcome money is minted").
Release-gate contract `/api/ready` → `ready:true, database:"rds-mysql", realtime:"redis", media:"oss"` — prior-session fix holds and is regression-locked.

### 2.7 Backend tests re-run during this audit

```
node --test test/release-regression.js → # pass 8 / # fail 0
node test/smoke.js                     → SMOKE RESULT: 60 passed, 0 failed
```
Highlights of what the smoke suite proves: private-media ACLs, idempotent message retries, WS relay authorization, ephemeral TURN, call ring/signal flow, logout revokes session + closes socket with auth-expired code, staging upload adapter rejection of unsafe types, WS URL token fallback disabled.
Full output: `audit/reports/backend-tests.txt`

---

## PART 3 — FINDINGS & CONCLUSIONS

### 3.1 Gaps found: NONE

- All 19 app screens compiled into the APK, manifest-declared, launchable (21 activities incl. 2 library)
- Design system (Material3 DayNight, LINE-inspired, programmatic UI) fully in place; 233 strings × 12 locales
- All 12 PDF modules implemented and present
- 46 Android API calls → 50 backend routes: 0 misses; protocol verbs/shapes match
- WS protocol fully consistent between client and server (ping/typing/call_signal/presence)
- Tests re-run: 8/8 + 60/60 PASS; release-gate contract holds

### 3.2 Notes (not gaps)

1. **POST /upload (staging-only):** local multer adapter; returns 503 in production so OSS ticket flow is the only media path. The app never calls it — by design.
2. **DELETE /devices (unused by app):** kept for API completeness. The app registers FCM tokens on login; logout revokes server-side sessions. Not a gap.
3. **Wallet coming-soon gating:** per PDF §19 — Wallet UI is present with full history view; the API returns 503 `wallet_not_available` in production unless demo mode is explicitly enabled in staging. The UI handles this gracefully (coming-soon messaging).
4. **TURN:** ephemeral credentials via GET /calls/turn; nothing static baked into the APK (M-02 honored).
5. **Alibaba Cloud provisioning:** unchanged from prior session — account risk-control still blocks paid resource creation; runbook delivered previously (`RUNBOOK-ACCOUNT-UNBLOCK.md`). Existing VPC/vSwitch/SG remain valid.

### 3.3 Audit trail / evidence files

| File | Contents |
|---|---|
| `audit/reports/apk-badging.txt` | aapt2 dump badging (package, SDK levels, permissions) |
| `audit/reports/apk-manifest-tree.txt` | full manifest XML tree (21 activities, 17 permissions, services, App Links) |
| `audit/reports/apk-resources.txt` | aapt2 dump resources (strings × locales, drawables, themes) |
| `audit/reports/dex-classes.txt` | all 292 app/gagachat dex class entries (46 top-level) |
| `audit/reports/backend-endpoints.txt` | 50-route inventory (verb + path) |
| `audit/reports/android-api-calls.txt` | 39 raw Android Api.* call sites |
| `audit/reports/backend-tests.txt` | npm test full output (8/8 + 60/60 PASS) |
| `audit/reports/count_strings2.py` | string/locale verification script |
| `audit/apk/universal/` | extracted universal APK (classes.dex ×2, res/, lib/ 4 ABIs, Firebase props) |

---

**AUDIT COMPLETE — frontend fully verified in APK (all screens, design, features), backend fully verified consistent with the app. No fixes required.**
