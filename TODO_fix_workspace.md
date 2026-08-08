# Fix Workspace Diagnostics

## Steps

- [x] 1. Fix `tsconfig.json` — add `ignoreDeprecations: "6.0"` for deprecated `baseUrl` (also added `strict` + `forceConsistentCasingInFileNames` to silence Edge Tools)
- [x] 2. Fix `useWebRTCManager.ts` — sync `isConnectedRef` on ended/error path
- [x] 3. Fix `webrtc.ts` — add permission pre-check to `flipCamera`
- [x] 4. Fix `CallOverlay.tsx` — fix top bar layout when badge+timer+quality all visible
- [x] 5. Fix `CallPage.tsx` — guard auto-navigate so it doesn't fire before call initiated
- [x] 6. Fix `README.md` — markdownlint bare URLs + fenced code languages
- [x] 7. Run `npx tsc -b` — verify zero TS errors
- [x] 8. Run `npm run build` — verify clean production build
- [x] 9. Redeploy to Firebase Hosting
