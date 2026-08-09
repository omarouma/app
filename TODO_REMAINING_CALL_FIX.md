# Remaining Call-Related Implementations — Fix Tracking

## Objective
Complete all remaining realtime call-related implementations after the pipeline refactor
(CallContext → useWebRTCManager single source of truth, already verified BUILD_SUCCESS / 0 tsc errors).

## Steps
- [x] 1. GroupChatHeader member call picker — show real member names, avatars (not "Member" + raw ID):
      - Added `memberInfo?: Record<string, GroupMemberInfo>` prop to `GroupChatHeader`
      - Wired `memberInfo` resolver from `GroupChatPage` (built from friends + current user)
      - Member list now shows real name + avatar; falls back to initials/Users icon
- [x] 2. CallPage — call initiation flow verified for ChatRoom (useCallContext), ContactsPage, DesktopContactsView, CallsPage, DesktopCallsView (all navigate to `/call` with correct `userId` + `mode`)
- [x] 3. webrtc.ts — signaling teardown on `endCall` + stale `currentCall` guard reviewed (existing implementation already clears unsub, stops tracks, closes peer connection, resets state)
- [x] 4. CallsPage / DesktopCallsView / CallListItem — label `group_voice`/`group_video` call types correctly:
      - `CallListItem` now shows "Group Video"/"Group Voice"/"Video"/"Voice" via `isGroupCall` + `isVideoCallType`
- [x] 5. Verify `npx tsc --noEmit` → 0 errors (confirmed)
- [x] 6. Verify `npm run build` → BUILD_SUCCESS (`✓ built in 13.13s`, only pre-existing firebase.ts chunking advisory)
- [x] 7. Update CALLING_FIX_TRACKING.md + TODO_REALTIME_CALL_FIX.md
