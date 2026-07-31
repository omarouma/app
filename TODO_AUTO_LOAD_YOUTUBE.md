# Auto-Load YouTube/Pexels Videos in FeedReelsViewer

## Steps

- [x] 1. Analyze codebase - complete understanding of YouTube/video systems
- [x] 2. Plan confirmed with user
- [x] 3. **Update `src/store/useReelStore.ts`** - Already had `searchExternalVideos()` and `loadExternalByCategory()` functions - no changes needed to the store
- [x] 4. **Update `src/components/features/feed/FeedReelsViewer.tsx`** - Added auto-load external videos, merged into display with interleaving
- [x] 5. Test changes - TypeScript compilation passed successfully

## Changes Summary

### `src/components/features/feed/FeedReelsViewer.tsx`
- Added `useMemo` import
- Implemented **auto-loading** of YouTube/Pexels videos when:
  - The "For You" tab is active
  - No user-created reels exist in the database
  - External videos haven't been loaded yet
- Added **external reels merging** via `mergedReels` useMemo that interleaves user reels with external YouTube/Pexels videos
- Added `loadedExternal` state to prevent repeated loading attempts
- Added logic to clear external reels when switching to "Following" tab
- TypeScript compilation passes cleanly

