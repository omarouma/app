# GaGa — WeChat-inspired conversation tools

Design reference: user-supplied WeChat screenshots (chat, photo editor, album picker, contact forwarding, notes, location search, map viewer, video editing).
Native Android Jetpack Compose, private Supabase chat/media backend and Firebase authentication/FCM.

## Implementation status and behavior contracts

| Area | This sprint | Production behavior / verification |
| --- | --- | --- |
| Chat log | Previously present | Call events with outcome/duration, media bubbles, contact cards, pinned composer; no synthetic messages |
| Photo album picker | Extended | Android scoped picker (max 10), in-app 3-column review, numbered thumbnails, reorder/remove, caption; no broad storage permission |
| Original photo | Extended | Explicit full-quality choice; no downscaling when selected. Supabase media max size must still be enforced, never silent partial album |
| Photo editing | Existing + full-screen preview | Non-destructive EXIF-normalized crop (original/1:1/4:5/16:9), rotate/flip/text and close/edit preview |
| Video edit | Extended | MP4 keyframe-aligned trim, original-audio removal, caption, send only after user taps. No movie transcoding or arbitrary licensed music mixing |
| Contact sharing | Extended | OS scoped address book picker, preview before any send, third-party phone number OFF by default; contact bubble remains tappable |
| Contact remarks | New live backend + UI | Private alias/mobile/tags/note, persisted per signed-in user with owner-only RLS and session guard. Never mutate the other's public profile |
| Static location | Extended | Full-screen in-app map/pin, accurate +/- zoom, reset location, address lookup through platform Geocoder with manual fallback; Send is user-confirmed |
| Shared location viewer | Existing | In-app map viewer with directions handoff if requested |
| Live location | Existing | Recheck timeouts, stop and permission revocation on real devices |
| QR, calls, notification sync | Existing | Require two-device regression before promoting the release |
| AI photo processor | Not yet enabled | Only offer real provider/model with user consent and privacy notices; no decorative placeholder action |
| Doodle/sticker overlays | Next sprint | Undo/redo and pixel-accurate photo export, test orientation and large images |
| Music on videos | Next sprint | Licensed/owned music, audio mix and export, copyright/commercial-use compliance |
| Nearby venues | Next sprint | Real Places API/OS place provider, terms, rate limits, errors and no invented listings |
| Location favourites | Next sprint | Owner-only saved places, explicit save and delete, no background tracking |
| Contact photo override | Next sprint | Private user-scoped storage bucket and allowed MIME/RLS, not public avatar mutation |
| Send-to selector | Next sprint | Search/group/contact destinations, explicit preview and confirmation, fanout delivery and idempotency |

## Key functional acceptance criteria

1. Picking 1–10 photos with 3–4 originals sends one ordered album. Recipient sees **exactly** selected items in the same order; one unreadable or oversize image stops the whole album, not a partial send.
2. Editing one photo preserves the source; original-quality applies to the final chosen file (edited output if edited) without silently bypassing the server size cap.
3. A picked address-book contact is **not** sent until Send card. A phone is never disclosed unless the sender opts in.
4. Private remarks belong to the signed-in account. Read/write attempts from another authenticated account must return no rows or authorization errors. Logout clears rendered remarks.
5. A map tap selects that coordinate, reset returns to the current GPS fix, search results come only from Android Geocoder and degrade gracefully offline. Back/Cancel sends no location.
6. MP4 mute removes audio tracks and retains a playable video track. Incompatible inputs produce actionable errors without modifying the source.
7. All editor/selector surfaces respect status-bar and navigation-bar insets, 320dp width, accessibility font 2x, landscape, keyboard/IME and gestures.
8. Uploads retry after Wi-Fi/offline changes with visible state, no duplicate deliveries, and work after app process termination.
9. Permission denial, rotated device, expired token, account switching, app restart and failed signed URL should never expose a prior user's media.
10. Tests include Android Gradle unit tests, Compose emulator screenshots and **two physical devices with two real accounts**.

## Supabase schema and migration safety

The applied database migration is `20261015234506_gaga_contact_remarks`. Source filename matches the live migration version.
- `public.gaga_contact_remarks` has owner id, contact user id, alias, private mobile, tags, remark and updated timestamp.
- `PRIMARY KEY(owner_id, contact_user_id)`; only `authenticated` can access it and row policies require `auth.uid()` plus `gaga_private.session_active()`.
- `anon` privileges revoked; new row count was zero at creation; no existing user data altered.
- Do **not** replay it against the same live project. Run `supabase/tests/gaga_contact_remarks_private.sql` as the read-only RLS smoke test.

## Release gates

- Complete PR CI and review failures before merge.
- Run authorized two-account end-to-end media/contact/location tests on actual phones.
- Rotate the previously exposed Firebase Admin private key and validate Firebase token/FCM server-side; never embed Admin credentials in Android.
- Build and sign a *new* release version with the approved GaGa signing key; verify both official APK and AAB signatures and upload key.
- Firebase Hosting can distribute **approved** APK and manifest; it is not itself the native Android backend. Do not change public download or Play channel until approval.
