# TODO: WARN_FIX_TODO.md Cleanup Execution

## Goal
Fix all 96 ESLint warnings and 4 Vite build warnings so `npm run build` and `npm run lint` report clean.

## Plan Steps

- [x] 1. Run `npm run lint` to capture current warnings baseline
- [x] 2. Phase 1: Remove stale `// eslint-disable` directives (~34) — already resolved in prior sessions
- [x] 3. Phase 2: Remove unused imports/variables (~30) — last 2 fixed (CallListItem `Users`, PostPage `Link2`)
- [x] 4. Phase 3: ChatRoom.tsx unused handlers/state (~30) — already resolved in prior sessions
- [x] 5. Phase 4: GroupChatPage.tsx unused destructuring (~7) — already resolved in prior sessions
- [x] 6. Phase 5: Vite chunk warnings (4) — no remaining warnings observed
- [x] 7. Verify `npm run build` → clean (tsc -b passed, vite build succeeded)
- [x] 8. Verify `npm run lint` → clean (0 errors, 0 warnings)
- [x] 9. Deploy to Firebase hosting
