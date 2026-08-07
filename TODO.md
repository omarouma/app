# Chat Page & ChatRoom Fixes

## Steps

- [ ] 1. ChatRoom.tsx — Fix `handleVoiceSend` double-upload (upload once)
- [ ] 2. ChatRoom.tsx — Wire `atBottomStateChange` to Virtuoso so scroll-to-bottom button works
- [ ] 3. ChatRoom.tsx — Wire real `onRetry` handler for failed messages
- [ ] 4. ChatRoom.tsx — Fix `handleUnlock` to verify PIN hash (no hardcoded success)
- [ ] 5. MessageItem.tsx — Verify `onRetry` prop is plumbed through
- [ ] 6. Run tsc + build to verify no regressions
