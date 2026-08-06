# Build Fix Plan - 151 TypeScript Errors

## Error Categories and Fix Strategy

### Category A: `env.ts` & Environment Variable Issues (15+ errors)
**Files:** `src/config/env.ts`, `vite.config.ts`, `src/main.tsx`, `src/lib/firebase.ts`, `src/services/pexelsService.ts`, `src/services/youtubeService.ts`, `src/services/pushNotificationService.ts`, `src/config/videoApis.ts`, `src/hooks/useGATracking.ts`, `src/components/features/chat/StickerPicker.tsx`

**Root Cause:**
1. `env.ts` uses `export default env` but files import it as `{ env }` (named import)
2. `vite.config.ts` also imports as `{ env }` and has unused `Plugin`, `env` imports
3. Missing env vars in schema: `VITE_PEXELS_API_KEY`, `VITE_TENOR_API_KEY`, `VITE_GA_MEASUREMENT_ID`, `VITE_VAPID_PUBLIC_KEY`, `VITE_FIREBASE_DATABASE_URL`, `VITE_YOUTUBE_REGION`
4. `import.meta.env` type issue - needs `/// <reference types="vite/client" />`

**Fixes:**
- A1: Fix `env.ts` - remove nested `export default` (currently inside try block), move it outside
- A2: Add missing env vars to Zod schema in `env.ts`
- A3: Add `/// <reference types="vite/client" />` to env.ts
- A4: Fix `z.record(YouTubeThumbnailSchema)` → `z.record(z.string(), YouTubeThumbnailSchema)` in `youtubeService.ts`
- A5: Fix all imports from `{ env }` → `import env from '@/config/env'`
- A6: Fix `vite.config.ts` - remove unused `Plugin` import, remove broken `import { env }`

### Category B: Missing Imports - ChatListItem.tsx (20+ errors)
**File:** `src/components/features/chat/ChatListItem.tsx`

**Root Cause:** File has NO import statements at all. Missing: `Chat`, `memo`, `useNavigate`, `useChatLogic`, `useMemo`, `toast`, `motion`, `sanitizeMediaUrl`, `Users`, `getDefaultAvatar`, `Pin`, `formatTime`

**Fixes:**
- B1: Add all necessary import statements at top of file

### Category C: Store Interface Mismatches (15+ errors)
**Files:** `src/store/useChatStore.ts`, `src/store/useCallStore.ts`, `src/pages/ChatsPage.tsx`, `src/pages/CallsPage.tsx`

**Root Cause:** 
- `ChatStore` interface missing: `addMessage`, `loading`, `fetchChats`, `totalUnread`
- `CallStore` interface missing: `loading`, `subscribeToCallHistory`, `clearCallHistory`, `deleteCall`
- `useSettingsStore` exported differently

**Fixes:**
- C1: Add `addMessage`, `loading`, `fetchChats`, `totalUnread` to ChatStore interface
- C2: Add `loading`, `subscribeToCallHistory`, `clearCallHistory`, `deleteCall` to CallStore interface
- C3: Fix `useSettingsStore` import in `ChatsPage.tsx`

### Category D: PinnedMessage uses `id` but it's `messageId` (2 errors)
**File:** `src/components/features/chat/ChatRoom.tsx` (lines 675, 679)

**Root Cause:** `PinnedMessage` type uses `messageId` but code uses `.id`

**Fixes:**
- D1: Change `p.id === msg.id` to `p.messageId === msg.id`
- D2: Change `pinMessage(chatId, msg)` to `pinMessage(chatId, msg.id, msg.content)`

### Category E: ChatRoom Function Signature Mismatches (20+ errors)
**File:** `src/components/features/chat/ChatRoom.tsx`

**Root Cause:** Call signatures don't match store/hook definitions for: `sendMessage`, `deleteForEveryone`, `saveMessage`, `pinMessage`, `recallMessage`, `reportUser`, `votePoll`, `sendContactCard`, `addMessage`, `schedule`, `handleVoiceSend`, `onBack`, `handleMouseDown/handleMouseUp/handleMouseLeave/handleClickMsg/handleDoubleClickMsg`, `shouldShowAvatar/Date/UnreadSeparator`, `sendTyping`, `onVoiceSend`, `handleTouchStart/Move/End` type mismatches

**Fixes:**
- E1: Fix `sendMessage` calls - 5th param is string not Blob/File
- E2: Fix `deleteForEveryone` - remove 3rd arg (only needs 2 args)
- E3: Fix `saveMessage(msg)` → `saveMessage(msg, senderName)`
- E4: Fix `pinMessage` - pass 3 args: chatId, messageId string, content string
- E5: Fix `recallMessage` - remove 3rd arg
- E6: Fix `reportUser` - pass only 1 arg (senderId)
- E7: Fix `votePoll` - swap userId and optionIndex
- E8: Fix `sendContactCard` - pass object not string
- E9: Remove `addMessage` call, use direct setState
- E10: Fix `schedule` - pass only 1 arg or fix signature
- E11: Fix voice/media upload params
- E12: Add missing handler functions or remove references
- E13: Fix MessageItem props type mismatches
- E14: Fix `onBack` optional handling

### Category F: Missing/Incorrect Exports (5 errors)
**Files:** `src/pages/CallsPage.tsx`, `src/pages/ChatsPage.tsx`, `src/components/LoadingSkeleton.tsx`, `src/components/EmptyState.tsx`

**Root Cause:** Named imports `{ LoadingSkeleton }`, `{ EmptyState }` but they are default exports

**Fixes:**
- F1: Change to default imports

### Category G: `formatDateSeparator` not exported (1 error)
**File:** `src/components/features/chat/ChatRoom.tsx` line 28

**Root Cause:** `chatConstants.ts` doesn't export `formatDateSeparator`

**Fixes:**
- G1: Add the function to `chatConstants.ts`

### Category H: Group type not found (2 errors)
**Files:** `src/components/features/chat/GroupChatHeader.tsx`, `src/pages/ChatsPage.tsx`

**Root Cause:** `Group` type not exported from `@/types` or `GroupData` used instead

**Fixes:**
- H1: Export `Group` alias from types or use `GroupData`

### Category I: `webrtc.ts` null checks (10+ errors)
**File:** `src/lib/webrtc.ts`

**Root Cause:** `pc` variable is `RTCPeerConnection | null` but used without null checks

**Fixes:**
- I1: Add null checks or use non-null assertion `!`

### Category J: `firestore.ts` extra callback argument (3 errors)
**File:** `src/lib/firestore.ts`

**Root Cause:** `subscribeToDoc`, `subscribeToCollection`, `subscribeToSubcollection` called with 4 args but expect 3

**Fixes:**
- J1: Merge error callback into options or remove it

### Category K: `useTyping` merge param (1 error)
**File:** `src/hooks/useTyping.ts` line 157

**Root Cause:** `{ merge: true }` passed to function that expects `boolean | undefined`

**Fixes:**
- K1: Change to `true` directly

### Category L: PrivacyPage unknown properties (3 errors)
**File:** `src/pages/PrivacyPage.tsx`

**Root Cause:** `storyPrivacy`, `callPrivacy`, `profilePhotoPrivacy` not in Privacy type

**Fixes:**
- L1: Add these to PrivacySettings type or use type assertion

### Category M: GroupChatPage ref types (2 errors)
**File:** `src/pages/GroupChatPage.tsx`

**Root Cause:** `RefObject<HTMLDivElement | null>` not assignable to `RefObject<HTMLDivElement>`

**Fixes:**
- M1: Fix ref type mismatch

### Category N: Other errors (misc)
**Files:** Various

**Details:**
- N1: `LoadingSkeleton` import fix
- N2: `CallDirection` type not exported
- N3: `toMillis()` not on Date
- N4: Missing `formatTime` import in GroupChatMessageList.tsx

## Execution Order

1. **Fix env.ts** (A1-A4) - Core dependency for everything
2. **Add missing imports to ChatListItem.tsx** (B1)
3. **Fix Store interfaces** (C1-C3)
4. **Fix ChatRoom.tsx** (E1-E14, D1-D2, G1)
5. **Fix firestore.ts** (J1)
6. **Fix webrtc.ts** (I1)
7. **Fix remaining files** (F1, H1, K1, L1, M1, N1-N4)
8. **Fix youtubeService.ts** (A4)

