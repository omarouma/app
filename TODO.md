# Fix Photo & Video Posts — Task Tracking

## Goal
Make photo AND video posts work end-to-end (upload → create → display → share).

## Steps
- [x] 1. `src/store/useEnhancedTimelineStore.ts` — extend `createPost` to accept `videoUrl` and set `mediaType` correctly; update `mapPost` reading
- [x] 2. `src/components/CreatePostModal.tsx` — track image/video type, render video previews, pass `videoUrl`/`mediaType` to `createPost`
- [x] 3. `src/components/features/timeline/TimelineCard.tsx` — add video rendering when `mediaType === 'video'` or `videoUrl` present
- [x] 4. `src/pages/TimelinePage.tsx` — support video uploads in inline composer + read `videoUrl`/`mediaType` in `mapPost`
- [x] 5. `src/pages/PostPage.tsx` — use video thumbnail/cover for OG meta when video post
- [x] 6. `src/pages/ShareTargetPage.tsx` — upload media via `uploadMediaBlob` instead of blob URLs
- [x] 7. Database — add `video_url` column to `posts` table (SQL patch: `supabase_add_video_url_column.sql`)
- [x] 8. Typecheck (`npx tsc -b --noEmit`)
- [x] 9. Build (`npm run build`)

## Status: ✅ COMPLETE

### What Was Fixed:
1. **Reel Upload State**: Fixed [CreateReelsPage.tsx](src/pages/CreateReelsPage.tsx) so the uploading state resets properly on success/error
2. **ShareTargetPage**: Fixed uploadMediaBlob call to use object-style invocation with proper `kind` detection (posts vs reels)
3. **Database Migration**: Created [supabase_add_video_url_column.sql](supabase_add_video_url_column.sql) to add:
   - `video_url` column to posts table
   - `media_type` column to distinguish text/photo/video posts
   - `visibility`, `poll_data`, `hashtags`, `content_warning` columns for enhanced post features
   - Indexes and constraints for performance and data integrity

### Verification:
- ✅ TypeScript compilation: PASS
- ✅ Production build: PASS
- ✅ Test suite: PASS (4 tests)
- ✅ ESLint: PASS (no errors)

### Next Steps:
1. Apply the Supabase migration (`supabase_add_video_url_column.sql`) when environment supports authenticated CLI
2. Continue with remaining backlog items from the media pipeline

