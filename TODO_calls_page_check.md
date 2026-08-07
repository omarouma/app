# Calls Page Check & Fix TODO

## Plan
- [x] 1. Update `src/components/features/calls/CallListItem.tsx`
  - [x] Fix dark-theme styling to light theme (`hover:bg-gray-50`, `bg-gray-100`)
  - [x] Add user avatar (image with initial fallback)
  - [x] Add call timestamp display
  - [x] Add call type label (Voice/Video)
- [x] 2. Fix `clearCallHistory` in `src/store/useCallStore.ts` to actually delete records from DB
- [x] 3. Switch `src/pages/CallsPage.tsx` from `subscribeToCallHistory` to `subscribeCalls` (missed-call auto-timeout)
- [ ] 4. Pass `isOutgoing: true` consistently in `src/views/DesktopCallsView.tsx`
- [ ] 5. Add name-resolution fallback for non-friend callers
- [ ] 6. Run `npx tsc --noEmit --project tsconfig.app.json` to verify zero errors
