# Multi-Party Group Call — Tracking

## Goal
Enable true multi-party group calls (multiple concurrent participants in one Agora channel).

## Steps
- [x] Step 1: `useAgoraCall.ts` — multi-remote `Map<number, remote>` + track maps; `user-joined/user-published/user-unpublished/user-left`; UID type fix; `remoteParticipants` exposed
- [x] Step 2: `useWebRTCManager.ts` — `remoteParticipants` bridged state (MediaStreams), exposed in return
- [x] Step 3: `CallContext.tsx` — wired `remoteParticipants` through `CallContextValue` (uid→id bridge + legacy fallback)
- [x] Step 4: `CallOverlay.tsx` — destructured `remoteParticipants`; added `GroupRemoteVideo`; multi-party video grid for group calls
- [x] Step 5: `useCallStore.ts` — added `inviteToCall` + `participants` array; `startCall` accepts group types
- [x] Typecheck (`npx tsc -b --noEmit`) — clean
- [x] Build (`npm run build`) — 3218 modules transformed, `tsc -b` clean
- [x] Deploy to Firebase Hosting — `Deploy complete!` → https://oumagachat.web.app
