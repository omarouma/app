# Calling Features — Production Build Fix Tracking

## Objective

Fix all remaining calling-related implementations so the existing deployed app builds and runs cleanly for production.

## Steps

- [x] 1. Fix corrupted `src/hooks/useWebRTCManager.ts`:
      - Replace invalid `useSkfqtate` → `useState`
      - Remove stray `kfq` characters
      - Expose `hold`, `resume`, `isHeld`, `sendDTMF`
      - Fix missing React-hooks dependency warning
- [x] 2. Fix `tsconfig.json` invalid `ignoreDeprecations: "6.0"` → `"5.0"`
- [x] 2b. Fix corrupted `src/store/useAuthStore.ts` (`mcimport` → `import`)
- [x] 3. Enhance `src/components/calling/CallOverlay.tsx`:
      - Add Hold button (wired to `hold`/`resume`)
      - Add DTMF slide-up keypad panel (wired via `sendDTMF`)
      - Add minimized floating PiP bubble (restore / end)
      - Group incoming-call "reply with message" + decline/accept
      - Show hold status + reconnect/quality chips
- [x] 4. Verify with `npx tsc --noEmit` → 0 errors (confirmed)
- [x] 5. Verify with `npm run build` → clean production build (confirmed)

## Group-Call Fix

- [x] 1. Add `isGroupCall()` + `isVideoCallType()` helpers to `src/lib/callUtils.ts`
- [x] 2. Make `CallOverlay.tsx` robust to `group_voice`/`group_video` type union:
      - `isVideo` now resolves via `isVideoCallType()` (video + group_video)
      - Show "👥 Group Voice/Video" chip for group calls
- [x] 3. Replace broken group-call button in `GroupChatHeader.tsx`:
      - Old button called a single arbitrary member (only voice)
      - New flow opens a member-picker modal with per-member Voice + Video actions
      - Each action navigates to `/call` with the correct `userId` + `mode`
- [x] 4. Verify with `npx tsc --noEmit` → 0 errors (confirmed)
- [x] 5. Verify with `npm run build` → clean production build (confirmed)

## Realtime Call Pipeline Refactor

- [x] 1. `CallContextBase.ts` — define full `CallContextValue` interface (localStream/remoteStream/isConnected/isHeld/quality + media methods)
- [x] 2. `CallContext.tsx` — provider delegates all media ops to `useWebRTCManager` (single source of truth)
- [x] 3. `CallOverlay.tsx` — consumes `useCallContext()`, uses `getOtherParticipantId` helper
- [x] 4. `ChatRoom.tsx` — uses `useCallContext().startCall({id}, mode)` for voice/video
- [x] 5. Verify with `npx tsc --noEmit` → 0 errors (confirmed)
- [x] 6. Verify with `npm run build` → BUILD_SUCCESS (confirmed)

## Remaining Call Implementations (final pass)

- [x] 1. GroupChatHeader member call picker — show real member names/avatars (not "Member" + raw ID):
      - Added `memberInfo?: Record<string, GroupMemberInfo>` prop
      - Wired `memberInfo` resolver from `GroupChatPage` (friends + current user)
- [x] 2. Verify all call entry points initiate calls correctly (ChatRoom, ContactsPage, DesktopContactsView, CallsPage, DesktopCallsView)
- [x] 3. CallListItem — label `group_voice`/`group_video` types correctly ("Group Video"/"Group Voice"/"Video"/"Voice")
- [x] 4. Verify `npx tsc --noEmit` + `tsc -b` → 0 errors (confirmed)
- [x] 5. Verify `npm run build` → BUILD_SUCCESS (`✓ built in 13.13s`, only pre-existing firebase.ts chunking advisory)

## Realtime Call Pipeline Refactor (detailed)

- [x] 1. Made `useWebRTCManager` the single source of truth for call media state (local/remote streams, mute, video, hold, quality, DTMF).
- [x] 2. Refactored `CallContext.tsx` to delegate all media ops to `useWebRTCManager` instead of maintaining dead local stream state:
      - Removed `stopStreamTracks` import and dead local stream/mute/video state
      - `muteAudio`/`toggleVideo` now call the shared manager (`toggleMute`/`toggleVideo`)
      - `endCall` calls `endWebRTC` (releases camera/mic) before clearing store
      - Exposes `isConnected`, `isHeld`, `quality`, `localStream`, `remoteStream`, `flipCamera`, `toggleHold`, `sendDTMF`, `hold`, `resume` through context
      - Call duration timer now pauses while held
- [x] 3. Extended `CallContextBase.ts` interface to match the enriched provider value.
- [x] 4. `CallOverlay.tsx` now consumes `useCallContext()` (not `useWebRTCManager()` directly) and uses `getOtherParticipantId()` for group-call robustness.
- [x] 5. Verified with `npx tsc --noEmit` → 0 errors (confirmed)
- [x] 6. Verified with `npm run build` → clean production build (confirmed)

## Calling Fixes (2026-08-17)

- [x] 1. **Fixed double end-call in `useWebRTCManager.ts`**:
      - `endCall()` no longer calls `endCallInStoreRef.current()` — `CallContext.endCall` already calls the store's `endCall` via `_endCall()`. Calling it here caused the store's `endCall` to run twice.
- [x] 2. **Fixed `onLeaveRoom` firing `endedCb` on programmatic leave in `useZegoCall.ts`**:
      - Added `isLeavingRef` flag that's set to `true` in `leave()` and checked in `onLeaveRoom` to prevent the room-ended callback from firing when leaving programmatically.
      - The flag stays `true` until the next `join()` call because `destroy()` may be asynchronous and `onLeaveRoom` could fire after `leave()` returns.
      - `join()` resets `isLeavingRef.current = false` so a new call can fire `onLeaveRoom` normally.
- [x] 3. **Removed unused `showZegoUi` variable in `CallOverlay.tsx`**:
      - The variable was declared but never used.
- [x] 4. **Fixed unawaited `endCall()` in `CallPage.tsx`**:
      - Changed `endCall()` to `void endCall().then(() => { initiatedRef.current = false; })` to properly await the async end-call before resetting the initiation flag.
- [x] 5. **Fixed pre-existing build error in `usePhoneContacts.ts`**:
      - Removed unused `prevFriendKeyRef` variable that was declared but never read.
- [x] 6. Verified with `npx tsc --noEmit` → 0 errors (confirmed)
- [x] 7. Verified with `npm run build` → BUILD_SUCCESS (confirmed)
