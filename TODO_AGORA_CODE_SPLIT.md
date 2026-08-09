# Agora SDK Code-Splitting — Performance Optimization

## Goal

Remove the 1.1 MB `agora-rtc-sdk-ng` (309 KB gzip) from the initial bundle so it
only loads when a call actually starts. This reduces initial load time for the
majority of users who don't initiate a call immediately.

## Root Cause

`src/lib/agora.ts` and `src/hooks/useAgoraCall.ts` both do **static top-level**
`import AgoraRTC from 'agora-rtc-sdk-ng'`. Even though `agora.ts` has a
`getAgoraRTC()` lazy getter, the static import forces Vite/Rollup to include the
whole SDK in the main chunk → 1,145 KB chunk exceeding the 800 KB limit.

## Steps

- [x] 1. Identify all importers of `agora-rtc-sdk-ng` / `@/lib/agora`
      (agora.ts, useAgoraCall.ts, useWebRTCManager.ts)
- [x] 2. `src/lib/agora.ts` — remove static `import AgoraRTC`; make `getAgoraRTC()`
       async using `await import('agora-rtc-sdk-ng')`; keep only type-only imports
- [x] 3. `src/hooks/useAgoraCall.ts` — remove static `import AgoraRTC`; make
       `join()`/`flipCamera()` await the dynamically-loaded module
- [x] 4. Update `useWebRTCManager.ts` if it references any Agora runtime API
       (it only imports `useAgoraCall` + `agoraToken` → no change needed)
- [x] 5. Typecheck `npx tsc -b --noEmit` → 0 errors
- [x] 6. Build `npm run build` → verify Agora SDK splits into its own lazy chunk
- [x] 7. Lint `npm run lint` → 0 errors

## Result

- **Before:** Agora SDK (1,145 KB) was part of the initial bundle graph; `index.html`
  loaded the full app including the SDK.
- **After:** `index.html` loads only `index-NsTq08LI.js` (168 KB). The Agora SDK is
  now a separate lazy chunk (`agora-rtc-sdk-ng-jBVDXKLy.js`, ~1,119 KB) that is only
  downloaded when `getAgoraRTC()` is first called — i.e. when a call actually starts.
- Initial load no longer pays the 1.1 MB SDK cost for users who don't call immediately.
