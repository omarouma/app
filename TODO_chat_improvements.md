# Chat Page & ChatRoom Improvements

## Steps

- [x] 1. ChatListItem.tsx — Respect passed props (name, avatar, isFriend, isOnline) to avoid redundant per-row store recomputations
- [x] 2. ChatList.tsx — Pass through all computed props (name, avatar, isFriend, isOnline, typingName, onAddFriend)
- [x] 3. useChatRoom.ts — Wire existing useChatEffects hook to eliminate duplicate subscribe/markAsRead/status effects
- [x] 4. ChatsPage.tsx — Clean up redundant useDocumentTitle unread-count expression
- [x] 5. Run tsc check to verify no type errors
- [x] 6. Build + commit + push to GitHub
