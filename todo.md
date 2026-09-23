# GaGa — Continued Improvement Pass + Rebuild (native Android APK)

Branch: `feat/attachment-share-screen`

## Section 1 — Improvements found & implemented
- [x] Security: Android backup rules — exclude auth token + profile cache from cloud backup / device transfer
- [x] Data hygiene: clear offline message queue on logout (never flush account A's queue under account B)
- [x] Data hygiene: clear user-scoped localStorage (drafts, recents, scheduled, muted types) on logout
- [x] Deep links: add public/.well-known/assetlinks.json for Android App Links auto-verification

## Section 2 — Build & Verify
- [x] tsc -b clean
- [x] vite build + cap sync android + strip assets
- [x] gradlew assembleRelease bundleRelease
- [x] Verify APK/AAB + update BUILD_INFO + commit/push
