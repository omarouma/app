# Cleanup, Fix, Build & Deploy — Session Tracking

## Objective

Clean up completed TODO tracking files, fix remaining code issues (ESLint warnings + ChatHeader wiring), run a clean production build, and deploy to Firebase Hosting.

## Steps

- [x] 1. Delete all completed TODO/\*.md tracking files
- [x] 2. Fix ESLint warnings in remaining files (WARN_FIX_TODO.md)
- [x] 3. Wire missing ChatHeader props in ChatRoom.tsx (CODE_FIX_HEADER_TODO.md)
- [x] 4. Verify Agora build/typecheck (TODO.md / TODO_AGORA_CALLING.md)
- [x] 5. Run `npm run build` — confirm zero errors
- [x] 6. Deploy to Firebase Hosting (https://oumagachat.web.app)
- [x] 7. Update tracking docs

## Status: COMPLETE

All steps verified in the final sweep:
- ESLint passes clean (0 errors / 0 warnings)
- ChatHeader props fully wired (CODE_FIX_HEADER_TODO.md resolved)
- Agora build/typecheck clean (`tsc -b` → 0 errors)
- Production build succeeds (3218 modules)
- Deployed to https://oumagachat.web.app
