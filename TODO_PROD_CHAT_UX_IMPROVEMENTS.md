# Production Chat UX Improvements — Task Tracking

## Objective

Improve the chat input & delivery-status UX with real, production-safe changes,
then verify with a clean build and deploy to Firebase Hosting.

## Steps

- [x] 1. `InputBar.tsx` — Convert single-line input to auto-resizing multi-line
     `<textarea>` (Enter sends, Shift+Enter newline).
- [x] 2. `useChatStore.ts` — Set `deliveryStatus: 'sent'` on optimistic send
     success and `delivered`/`read` transitions so read receipts reflect real
     sender state.
- [x] 3. `useChatRoom.ts` — Harden typing-stop so the "is typing" indicator
     clears on all send paths.
- [x] 4. Run `npx tsc --noEmit` → verify 0 errors.
- [x] 5. Run `npm run build` → verify clean production build.
- [x] 6. Deploy to Firebase Hosting (`firebase deploy`).
