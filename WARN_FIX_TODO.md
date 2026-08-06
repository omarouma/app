# Warning Fix Execution Tracking

## Goal

Fix all 96 ESLint warnings and 4 Vite build warnings so that `npm run build` and `npm run lint` both report clean.

## Category 1: Remove stale `// eslint-disable` directives (~34)

- [ ] src/components/features/feed/FeedReelsViewer.tsx (line 657)
- [ ] src/hooks/usePresence.ts (line 132)
- [ ] src/hooks/useTyping.ts (line 15)
- [ ] src/lib/firestore.ts (line 7)
- [ ] src/lib/firestoreLegacy.ts (line 18)
- [ ] src/lib/supabaseDb.ts (lines 7, 450)
- [ ] src/lib/videoApis.ts (lines 51, 57, 63, 116, 118, 120)
- [ ] src/pages/CreateReelsPage.tsx (line 124)
- [ ] src/pages/CreatorDashboardPage.tsx (lines 96, 108, 368, 440)
- [ ] src/pages/QRScannerPage.tsx (line 1)
- [ ] src/services/youtubeService.ts (line 165)
- [ ] src/store/useChallengeStore.ts (lines 1, 242)
- [ ] src/store/useEnhancedTimelineStore.ts (line 748)
- [ ] src/store/useEventStore.ts (line 1)
- [ ] src/store/useLiveStore.ts (line 1)
- [ ] src/store/useMarketplaceStore.ts (line 1)
- [ ] src/store/usePremiumStore.ts (line 1)
- [ ] src/store/useReelStore.ts (line 1)
- [ ] src/store/useSettingsStore.ts (line 1)
- [ ] src/store/useStoryStore.ts (line 1)
- [ ] src/store/useTimelineStore.ts (line 1)
- [ ] src/store/useVoiceRoomStore.ts (line 1)

## Category 2: Remove unused imports/variables (~30)

- [ ] src/components/features/chat/ChatListItem.tsx (`propIsFriend`)
- [ ] src/pages/CallsPage.tsx (`useCallback`, `Video`, `ArrowLeft`, `Filter`)
- [ ] src/pages/ChatsPage.tsx (`useCallback`, `s`)
- [ ] src/pages/BlockedUsersPage.tsx (`AnimatePresence`)
- [ ] src/hooks/use-toast.ts (`actionTypes`)
- [ ] src/hooks/useTyping.ts (`user_name`)
- [ ] src/store/useFriendStore.ts (`toDateOrUndefined`)
- [ ] src/store/useMarketplaceStore.ts (`user`)
- [ ] src/store/useMessageStore.ts (unused imports)
- [ ] src/store/useCallStore.ts (`userId`)
- [ ] src/views/LandingView.tsx (`Avatar`)
- [ ] src/services/youtubeService.ts (`YouTubeApiResponseSchema`)

## Category 3: ChatRoom.tsx unused handlers/state (~30)

- [ ] Remove unused state vars
- [ ] Remove unused handlers
- [ ] Fix 3 react-hooks/exhaustive-deps issues

## Category 4: GroupChatPage.tsx unused destructuring (~7)

- [ ] Remove unused store methods

## Category 5: Vite chunk warnings (4)

- [ ] sounds.ts dynamic/static
- [ ] storage.ts dynamic/static
- [ ] useWalletStore.ts dynamic/static
- [ ] videoApis.ts dynamic/static

## Verify

- [ ] npm run build → clean
- [ ] npm run lint → clean
- [ ] Deploy to Firebase hosting
