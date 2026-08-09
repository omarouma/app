# Group Call Fix — Implementation Steps

## Objective
Fix the broken group-chat phone button and make the call pipeline robust to the `group_voice`/`group_video` type union.

## Steps
- [x] 1. Add `isGroupCall()` helper to `src/lib/callUtils.ts`
- [x] 2. Update `src/components/calling/CallOverlay.tsx` to handle `group_voice`/`group_video` types (isVideo + group chip)
- [x] 3. Replace broken group-call button in `src/components/features/chat/GroupChatHeader.tsx` with a member picker (Voice + Video per member)
- [x] 4. Verify with `npx tsc --noEmit` → 0 errors
- [x] 5. Verify with `npm run build` → clean production build
- [x] 6. Update `CALLING_FIX_TRACKING.md`
