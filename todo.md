# GaGa — Startup/Auth Flow + Chat-Room UI/UX Production Pass

Branch: `feat/attachment-share-screen`

## Section 1 — Startup & Authentication Flow (no Landing View on native)
- [x] `App.tsx` — native `/` route never renders LandingView (→ /auth or Home)
- [x] `AuthView.tsx` — hide "Home" button on native (no path back to landing)
- [x] Verify no flash of Auth before Home (loading gate)
- [x] Verify Back from Home cannot expose Auth (replace navigations)
- [x] Verify session persistence (Supabase) + post-auth routing

## Section 2 — Profile Cover Video (always visible + playable)
- [x] `ProfileCover.tsx` — robust autoplay, error fallback, tap-to-play/pause, mute toggle
- [x] `ProfilePage.tsx` — wire ProfileCover into cover block
- [x] Ensure cover video renders on native WebView (autoplay policy)

## Section 3 — Chat Room UI/UX audit (§33–§76)
- [x] §33 Global chat-room UI — `.chat-surface` token, dark-mode-aware background
- [x] §34 Chat header (presence/last-seen/typing verified)
- [x] §36/§37 Incoming/outgoing message UI — fixed invisible incoming bubbles (border)
- [x] §38 Sender profile photos (avatar fallback verified)
- [x] §39 Message grouping — added 5-min time-gap break
- [x] §40 Date & time UI (separators verified)
- [x] §41 Message status UI (ReadReceipt verified)
- [x] §44/§45 Long-press menu + multi-select (verified)
- [x] §46/§47 Composer + keyboard — group chat now keyboard-safe (kb-inset)
- [x] §48 Attachment panel (verified)
- [x] §50–§59 Media/document/location/contact cards (bubble surfaces fixed)
- [x] §60 Upload/download UI (verified)
- [x] §61 Typing & presence (verified)
- [x] §62 Unread messages (separator verified)
- [x] §64 System & call events in chat (verified)
- [x] §69–§71 Error/loading/empty states — added chat empty state
- [x] §72 Dark mode — chat surface + bubble surfaces
- [x] §73 Accessibility (aria-labels verified)
- [x] §74 Responsive device layout (max-w bubbles verified)
- [x] §76 Final consistency audit

## Section 4 — Build & Verify
- [ ] `tsc -b` clean
- [ ] `vite build` + `cap sync android` + strip assets
- [ ] `gradlew assembleRelease bundleRelease`
- [ ] Verify APK + update BUILD_INFO + commit/push
