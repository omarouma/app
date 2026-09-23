# GaGa — Remaining implementations & improvements audit (pass 9)

Branch: `feat/attachment-share-screen`
North-star: GaGa must be BETTER than WhatsApp/Messenger (see NORTH_STAR.md).

## Section 1 — Deep audit
- [x] Audit feature parity vs WhatsApp/Messenger
- [x] Audit code quality (any/eslint/empty-catch)
- [x] Audit reliability (offline, retries, ordering)
- [x] Audit performance (bundle, startup, runtime)
- [x] Audit security/privacy (backup rules, manifest, proguard)
- [x] Audit dead weight / unreferenced assets

## Section 2 — Implement improvements
- [x] Remove unreferenced public/locales/*/common.json (60K dead weight)
- [x] tsc clean + verify

## Section 3 — Build & release
- [ ] Clean build (tsc -> vite -> cap sync -> strip -> gradle)
- [ ] Verify + copy to deliverables + checksums + BUILD_INFO
- [ ] Commit + push to GitHub
