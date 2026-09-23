# GaGa — Continue Chat-Room Spec (Sections A–E)

Branch: `feat/attachment-share-screen` (base commit `1be198b`)

## Section A — Link Previews (§41) [redo — was lost uncommitted]
- [x] `src/types/index.ts` — add `LinkPreviewData` + `Message.linkPreview`
- [x] `src/lib/linkPreview.ts` — NEW (extract/validate/fetch/cache)
- [x] `src/components/features/chat/messages/LinkPreview.tsx` — NEW card component
- [x] `src/components/features/chat/messages/index.ts` — export LinkPreview
- [x] `supabase/migrations/20260927000200_link_previews.sql` — NEW column
- [x] `supabase/functions/link-preview/index.ts` — NEW Edge Function (OG scrape, SSRF-safe)
- [x] `src/lib/supabaseDb.ts` — FIELD_TO_DB `linkPreview`
- [x] `src/services/chatApi.ts` — mapMessage + `updateMessageLinkPreview`
- [x] `src/store/useChatStore.ts` — fire-and-forget preview fetch on send
- [x] `src/components/features/chat/MessageItem.tsx` — render LinkPreview

## Section B — Timeline Integrity (§23/§24)
- [x] §23 duplicate realtime-listener protection — verified `subscribeDeduped` ref-counting
- [x] §24 guaranteed chronological ordering — `sortMessagesChronologically` applied in `subscribeMessages` + `addMessage`

## Section C — Presence / Last Seen (§29)
- [x] `src/lib/timeUtils.ts` — `formatLastSeenDetailed` ("Last seen today at 6:32 AM")
- [x] `src/components/features/chat/ChatHeader.tsx` — use detailed last-seen
- [x] `src/hooks/useChatEffects.ts` — detailed label + online sentinel

## Section D — Responsive + Keyboard (§45/§46/§47)
- [x] `ImageMessage.tsx` — responsive bubble sizing + aspect ratio (no stretch/crop/overflow)
- [x] `VideoMessage.tsx` — responsive bubble sizing + aspect ratio
- [x] `src/hooks/useKeyboardInset.ts` — NEW keyboard-safe composer hook
- [x] `ChatRoom.tsx` — keyboard-safe composer (visualViewport), no layout jump

## Section E — Build & Verify
- [ ] Toolchain: JDK 17 + Android SDK 34 + node_modules
- [ ] Regenerate release keystore + keystore.properties
- [ ] `tsc -b` clean
- [ ] `vite build` + `cap sync android` + strip assets
- [ ] `gradlew assembleRelease bundleRelease`
- [ ] Verify APK (apksigner + aapt badging)
- [ ] Update `deliverables/BUILD_INFO.md` + copy artifacts
- [ ] Commit + push to `feat/attachment-share-screen`
