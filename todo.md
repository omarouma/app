# GaGa — Build globally-usable native Android APK

Branch: `feat/attachment-share-screen`

## Section 1 — Clean build
- [x] Free disk (was 100%) — cleared gradle caches + build intermediates
- [x] tsc -b clean
- [x] vite build
- [x] cap sync android + strip web-only assets
- [x] gradlew assembleRelease bundleRelease (R8 + shrinkResources)

## Section 2 — Verify global usability
- [x] Signature v1/v2/v3 verified
- [x] SDK range 22 -> 34, universal APK (no native .so, all ABIs)
- [x] 85 locales bundled
- [x] Copy to deliverables + checksums + BUILD_INFO

## Section 3 — Save
- [x] Commit + push to GitHub
