# Calls Feature - Remaining Areas Implementation TODO

## Plan
- [x] A. Fix misleading "Switch to voice" button in `CallOverlay.tsx` (area A)
  - Button now genuinely switches video→voice: turns off camera track (`toggleVideo()` when on) and sets `switchedToVoice=true`, updates effective call type & label, shows a toast.
- [x] B. Add group call support in `CallOverlay.tsx` (group_voice / group_video types)
  - Added `isGroupCall` detection and top-bar label shows "Group Video" / "Group Voice".
  - `isVideo` now also treats `group_video` as a video call.
- [x] C. Add group call display/label in `CallListItem.tsx`
  - `getCallLabel()` now maps `group_voice` → "Group Voice", `group_video` → "Group Video".
- [x] D. Simplify `CallPage.tsx` by removing trivial `cameraNeeded()` helper
- [x] E. Add delete option to `DesktopCallsView.tsx`
  - Added `Trash2` delete button per call entry wired to `useCallStore.deleteCall` with toast feedback.
  - Hid 1:1 call buttons for group call types.
- [x] F. Run `npx tsc --noEmit --project tsconfig.app.json` to verify zero errors
  - Result: `tsc-verify.txt` is empty (zero type errors).
