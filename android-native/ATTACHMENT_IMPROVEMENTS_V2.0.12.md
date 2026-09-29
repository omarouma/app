# GaGa Chat v2.0.12 Attachment & Media pass

- Compact native attachment sheet: Photos, Camera, Video, Audio, Document, Location, Contact.
- Multi-photo system picker, capped at 10 selections per pick.
- Camera permission is requested just in time; captured photo enters the same durable media queue.
- Location permission is requested just in time instead of failing on first use.
- Current location sends latitude/longitude and renders as a tappable Maps card.
- Photo validation: 25 MB pre-compression cap; large images are downsampled to <=2048px and JPEG 88 for reliable mobile upload.
- Video validation: 100 MB cap and 10 minute duration cap; duration metadata is persisted.
- Audio/document use Android scoped document pickers; no broad storage permission is required for choosing files.
- Media messages render local preview immediately and upload progress is persisted in Room.
- Critical fix: every media enqueue now schedules MediaUploadWorker. Previously an attachment could remain QUEUED indefinitely because the durable worker was never started.
- Upload remains idempotent through stable clientMessageId/uploadId and existing outbox/retry pipeline.
- Failed uploads retain FAILED state for retry/error UI; process death can resume queued work through WorkManager.
