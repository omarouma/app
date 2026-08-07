# ChatRoom Fix Tracking

- [x] 1. ChatRoom.tsx — Fix `handleVoiceSend` double-upload (upload once)
- [x]    — Repair broken `uploadMediaBlob` import line (missing closing quote)
- [x] 2. ChatRoom.tsx — Wire `atBottomStateChange` to Virtuoso so scroll-to-bottom works
- [x] 3. ChatRoom.tsx — Wire real `onRetry` handler for failed messages
- [x] 4. ChatRoom.tsx — Fix `handleUnlock` to verify PIN hash (no hardcoded success)
- [x] 5. MessageItem.tsx — Verify `onRetry` prop is plumbed through
- [x] 6. Run tsc + build to verify no regressions (passed, `✓ built in 12.77s`)
- [x] 7. Fix build-blocking type errors in useChatFeatures.ts, useChatListTyping.ts, useLiveStore.ts
- [x] 8. Build + deploy to Firebase hosting `oumagachat` → https://oumagachat.web.app
