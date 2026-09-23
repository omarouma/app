# GaGa — Remaining implementations & improvements audit

Branch: `feat/attachment-share-screen`
North-star: GaGa must be BETTER than WhatsApp/Messenger (see NORTH_STAR.md).

## Section 1 — Deep audit
- [x] Audit feature parity vs WhatsApp/Messenger (what's missing)
- [x] Audit code quality (error handling, edge cases, dead code)
- [x] Audit reliability (offline, retries, message ordering)
- [x] Audit performance (bundle, startup, runtime)
- [x] Audit security/privacy gaps

## Section 2 — Implement improvements
- [x] Lazy-load + async-decode all list-rendered avatars/thumbnails (~25 files)
- [x] Add DNS-prefetch hints for Firebase/Storage/FCM origins
- [x] tsc clean + verify

## Section 3 — Build & release
- [ ] Clean build (tsc -> vite -> cap sync -> strip -> gradle)
- [ ] Verify + copy to deliverables + checksums + BUILD_INFO
- [ ] Commit + push to GitHub
