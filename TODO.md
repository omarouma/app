# Fix Photo & Video Posts — Task Tracking

## Goal
Make photo AND video posts work end-to-end (upload → create → display → share).

## Steps
- [ ] 1. `src/store/useEnhancedTimelineStore.ts` — extend `createPost` to accept `videoUrl` and set `mediaType` correctly; update `mapPost` reading
- [ ] 2. `src/components/CreatePostModal.tsx` — track image/video type, render video previews, pass `videoUrl`/`mediaType` to `createPost`
- [ ] 3. `src/components/features/timeline/TimelineCard.tsx` — add video rendering when `mediaType === 'video'` or `videoUrl` present
- [ ] 4. `src/pages/TimelinePage.tsx` — support video uploads in inline composer + read `videoUrl`/`mediaType` in `mapPost`
- [ ] 5. `src/pages/PostPage.tsx` — use video thumbnail/cover for OG meta when video post
- [ ] 6. `src/pages/ShareTargetPage.tsx` — upload media via `uploadMediaBlob` instead of blob URLs
- [ ] 7. Database — add `video_url` column to `posts` table (SQL patch)
- [ ] 8. Typecheck (`npx tsc -b --noEmit`)
- [ ] 9. Build (`npm run build`)
