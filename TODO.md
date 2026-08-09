# Agora Integration — TODO

## Goal

Integrate Agora Real-Time Engagement platform for audio/video calling in GaGa Chat.
Replace the raw P2P WebRTC media layer with Agora RTC while preserving the existing
call signaling/UX (ringing, accept/reject, call history, CallOverlay).

## Steps

- [x] Analyze existing WebRTC/call infrastructure (webrtc.ts, useWebRTCManager, useCallStore, CallContext, CallOverlay, pages)
- [x] Install `agora-rtc-sdk-ng` runtime dependency
- [x] Verify Agora token algorithm (cross-check with official `agora-access-token` in a Node script)
- [x] Create `src/lib/agoraToken.ts` (browser-safe token builder, Web Crypto HMAC-SHA256)
- [x] Create `src/lib/agora.ts` (client singleton + config + token acquisition)
- [x] Create `src/lib/agoraCall.ts` (`AgoraCall` class mirroring `WebRTCCall` API)
- [x] Update `src/config/env.ts` schema with Agora env vars
- [x] Update `.env` / `.env.example` with Agora credentials
- [x] Update `src/hooks/useWebRTCManager.ts` to use `AgoraCall`
- [x] Typecheck (`tsc`) and lint
- [x] Build (`npm run build`)
- [ ] Manual test of 1:1 voice + video calls
