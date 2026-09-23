# GaGa — Final remaining-items audit + release APK

Branch: `feat/attachment-share-screen`
North-star: GaGa must be BETTER than WhatsApp/Messenger (see NORTH_STAR.md).

## Section 1 — Remaining-items audit
- [x] Audit codebase for incomplete features (no real TODO/FIXME/stub/coming-soon)
- [x] Verify Stories/Status — intentionally dropped in Phase 3 (messaging-first); ring is decorative
- [x] Verify translation coverage — 6 locales, all 250 keys complete
- [x] Expand languages 6 -> 12 (hi, pt, ru, id, de, ja) — global reach win
- [x] Wire new languages into i18n.ts + SettingsPage + onboarding; tsc clean

## Section 2 — Clean build
- [x] Free disk (cleared npm cache + gradle caches + build intermediates + dist)
- [x] tsc -b clean
- [x] vite build
- [x] cap sync android + strip web-only assets
- [x] gradlew assembleRelease bundleRelease (R8 + shrinkResources) — BUILD SUCCESSFUL

## Section 3 — Verify global usability
- [x] Signature v1/v2/v3 verified
- [x] SDK range 22 -> 34, universal APK (all ABIs)
- [x] New languages confirmed bundled in APK
- [x] Copy to deliverables + checksums + BUILD_INFO

## Section 4 — Save
- [ ] Commit + push to GitHub
