# GaGa Chat — Firebase / Supabase / ZEGOCLOUD Review & Completion Report

**Repository:** `omarouma/app` (branch `main`)
**Firebase project:** `oumagachat` → https://oumagachat.web.app
**Supabase project:** `fcjgbbmfqdkucfpqjxae` → https://fcjgbbmfqdkucfpqjxae.supabase.co
**ZEGOCLOUD App ID:** `372536818`
**Date:** 2026-09-19

---

## 1. Executive Summary

The application was reviewed end-to-end against the three requested areas: the
Firebase project, the new ZEGOCLOUD audio/video calling project, and the chat
page. Two **critical, call-breaking / feature-breaking bugs** were found and
fixed, the ZEGO token pipeline was corrected to emit the exact token format the
SDK requires, the chat list visibility bug was resolved, and the app was rebuilt
and deployed to Firebase Hosting with real audio/video calling support.

| Area | Status |
|------|--------|
| Firebase project (hosting, config, CSP) | ✅ Verified & updated |
| Supabase backend (auth, DB, RLS, realtime) | ✅ Verified |
| ZEGOCLOUD calling (token, signaling, CSP) | ✅ Fixed & deployed |
| Chat page (list visibility) | ✅ Fixed |
| Build | ✅ Succeeded (54.9 s) |
| Deploy | ✅ Live at https://oumagachat.web.app |

---

## 2. Critical Bugs Found & Fixed

### 2.1 Chat list never rendered (stuck loading skeleton) — FIXED

**Symptom:** Users could not see their chat list at all; the page showed the
loading skeleton forever.

**Root cause:** `useChatStore.loadingChats` was initialised to `true` and was
only ever set to `false` inside `fetchChats()`. However, `fetchChats()` is
**never called** anywhere in the app — the chat list is driven entirely by the
realtime subscription `subscribeChats()`. Because the flag was never cleared,
`ChatsPage` (and `DesktopChatView`) always rendered `<LoadingSkeleton/>`.

**Fix (`src/store/useChatStore.ts`):**
- The `subscribeChats` realtime callback now sets `loadingChats: false` when it
  delivers data.
- The early-return guard (when Firestore/Supabase is unavailable or `userId` is
  missing) now also clears the flag so the UI falls through to the empty state
  instead of hanging.

**Verification:** Signed in as a test user and confirmed the exact query the app
issues — `chats?participants=cs.{userId}` — returns the user's chat row, and the
`public_profiles` lookup for the other participant resolves the display name and
avatar.

### 2.2 ZEGO kit token format was wrong — every call failed to join — FIXED

**Symptom:** Every audio/video call failed to connect; the SDK logged
`kitToken error` and the call hung in a "connecting" state.

**Root cause:** The `zego-token` Edge Function returned only the **bare JWT**.
The ZEGO UIKit prebuilt SDK's `create(kitToken)` parser (`Ke`) requires a **kit
token** of the form:

```
<raw-jwt>#<base64(JSON.stringify({ userID, roomID, userName, appID }))>
```

Its parser does `e.split('#').length > 1 ? JSON.parse(atob(e.split('#')[1])) :
<error>` and reads `{appID, userID, userName, roomID}` from the base64 JSON,
using `e.split('#')[0]` as the raw auth token. A bare JWT therefore fails
parsing and no room is ever joined.

**Fix:**
- `supabase/functions/zego-token/index.ts` now returns both `token` (bare JWT)
  and `kitToken` (the full `<jwt>#<base64>` string), plus `appID`, `roomID`,
  `userID`, `expireAt`. It also accepts a `name` query param and embeds the
  URL-encoded user name in the kit info.
- `src/hooks/useZegoCall.ts` now sends `name` and prefers `data.kitToken`
  (falling back to `data.token` for older deployments).
- The function was redeployed (now **version 37, ACTIVE**).

**Verification:** Live call to the deployed function returned a `kitToken`
containing `#`, whose base64 payload decoded to
`{userID, roomID, userName, appID: 372536818}` and whose raw token had 3 JWT
segments.

### 2.3 ZEGO `serverUrl` misconfiguration — FIXED

`ZegoCloudRoomConfig.serverUrl` is **not** the signaling server. In the SDK it
is forwarded to `zegoService.setLogServer()` (telemetry only). The SDK hardcodes
signaling as `wss://webliveroom<appID>-api.zegocloud.com/ws` and auto-discovers
the nearest access hub from `accesshub-wss.{zegocloud.com,coolzcloud.com}`.
Pointing `serverUrl` at a `webliveroom…/ws` URL misdirects the log reporter and
does not affect connectivity. The assignment was removed from
`getZegoCallConfig()` with an explanatory comment.

### 2.4 CSP blocked ZEGO regional domains — FIXED

The Content-Security-Policy only allowed `*.zegocloud.com` / `*.zegocdn.com`,
but the SDK also uses `coolzcloud.com`, `coolfcloud.com`, and `zego.im` for
access-hub discovery and media. These were added to `connect-src` in
`firebase.json`. The live deployment now serves the corrected CSP.

---

## 3. ZEGOCLOUD Integration — Verified Wiring

| Component | Detail |
|-----------|--------|
| App ID | `372536818` (public, in client bundle) |
| Server secret | Stored **only** as a Supabase Edge Function secret (`ZEGO_SERVER_SECRET`), never shipped to the client |
| Token endpoint | `https://fcjgbbmfqdkucfpqjxae.supabase.co/functions/v1/zego-token` (GET) |
| Auth | Caller must present a valid Supabase session; the function verifies the caller is a participant of the `call_history` row (`status ∈ {calling, connected}`) |
| Room ID | `call_<callId>` (via `buildZegoRoomID`) |
| User ID | Sanitised app user ID (via `deriveZegoUserID`) |
| SDK | `@zegocloud/zego-uikit-prebuilt` v2.18.1, lazily imported (5.2 MB chunk, only loaded when a call starts) |
| Signaling | Supabase Realtime (`call_history`, `call_signaling`, `call_participants`, `call_events`) |
| Media | ZEGO Cloud (audio/video), with camera/mic Permissions-Policy enabled |

**Call flow:** `useCallStore.startCall` verifies media, creates a `call_history`
row (`status: 'calling'`, 60 s timeout) → the callee's realtime subscription
receives it → `acceptCall` → both sides mount the ZEGO container and join the
room `call_<id>` using a server-minted kit token → `endCall` finalises the row.

---

## 4. Supabase Backend — Verified

- **Project live:** `fcjgbbmfqdkucfpqjxae` (the previously referenced
  `alzwgikndwbecuqmlrca` project is dead — HTTP 000).
- **Data:** 23 chats, 142 messages, 29 users; `public_profiles` view present.
- **RLS confirmed:**
  - `chats_select_participant`: `(auth.uid())::text = ANY (COALESCE(participants, '{}'::text[]))`
  - `call_history_participant_select`: checks caller / callee / participant_ids
  - `users_select_all`: `true`
- **Realtime publication** includes `chats`, `messages`, `call_history`,
  `call_signaling`, `call_participants`, `call_events`.
- **Edge Functions ACTIVE:** `zego-token` (v37), `zego-callback`, `send-fcm-push`,
  `send-push`, `ai-chat`, `create-call`, `send-message`, `link-preview`,
  `send-web-push`.

---

## 5. Firebase — Verified & Updated

- **Project:** `oumagachat`; hosting public dir `dist`; `cleanUrls: true`.
- **Web config** retrieved via the Management API and written to `.env`.
- **Service account** validated (`openssl rsa -check`) and used for deployment.
- **CSP** updated with ZEGO regional domains (see 2.4).
- **Permissions-Policy:** `camera=(self), microphone=(self)` — required for calls.
- **Deployment:** `firebase deploy --only hosting` → 141 files uploaded, release
  complete. Live at **https://oumagachat.web.app** (HTTP 200).

---

## 6. Build & Deploy

```
npm run build   → ✓ built in 54.90s
                  dist/assets/index-Dre8r1xv.js        (186.7 kB)
                  dist/assets/vendor-zego-ui-*.js      (5,202.5 kB, lazy)
firebase deploy --only hosting → ✓ Deploy complete
```

---

## 7. Files Changed

| File | Change |
|------|--------|
| `src/store/useChatStore.ts` | Clear `loadingChats` in realtime callback + guard (chat list fix) |
| `src/hooks/useZegoCall.ts` | Send `name`; prefer `kitToken`; pass `userName` to token fetch |
| `src/lib/zego.ts` | Removed invalid `serverUrl` assignment; documented SDK behaviour |
| `supabase/functions/zego-token/index.ts` | Return full kit token + `name` param |
| `firebase.json` | Added ZEGO regional domains to CSP |
| `.env.example` | Updated ZEGO App ID (`372536818`) and Supabase ref (`fcjgbbmfqdkucfpqjxae`) |
| `.env` (new) | All new Supabase / Firebase / ZEGO credentials |
| `.firebase-sa.json` (new) | Firebase service account for deployment |

---

## 8. Remaining / Recommended Work

1. **ZEGO callback endpoint** — `zego-callback` exists but should be registered
   in the ZEGOCLOUD console (Callback secret `571d8d6b…`) so server-side room
   events (call quality, disconnects) are recorded.
2. **Group calls** — the current ZEGO path is 1:1 (`maxUsers: 2`). Group calling
   would need a separate room strategy.
3. **TURN/relay fallback** — ZEGO handles NAT traversal, but for maximum
   reliability on restrictive networks consider enabling ZEGO's relay.
4. **`.env` hygiene** — `.env` and `.firebase-sa.json` contain live secrets and
   must remain git-ignored (verify `.gitignore`).
5. **Automated tests** — add an integration test that mints a kit token and
   asserts the `#`-delimited format to prevent regression.

---

## 9. Verification Evidence

- Chat query: `GET /rest/v1/chats?participants=cs.{uid}` → returned the user's
  direct chat with `last_message` and resolved participant profile.
- ZEGO token: `GET /functions/v1/zego-token?room=call_<id>&user=<uid>&name=…`
  → `{ token, kitToken, appID: 372536818, roomID, userID, expireAt }`; kitToken
  decoded to the expected `{userID, roomID, userName, appID}` payload.
- Live site: `HTTP/2 200`, CSP includes `*.coolzcloud.com`, `*.coolfcloud.com`,
  `*.zego.im`; Permissions-Policy allows camera/microphone.
- Test data (test user, test chat, test call row) removed from production.
