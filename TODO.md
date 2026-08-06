# Calling Fix & Improvement TODO

## Steps
- [x] 1. Fix `CallContext.tsx` — derive `currentUser` internally so `startCall({ id }, mode)` works (critical bug)
- [x] 2. Update `CallContextBase.ts` — clarify `startCall` signature (currentUserId optional/derived)
- [x] 3. Fix `CallOverlay.tsx` — import from `@/hooks/useWebRTCManager`; fix redundant Video/Voice badge ternary
- [x] 4. Clean up `CallPage.tsx` formatting (`navState`/`mode`)
- [x] 5. Fix `CallListItem.tsx` — shared duration helper + distinct direction icons
- [x] 6. Remove stale duplicate `src/lib/useWebRTCManager.ts` (verify no imports first)
- [x] 7. Run `npx tsc --noEmit` and build to verify no regressions
