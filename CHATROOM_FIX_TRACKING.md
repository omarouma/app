# Chat & ChatRoom Fix Tracking

## Scope
Review and fix all chat page / chat room related files.

## Status: In Progress

## Files Reviewed
- `src/pages/ChatsPage.tsx` — chat list page
- `src/pages/ChatRoomPage.tsx` — direct chat route page
- `src/pages/GroupChatPage.tsx` — group chat page
- `src/components/features/chat/ChatRoom.tsx` — main chat room component
- `src/components/features/chat/ChatRoomLoader.tsx` — chat room loader (creates dm)
- `src/components/features/chat/ChatList.tsx` / `ChatListItem.tsx` — chat list & item
- `src/components/features/chat/ChatHeader.tsx` — header
- `src/components/features/chat/InputBar.tsx` — input bar
- `src/components/features/chat/MessageItem.tsx` / `MessageBubble.tsx` — message rendering
- `src/components/features/chat/MessageSearch.tsx` — search
- `src/components/features/chat/ReadReceipt.tsx` — delivery status
- `src/components/features/chat/GroupChatHeader.tsx` — group header
- `src/hooks/useChatLogic.ts` — chat list logic
- `src/hooks/useChatRoom.ts` — chat room logic
- `src/hooks/useChatEffects.ts` — subscriptions/effects
- `src/hooks/useChatScrollBehavior.ts` — scroll behavior
- `src/hooks/useChatUI.ts` / `useChatState.ts` / `useChatFeatures.ts` / `useMessageActions.ts`
- `src/store/useChatStore.ts` / `useMessageStore.ts` / `useGroupStore.ts`
- `src/lib/chatConstants.ts`, `src/lib/storage.ts`, `src/types/index.ts`

## Findings
- ✅ TypeScript build passes (`tsc --noEmit` OK)
- ✅ Routing correct: `/chat/:userId` → ChatRoomPage, `/group/:groupId` → GroupChatPage
- ✅ Media upload signature matches both positional and object styles
- ⚠️ Dead/unused hooks: `useChatUI.ts`, `useChatState.ts`, `useChatFeatures.ts`, `useMessageActions.ts` (logic inlined in `useChatRoom.ts`) — safe to leave
- ⚠️ `MessageBubble.tsx` is legacy vs `MessageItem.tsx` (active) — safe to leave

## Fixes Applied
- [x] `ChatRoom.tsx` — Delete for Everyone null-safety guard (uses stored `showDeleteForEveryoneConfirm` id instead of relying on `contextMenu` which may be null after the menu closes)
- [x] `ChatRoom.tsx` — `handleAtBottomStateChange` already wired to `<Virtuoso atBottomStateChange>` (verified in-file)
- [x] `DesktopCallsView.tsx` — fixed indentation of `filtered.map` block (column 0 → proper indent)
- [ ] `GroupChatPage.tsx` — click replied message to scroll to it

## Verification
- [x] Run `tsc --noEmit` — BUILD OK (confirmed)
