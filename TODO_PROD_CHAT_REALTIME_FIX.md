# Production Chat Real-time Fix

## Objective

Fix the remaining real-time chat implementation gaps so the ChatRoom reacts
correctly to live message state and failed sends can be retried, then verify
with a clean production build and deploy to Firebase Hosting.

## Steps

- [x] 1. Wire `atBottomStateChange` to `<Virtuoso>` in `ChatRoom.tsx` so
     scroll-to-bottom + new-message unread separation work in real-time.
- [x] 2. Add a `handleRetryMessage` callback in `ChatRoom.tsx` that re-sends a
     failed message (mark optimistic copy, re-invoke `sendMessage`).
- [x] 3. Pass `handleRetryMessage` as `onRetry` to `MessageItem` to activate the
     already-built "Tap to retry" UI for failed sends.
- [x] 4. Run `npx tsc --noEmit` → verify 0 errors.
- [x] 5. Run `npm run build` → verify clean production build.
- [x] 6. Deploy to Firebase Hosting (`firebase deploy`) → https://oumagachat.web.app
- [x] 7. Update `CODE_FIX_HEADER_TODO.md` / tracking docs.
