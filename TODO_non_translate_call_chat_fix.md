# Real Implementations — Call & Chat (Agora) Fix Plan

Goal: Make call & chat features "real" along the Agora path and rebuild for production.

## Status tracking

- [x] 1. CallPage start effect fix — restart call when currentCall is for a different user
- [x] 2. Real group call (Add participant) — keep same Agora channel, multi-party support
  - [x] 2a. useAgoraCall: multi-remote tracking (remoteParticipants)
  - [x] 2b. useWebRTCManager: bridge multi-remote to MediaStreams
  - [x] 2c. CallContext(+Base): expose remoteParticipants
  - [x] 2d. useCallStore: inviteToCall / participants array on call docs
  - [x] 2e. CallOverlay: Add participant keeps channel; render multiple remote videos
- [x] 3. useWebRTCManager: graceful error when Agora not configured (no silent no-op)
- [x] 4. GroupChatPage: real delete (wire deleteGroupMessage)
- [x] 5. Group/chat media upload consistency (uploadMediaBlob object-style kind)
- [x] 6. Verify: tsc --noEmit clean
- [x] 7. Production build + deploy

## Notes
- Channel name = `call_{callId}`; uid = hashed user id (already in useWebRTCManager).
- Agora RTC channels natively support N users → group call = same channel + multi-remote UI.
