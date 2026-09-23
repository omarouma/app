# GaGa — Fix blank/stuck chat screen (bug fix)

Branch: `feat/attachment-share-screen`
North-star: GaGa must be BETTER than WhatsApp/Messenger (see NORTH_STAR.md).

## Section 1 — Diagnose
- [x] Reproduce from screenshot: Chats screen stuck on loading skeletons while "All (10)" shows 10 chats exist
- [x] Trace loading flag: `useChatLogic` returns `loadingChats || loadingGroups`
- [x] Find root cause: `fetchChats` never called; `subscribeChats` never clears `loadingChats`

## Section 2 — Fix
- [x] `useChatStore.subscribeChats`: set `loadingChats: false` in snapshot callback
- [x] `useChatStore.subscribeChats`: clear `loadingChats` on early-return (backend unavailable)
- [x] `useChatLogic`: make `loading` data-aware (never skeleton when data present)
- [x] `DesktopChatView`: same data-aware guard
- [x] tsc -b clean

## Section 3 — Build & release
- [ ] Clean build (tsc -> vite -> cap sync -> strip -> gradle)
- [ ] Verify APK/AAB signatures (v1/v2/v3)
- [ ] Copy to deliverables + checksums + BUILD_INFO
- [ ] Commit + push to GitHub
