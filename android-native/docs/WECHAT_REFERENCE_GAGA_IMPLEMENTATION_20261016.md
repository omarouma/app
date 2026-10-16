# GaGa — Screenshot-based chat, media, contacts and location delivery plan

The user supplied WeChat screenshots as **behavioral references**, not licensed brand assets. Implement original GaGa visuals, iconography and copy. Preserve existing privacy permissions, chat authorization, native Kotlin/Jetpack Compose, Supabase chat data, and Firebase notifications.

## Phase 1 — implemented in PR #102 (pending CI)

- The selected phone-book contact is staged. Picking a contact **never sends automatically**.
- Review the selected contact's name; decide separately whether to disclose its phone number (off by default); explicitly tap **Send card**.
- Correct Android contact resolution: use the selected contact row's real `_ID` to look up numbers; when scoped picker grants do not allow access, share name only rather than requesting full address-book access.
- Existing Supabase `MessageType.CONTACT` pipeline sends the selected data only after confirmation.
- Multi-photo review displays the number of photos, supports crop/rotate/flip/text overlays and reordering, and indicates that original images are kept unless edited.
- UI regression checks: choosing/canceling a contact does not send, default phone excluded.

## Phase 2 — photo composer and editor parity

- Gallery grid with photo/video thumbnails, 1–10 selection, visible ordinal chips, selected strip, multi-select on/off, send original vs optimized quality where encoding support exists, optional caption per album, and post-send grouped album layout.
- Full-screen editor with orientation-aware photo rendering and user-confirmed Save/Cancel; undo/redo (bounded edit history), pen with colors/width, emoji/stickers, text drag/scale/rotate, blur/mosaic brush, crop/straighten/rotate, export preview, and non-destructive source preservation.
- File size/format validation and retry progress per item; no duplicate messages or orphan storage blobs. Storage policy stays private.
- Acceptance: 10 selected photos correctly ordered and readable by another authorized account; photo editor export preserves EXIF orientation; canceled review uploads nothing.

## Phase 3 — video editor

- Full-screen media preview, pause/scrub, trim range, cover frame, mute/original audio toggle, caption/text/emoji overlays, crop/rotate, selected resolution and target file-size preview if transcoding is implemented.
- Audio/music overlays only where rights and codecs allow; real device codecs and performance tests. No visible control without an implemented export path.
- Acceptance: edited MP4 plays end to end for recipient, tolerates screen rotation, background/retry, and unsupported-codec errors.

## Phase 4 — contact cards and contact management

- New Contact from Chats +; phone contact picker with user consent; searchable in-app person selection, card preview, caption, forward, recipient selection, and real profile open.
- Local-only aliases/remarks, optional saved numbers, tags, avatar note/photo, privacy-safe contact visibility with backend row-level security and sync; contact cards never grant unwanted access to the sender's device address book.
- Acceptance: two accounts can exchange and view a contact card without leaking hidden fields.

## Phase 5 — inside-GaGa location

- Full-screen in-app interactive map with current-position recenter, searchable locations, draggable/tappable pin, nearby places/results, selected place name/address, confirmation, send location.
- Shared pin opens in-app place details, distance only when a fresh permitted device location exists, route handoff to navigation provider. Save place/favorites must be backed by real data or disabled.
- Live location requires consent, explicit duration, foreground service/privacy controls, stop anytime and automatic expiry; do not present static location as real-time.
- Acceptance: sender and recipient see matching coordinates; permission-denial, inaccurate GPS, offline tiles and stale positions do not silently send.

## Phase 6 — overall chatroom quality

- Compact header safe areas, contact avatar/name/presence/privacy, call actions, overflow menu.
- Bubbles for message text, voice call records, emoji/reactions, contact cards, photo albums, video thumbnails, files and locations; efficient lazy pagination and accurate timestamps.
- Composer: voice/text toggle, emoji, + attachment menu, reply and edit mode, keyboard-safe bottom insets and dark mode; actionable empty/error/offline states.
- Accessibility: 320dp, 360dp, 412dp, font scale 1.0/1.5/2.0; tap targets at least 48dp.
- Acceptance: two-account send/receive, no clipped headers or composer, correct background notifications/unread sync, private storage and account switching cleanup.

## Release gate

A feature counts as implemented only after real Kotlin source is committed, CI compiles, automated tests pass and authorized two-device end-to-end testing succeeds. Build APK/AAB with the previously approved upload certificate. Never embed Firebase Admin keys, Supabase service-role secrets or signing keys. Do not advance Firebase Hosting download manifest or Google Play production release until device QA and signer verification pass.

Production schema changes require security review first; use existing Supabase schema when adequate. A WeChat screenshot does not imply backend support in GaGa.
