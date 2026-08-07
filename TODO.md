# Layout, Navigation & Realtime Production Improvements

## A. Layout & Screen-Size

- [x] A1: Desktop max-width container (App.tsx) — center content on ultra-wide screens
- [x] A2: DesktopNav active-state label/indicator (App.tsx)

## B. Bottom Navigation

- [x] B4: Realtime badge — add missed-call indicator to Calls tab (BottomNav.tsx)
- [x] B5: Active tab icon spring animation via framer-motion (BottomNav.tsx)

## C. Realtime Production Hardening

- [x] C8a: Adopt `attachRealtimeResilience` in useChatEffects user_presence channel
- [x] C8b: Adopt `attachRealtimeResilience` in useTyping channel
- [x] C8c: Adopt `attachRealtimeResilience` in useChatListTyping channel

## D. Build & Deploy

- [x] D: Run `tsc -b --noEmit`, `npm run build`, `firebase deploy --only hosting`
  - [x] `tsc -b --noEmit` — zero errors (tsc-build-verify.txt empty)
  - [x] `npm run build` — ✓ built in 12.89s (3212 modules, all chunks emitted)
