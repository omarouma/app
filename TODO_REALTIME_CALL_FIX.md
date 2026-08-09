    \ Real-Time Call Improvements — Implementation Steps

## Objective
Fix and improve all remaining real-time call related implementations so the
call pipeline is robust, avoid duplicate/conflicting state, and the UI reacts
correctly to live call state.

## Steps
- [x] 1. Make `useWebRTCManager` the single source of truth for call media state.
- [x] 2. Refactor `CallContext.tsx` to delegate media ops (mute/video/localTracks) to the shared WebRTC manager instead of maintaining dead local state.
- [x] 3. Wire `subscribeToCallHistory` to also update `currentCall`/`incomingCall` so the CallsPage reflects live state (already handled by `App.tsx` global `subscribeCalls` + store's `processCallData` which updates `currentCall`/`incomingCall`; CallsPage uses `subscribeToCallHistory` for history only as intended).
- [x] 4. Use `getOtherParticipantId` consistently in `CallOverlay.tsx` for group-call robustness (CallPage derives `otherUserId` from nav state by design).
- [x] 5. Add reconnection/quality + hold resilience polish in CallOverlay (present: hold status chip, quality chip, reconnect chip, PiP bubble).
- [x] 6. Clean up unused imports/vars surfaced by lint (`CallContext.tsx` no longer imports `stopStreamTracks`; dead local stream state removed).
- [x] 7. Verify with `npx tsc --noEmit` → 0 errors.
- [x] 8. Verify with `npm run build` → clean production build.
- [x] 9. Update `CALLING_FIX_TRACKING.md`.
