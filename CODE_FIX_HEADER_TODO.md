# Fix Chat Header — TODO

## Steps
- [x] Investigate ChatHeader props and ChatRoom usage
- [x] Confirm plan with user
- [x] Wire up missing props in ChatRoom.tsx (isUserOnline, activeTypingUsers, friendStatus, onToggleBgPicker, onToggleTransfer)
- [x] Add background picker UI when showBgPicker is true
- [x] Render TransferModal for send-money button
- [x] Run `tsc --noEmit` to verify no type errors

> All items verified complete in `ChatRoom.tsx` (props wired, background picker AnimatePresence block, TransferModal rendered). Clean build + tsc confirmed.
