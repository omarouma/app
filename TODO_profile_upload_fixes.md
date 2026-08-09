# Profile & Upload Fixes — Task Tracking

## Goal
Fix profile-related implementations: post image/video uploads, avatar display, cover image, stats, size limits.

## Steps
- [ ] 1. Fix `CreatePostModal.tsx` — upload files via `uploadMediaBlob` (kind 'posts') instead of storing raw base64 data URLs
- [ ] 2. Fix `SettingsPage.tsx` — render actual user avatar instead of first letter in green circle
- [ ] 3. Add cover image upload to `ProfilePage.tsx` (uses existing `User.coverImage`)
- [ ] 4. Fix "Posts" stat showing 0 — query actual post count
- [ ] 5. Align post upload size limits (image/video) with storage adapter caps
- [ ] 6. Typecheck (`npx tsc -b --noEmit`)
- [ ] 7. Build (`npm run build`)
