# GaGa Chat — Improvement, Build & Deployment Report

**Date:** 2026-09-16
**Version:** 1.0.2
**Branch:** `improve/screens-and-calling`
**Pull Request:** https://github.com/omarouma/app/pull/2
**Live preview:** https://sites.super.myninja.ai/165e00ac-3c19-4313-a0f7-a5f26b39fa31/41bbc85b/index.html

---

## 1. Calling service (top priority)

The calling stack is a **self-hosted WebRTC 1:1 service** with no third-party paid SDK.

| Component | File | Status |
|---|---|---|
| Signaling gateway | `alibaba-calling/server.mjs` | Audited, syntax verified |
| WebRTC client | `src/lib/alibabaCall.ts` | Audited (reconnect, ICE renewal, quality sampling, flip, DTMF) |
| Call state | `src/store/useCallStore.ts` | Audited (60s timeout, retries, stable UUID) |
| Call UI | `src/components/calling/CallOverlay.tsx` | **Improved: real DTMF keypad** |
| Connection monitor | `src/hooks/useCallConnectionManager.ts` | Fixed exhaustive-deps warning |
| WebRTC manager | `src/hooks/useWebRTCManager.ts` | **Rewritten** to remove setState-in-effect |

### Fixes applied
- **Schema alignment:** `call_history.type` default changed from `'audio'` → `'voice'` so it matches the gateway's accepted values (`['voice','video']`) and the app's writes.
- **Real DTMF keypad:** replaced the placeholder with a working 3×4 keypad (`1–9, *, 0, #`) that sends in-band tones over the active call.
- **Hook correctness:** eliminated all `react-hooks/set-state-in-effect` and `exhaustive-deps` warnings in the calling hooks using render-time state reset and derived values.
- **ZEGO removed:** the legacy ZEGO SDK dependency and all its references were removed from the app and the CI workflow.

### Reliability features (already present, verified)
- Automatic reconnect with exponential backoff (4 attempts).
- ICE renewal every 45 minutes.
- Quality sampling (packet loss / jitter / RTT).
- Authenticated coturn TURN credentials (HMAC-SHA1, 1-hour expiry).
- Rollback on failed SDP offer.

---

## 2. Screen improvements

Fabricated/misleading data was removed and replaced with real data or honest empty states.

| Screen | Issue | Fix |
|---|---|---|
| `HashtagsPage.tsx` | Fabricated `MOCK_HASHTAGS` shown as real trending data | Removed mock array; uses only real store data with proper empty states |
| `AnalyticsPage.tsx` | Hardcoded growth chart + fabricated demographics | Real growth chart from backend; honest "Audience demographics" empty state |
| `WalletPage.tsx` | Advertised promo codes that cannot be redeemed | Replaced with honest notice (redemption pending server-side verification) |
| `CreatorCenterPage.tsx` | Fabricated stats (50K+ creators, ৳2M+ earnings, per-topic counts) | Replaced with real value props; removed fabricated counts |

### P0 screens verified as solid
`ChatsPage`, `ChatRoomPage`, `SavedMessagesPage`, `CreateGroupPage`, `ShareTargetPage`, `BroadcastListsPage`, `GroupChatPage`, `ChatInfoPage`, `CallPage`, `CallsPage`.

### Admin authorization (verified server-side)
Admin access is enforced by the `get_my_profile` RPC (owner-scoped, `SECURITY DEFINER`) and RLS policies on the `reports` table — never by client-side flags alone.

---

## 3. Quality gates

| Gate | Result |
|---|---|
| `tsc -b` (TypeScript) | ✅ 0 errors |
| ESLint (whole project) | ✅ 0 errors, 0 warnings |
| Vitest | ✅ 141/141 tests pass |
| `vite build` | ✅ succeeds (140 hosting files) |
| `verify:release` | ✅ passes |
| `node --check alibaba-calling/server.mjs` | ✅ passes |

---

## 4. Build & deployment

### GitHub
- Branch `improve/screens-and-calling` pushed (89 files changed).
- Pull request **#2** opened against `main`.
- CI workflow (`.github/workflows/deploy.yml`) updated:
  - Removed obsolete ZEGO env vars and the `functions/` cache path.
  - Upgraded to Node 22.
  - Added typecheck, test, and calling-gateway syntax steps.
  - Build now uses the committed public config in `.env.production` (avoids empty-secret override that tripped the vite env-guard).
- **CI result:** lint ✅ · typecheck ✅ · tests ✅ · calling syntax ✅ · build ✅

### Firebase Hosting
- `firebase.json` and `.firebaserc` verified (project `oumagachat`, public `dist`, full CSP + security headers).
- Firebase CLI v15.30.1 installed.
- **Live deploy is blocked:** the `FIREBASE_SERVICE_ACCOUNT` GitHub secret is not configured, so the deploy step cannot authenticate. Once that secret is added, the workflow will deploy automatically on push to `main`.

### Public preview
The improved production build is deployed and serving (HTTP 200) at:
https://sites.super.myninja.ai/165e00ac-3c19-4313-a0f7-a5f26b39fa31/41bbc85b/index.html

---

## 5. Remaining action for the owner

To complete the Firebase live deploy, add the `FIREBASE_SERVICE_ACCOUNT` secret to the `omarouma/app` repository (Settings → Secrets and variables → Actions). The value is the JSON key for the service account `firebase-adminsdk-fbsvc@oumagachat.iam.gserviceaccount.com`. After that, merging the PR to `main` (or re-running the workflow) will publish to `oumagachat.web.app`.
