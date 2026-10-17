# GaGa 2.8.12 (67)

## Implemented

- Chat attachment source now searches files/audio across accessible chats on the server, with 40-row pages, bounded/sanitized filename filtering, stable ordering and explicit Load more. Existing active-session and chat-participant RLS remains authoritative. Local delete-for-me flags are honored without overwriting cached messages. Account changes clear stale results.
- Official and service directories list reviewed organization identities. Owners submit private requests with an HTTPS website. Client roles cannot approve requests or write directory records. A trusted operator must independently verify ownership, then invoke service-role-only `gaga_review_account_application`; no organization is automatically seeded or verified. Listings omit phone/email/review evidence.
- View-once photos: one JPEG/PNG/WebP under 10 MiB, direct chats, no caption. Reservation and publication check active sessions, membership, blocks and recipient message privacy. A separate private bucket has no client read/sign/upload policies; messages carry an opaque marker rather than an object URL. The Edge function authenticates users and uses a row-lock RPC to consume before proxying bytes. A second device/open is denied, even if the first transfer was interrupted. No signed URL is returned. Only the recipient can open the photo, within seven days.
- Android view-once viewer uses a secure window and memory-only decoding, clears its bitmap when closed, and closes on background/account changes. Ordinary media URL resolution, forwarding, private saving and external opening reject view-once markers. Sender-side photo originals are unaffected.
- Consumed/expired/incomplete object garbage collection runs in bounded batches on endpoint requests. Expiration denies access immediately; physical object deletion is opportunistic, not a guaranteed seven-day deletion schedule. Server metadata is retained for consumed receipts.

## Verification

- Eight local release policy/Firebase public configuration checks passed.
- Four Node tests cover MIME signatures, spoofed types, IDs and chunked byte limits.
- Live transactional directory tests passed: owner-only requests, self-approval denial, service-role review, category/pagination isolation and revoked-session denial. All fixtures rolled back.
- Live transactional view-once tests passed: private bucket/ACL, owned/idempotent reservations, membership, incomplete-upload denial, sender/revoked-session denial, single consumption and opened receipt. All fixtures rolled back. These SQL tests simulate publication without creating storage objects; they are not an end-to-end photo transfer test.
- The `view-once-photo` Edge endpoint was deployed with gateway JWT verification enabled. Anonymous consumption was denied (HTTP 401).
- Android compile, JVM tests and emulator checks must pass on the exact PR head before merge. Real-device transfer, two-device races, screenshots/background behavior and provider QA remain release acceptance work.

## Remaining release gates

- A supported image-search provider/integration has not been selected or configured. Extracted-text web search and external Open with/share remain available; no automatic image upload or guessed provider API was added.
- Physical-device update/clean-install, push/calls/Google sign-in/OCR and Play internal-track acceptance require actual devices and Play access.
- The earlier Firebase Admin key exposure issue (#100) remains a release gate (the supplied service account returned IAM 403) until authorized IAM rotation and Supabase Firebase/FCM secret cutover are verified together.
- Historical migration drift (#93/#95) requires vetted schema reconciliation and a non-production restore; do not bulk-apply unmatched historical migrations to production.
- Firebase Spark rejects executable APK hosting. CI now also assembles an optional compressed-native universal APK and verifies identical code/resources/ARM libraries, extraction configuration and a size margin under the existing 50 MiB limit. Installed size grows. Size/installation checks must pass; no billing or storage policy is changed. The Play bundle retains normal packaging.
- Automatic approval review previously rejected uploading signed binaries to the public Supabase release bucket. Public binaries and Firebase release metadata remain unchanged pending scoped authorization and a working distribution route. Draft #116 still describes obsolete 2.8.10 metadata and must not be deployed.
