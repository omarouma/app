# TODO: Call Screen Complete Enhancements

Implement global, fully-wired call screen features (navigation buttons, icons, panels).

## Steps

- [x] 1. Analyze call screen files (CallOverlay, useWebRTCManager, webrtc.ts, callUtils, store)
- [x] 2. WebRTC layer: add `hold()`, `resume()`, `sendDTMF()`, `isHeld` to `WebRTCCall`
- [x] 3. `useWebRTCManager`: expose `hold`, `resume`, `isHeld`, `sendDTMF`
- [x] 4. Rewrite `CallOverlay.tsx`:
  - [x] Top bar: minimize, keypad, chat, profile, expand buttons + icons
  - [x] Active controls: mute, speaker, hold, keypad, add participant, camera, flip, end
  - [x] DTMF slide-up keypad panel (fully wired via sendDTMF)
  - [x] Minimized floating PiP bubble (restore / end)
  - [x] Add participant panel (contacts list)
  - [x] Incoming call: reply-with-message + decline/accept
  - [x] Hold status + connection chips
- [x] 5. Type-check (tsc) and lint
- [x] 6. Update docs / summary
