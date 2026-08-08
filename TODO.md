# Lint Cleanup & Verification

## Objective

Clean up the 7 ESLint warnings and verify the app builds cleanly.

## Steps

- [ ] 1. Fix `src/hooks/useWebRTCManager.ts` — missing deps in useEffect (1 warning)
- [ ] 2. Fix `src/components/features/chat/MessageItem.tsx` — unused `selectionMode` prop (1 warning)
- [ ] 3. Fix `src/components/features/chat/ChatRoom.tsx` — unused `useEffect`, `getDefaultAvatar`, dead eslint-disable directives, unused `swipeState` (5 warnings)
- [ ] 4. Remove temporary diagnostic file `eslint_scan.mjs`
- [ ] 5. Run `npx tsc --noEmit` → confirm 0 errors
- [ ] 6. Run `npm run build` → confirm clean build
- [ ] 7. Run ESLint scan → confirm 0 errors 0 warnings
