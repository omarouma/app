# Chatroom media send/render audit (2.0.18+)

Focus: photo + video sending reliability and overall chatroom polish.

## Confirmed defects (root causes)

### Send pipeline
1. **Cache filename collision — `ChatViewModel.resolveUri`**
   `upload_${System.currentTimeMillis()}.$ext`. Selecting N photos for an album (or
   two quick sends in the same millisecond) writes every copy to the *same* path,
   so earlier files are clobbered before their upload starts → wrong / duplicate /
   missing photos. HIGH IMPACT.
2. **Cache filename collision — `ChatViewModel.compressLargeImage`**
   `gaga_photo_${System.currentTimeMillis()}.jpg` — same class of bug for large photos.
3. **Cache filename collision — `MediaPicker.takePhoto`** `gaga_${ts}.jpg`.
4. **Weak MIME/extension resolution** — `contentResolver.getType(uri)` may be null
   (some providers), yielding `application/octet-stream` → object path ends
   `.octet-stream` and Storage serves the wrong Content-Type, so videos/photos can
   fail to render. Extension must be derived robustly.
5. **No video thumbnail** — after upload `thumbnailUrl` is null (backend derives it
   from `mediaUrls[1]`, null for a single-URL video), so a video bubble is a blank
   grey box once the local cache is gone → looks like a failed send.
6. **`localMediaPath` never cleared** — stale references persist.

### Rendering (makes a *successful* send look broken)
7. **Renderers prefer `localMediaPath` over the signed URL** (`MediaImage`,
   `MediaViewer.ImagePane`, `MediaVideo`, `AudioContent`). When the OS clears the
   app cache the local file is gone → broken/blank bubble even though a valid
   signed URL exists. HIGH IMPACT — this is the most likely reason users report
   "photos/videos not sending".
8. **`MultiImageGrid` has no local fallback** — while an album uploads
   (`mediaUrl`/`mediaUrls` null) the grid shows blank tiles.
9. **Video bubble** has no duration badge and a bare grey placeholder.

### Data integrity
10. **`Message.toEntity()` drops `scheduledAt`** — scheduled messages lose their
    send time on any re-persist.

### UX
11. `MediaReviewSheet` is images-only (no caption for single photo/video sends).
12. Upload progress / retry affordances only on single-image bubbles.

## Fixes applied
- Collision-safe unique cache names (photo, video, camera, compressed photo).
- Robust MIME + extension resolution (provider → path → kind default).
- Renderers: prefer a *still-existing* local file, else the signed remote URL.
- `MultiImageGrid`: render local tiles while uploading (album local paths stored
  on the optimistic row) and per-tile placeholder.
- Video thumbnail generated from a frame, uploaded as a sibling object, persisted
  in message metadata and rendered with a duration badge.
- `Message.toEntity()` persists `scheduledAt`.
- `dispatchLocked` strips any local references from `mediaUrls`.
- Upload progress overlay extended to video + grid; retry affordance retained.
