# Audio Recorder - Production Implementation

## Steps

- [x] 1. `src/hooks/useVoiceRecorder.ts` — add MAX_VOICE_DURATION cap w/ auto-stop, isRecording guard, blob size/empty validation, recordingError state
- [x] 2. `src/components/features/chat/ChatRoom.tsx` — fix double-upload bug in handleVoiceSend (single upload path)
- [x] 3. Delete orphaned `src/components/features/chat/AudioRecorder.tsx` (dead code)
- [x] 4. Add live waveform preview to recording UIs (InputBar + GroupChatInput)
- [x] 5. Run `tsc` + `lint`, then `npm run build` to verify
