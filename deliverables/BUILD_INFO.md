# GaGa — Android Release Build

**Version:** 1.0.0 (versionCode 1)
**Package:** `gagachat.app`
**App label:** GaGa
**Build date:** 2026-09-23
**minSdk:** 22 (Android 5.1+) · **targetSdk:** 34 (Android 14)

## Artifacts

| File | Size | Purpose |
|---|---|---|
| `GaGa-v1.0.0-release.apk` | 26.0 MB | Direct install / sideload / testing |
| `GaGa-v1.0.0-release.aab` | 25.6 MB | Google Play Store upload |

## Checksums (SHA-256)

```
2b39e91e181772cbd8bc03eb333cc003e45e856f14e91395e902947cae1a752d  GaGa-v1.0.0-release.apk
1c245fd180431d102e60bb54ec5748055bd45bfaeed48ae6b441056599e38c6f  GaGa-v1.0.0-release.aab
```

## Signing certificate

```
DN: CN=GaGa Chat, OU=Mobile, O=GaGa, L=Dhaka, ST=Dhaka, C=BD
SHA-256: F6:E9:5A:C8:B0:D2:6B:6D:B9:32:3B:7F:C4:7D:5B:C7:36:DD:1B:AB:37:91:F9:92:E9:86:88:61:21:E7:E4:D1
SHA-1:   4B:4B:64:61:E6:31:30:0B:B9:A7:B1:9C:0A:E7:50:72:B0:86:CE:E9
```

Signature schemes verified: **v1 (JAR) ✓ · v2 ✓ · v3 ✓**

> **NOTE — signing key.** The release keystore (`android/gaga-release.jks`) was
> generated in this build environment. Keep it safe — all future updates must be
> signed with the same key. Devices with a differently-signed build installed must
> uninstall it before installing this one.

## What's included in this build

### Chat-room feature improvement spec (unified timeline + call history)

**§1 — Unified sending pipeline + idempotency (P0).** The single most important
guarantee: **1 Send action = 1 logical message = 1 database record = 1 chat
bubble.** A `clientMessageId` is now generated **once** on the client and carried
unchanged through the entire path — local optimistic bubble → `chatApi` insert →
database `local_id` → realtime echo. The insert is idempotent
(`addDocToSubcollectionIdempotent` with a `UNIQUE(sender_id, local_id)` conflict
target): a duplicate submit or a realtime race resolves to the *same* row instead
of creating a second one. A double-submit fingerprint guard (700 ms window) plus
an in-flight re-entrancy guard in `useChatStore` stop rapid double-taps. Retry
reuses the **same** `clientMessageId`, so a retried message can never fork into
two bubbles. Realtime reconciliation matches on `clientMessageId` and performs a
true INSERT-vs-UPDATE merge — it never blind-appends.

**§2 — Call history inside the chat room.** Voice/video call events are now
first-class timeline items. One `callSessionId` maps to exactly **one** logical
call-history record and **one** chat timeline item, which is *updated* (never
re-inserted) as the call progresses: `calling → connected → ended`, or
`missed` / `declined` / `cancelled` / `busy` / `failed`. The full call lifecycle
in `useCallStore` (start, 60 s no-answer timeout, accept, reject, end, missed
timer, busy branch) is hooked into `upsertCallEventMessage`, which computes the
deterministic direct-chat id, ensures the chat row exists, and upserts by
`call_session_id`. A new `CallMessage` component renders the event with the
correct icon (missed / video / voice), direction arrow (outgoing/incoming
resolved from `callerId`), status label, formatted duration, and a one-tap
**call-back** button. DB migration `20260927000100_call_events_in_chat.sql` adds
`call_session_id` + `call_data` columns and a partial unique index
`messages_chat_call_session_uq (chat_id, call_session_id)`.

**§3 — Type-aware reply preview.** Reply quotes now render a human preview via
`getMessagePreview(type, content)` (📷 Photo, 🎥 Video, 🎤 Voice message, 📄 File,
📍 Location, 📊 Poll, 👤 Contact, 📞 Call) instead of dumping raw content — in
`MessageItem`, `InputBar`, and `GroupChatInput`.

**§4 — Scroll, unread, and date separators.** A green **"N new message(s)"** pill
appears on the scroll-to-bottom button when the user is scrolled up and messages
arrive. The unread divider renders exactly once at the first unread message. Date
separators (Today / Yesterday / full date) are consistent across the timeline.

### Full-APK recheck pass (branding consistency)

- **"GaGa Chat" \u2192 "GaGa" everywhere \u2014 FIXED.** A full recheck of the shipped
  APK found the launcher label was already "GaGa", but **197 in-app strings**
  still carried the old "GaGa Chat" wordmark (i18n `appName`, onboarding,
  AI-assistant replies, legal pages, SEO titles, footer, share/invite text,
  logo `alt` text, and the `<noscript>` fallback). All were normalised to
  **GaGa** across `src/`, `index.html`, and `public/`, including the Bengali
  translated app name (`\u0997\u0997\u09be \u099a\u09cd\u09af\u09be\u099f` \u2192 `\u0997\u0997\u09be`) and the
  `useDocumentTitle` suffix. The shipped JS bundle now contains **zero**
  "GaGa Chat" occurrences.

### Chat-room production hardening (Messenger/WhatsApp-class pass)

**Release blockers**
- **Voice message `Infinity:NaN` duration — FIXED.** `VoiceWaveform` now guards
  every duration value (`Number.isFinite && > 0`) before formatting, and the
  recording duration is persisted end-to-end (`Message.duration` → validation
  schema → `chatApi` → store → `VoiceMessage`/`VoiceWaveform`) so the UI never
  re-derives it from streaming WebM/Opus metadata (which reports `Infinity`/`NaN`).
- **Frozen "Uploading … 0%" — FIXED.** Uploads now report a real `preparing`
  (compression) → `uploading` stage, and Supabase Storage uploads use an
  `XMLHttpRequest` with `xhr.upload.onprogress` for genuine byte-level progress
  (the previous `supabase-js` path emitted no progress events).

**Message rendering (§31 mandatory fixes)**
- **Document text visibility — FIXED.** File cards used a translucent
  `bg-black/10` background with white text for sent messages (invisible on the
  light chat canvas). Cards now use the GaGa green bubble for sent messages and a
  light bordered card for received messages, so text is always legible.
- **Location card text visibility — FIXED** (same root cause as documents).
- **Double timestamps — FIXED.** `PollMessage` and `ContactCardMessage` rendered
  their own `ReadReceipt` *and* `MessageItem` rendered another below the bubble.
  The redundant receipts were removed so every message shows exactly one,
  consistent timestamp.
- **Excessive spacing / avatar positioning — FIXED.** The timestamp now renders
  in its own row below the bubble, so the avatar aligns with the bubble (not the
  timestamp) and grouped messages are tighter.
- **Live location sync — FIXED.** `LocationMessage` now parses coordinates from
  the message *content* first (which live-location sessions refresh every 30s)
  instead of the stale `mediaUrl`, so the map preview actually moves.
- **Location map reliability — FIXED.** Replaced the unreliable
  `staticmap.openstreetmap.de` preview with standard OpenStreetMap tiles plus a
  graceful fallback background.

**Calling (§22–§25)**
- **Black video placeholder — FIXED.** ZEGO UI now sets `showNonVideoUser` /
  `showOnlyAudioUser` so a participant's avatar is shown when their camera is
  off (never a giant black tile), and `videoScreenConfig.objectFit: 'cover'`
  fills the screen without letterbox bars.
- **Broken gray call background — FIXED.** The legacy call backdrop is a clean
  `#0b141a`; remote/local `<video>` elements only mount when a stream exists.
- **Call avatar fallback — FIXED.** The caller's real name/avatar resolve from
  the friends store first (instant), then the DB; the generic "User"/"U"
  fallback is replaced with "Unknown".
- **Call-state sync — FIXED.** Pressing ZEGO's own End button now closes the
  call record (`onRoomEnded` → `endCallInStore`), so the call is never stuck.

### Carried over from the previous milestone
- App renamed to **GaGa** (launcher label, Capacitor `appName`, `index.html`,
  `manifest.json`, `package.json`, in-app wordmark, localized names).
- Real data implemented (PDF §17): real check-in streak, honest landing page,
  self-contained inline-SVG default avatars, production logging hygiene.
- Attachment/Share screen overhaul (bottom-sheet picker, media preview, camera
  capture, contact picker, live location, voice preview, file download).
- Native permission bridge (`GaGaNative.openAppSettings`).
- Android 10–13 WebView compatibility polyfills.
- Security gate (PDF §14): only public keys bundled (Supabase anon, Firebase API,
  ZEGO App ID, Web Push public key).

## Build pipeline

```
./node_modules/.bin/tsc -b
NODE_OPTIONS="--max-old-space-size=2048" npx vite build
npx cap sync android
node scripts/strip-native-web-assets.mjs
cd android && ./gradlew assembleRelease bundleRelease
```

## Backend (production)

- **Supabase** project `fcjgbbmfqdkucfpqjxae` (ap-northeast-2) — Postgres + RLS +
  Realtime + Storage + Edge Functions. `public_profiles` is a view over `users`.
- **Firebase** project `oumagachat` — Auth + FCM.
- **ZEGOCLOUD** App ID `372536818` — voice/video calling.
