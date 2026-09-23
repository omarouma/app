# GaGa — Android Release Build

**Version:** 1.0.0 (versionCode 1)
**Package:** `gagachat.app`
**App label:** GaGa
**Build date:** 2026-09-23 (chat-room spec pass 2)
**minSdk:** 22 (Android 5.1+) · **targetSdk:** 34 (Android 14)

## Artifacts

| File | Size | Purpose |
|---|---|---|
| `GaGa-v1.0.0-release.apk` | 26.0 MB | Direct install / sideload / testing |
| `GaGa-v1.0.0-release.aab` | 25.6 MB | Google Play Store upload |

## Checksums (SHA-256)

```
e0a105d6d9aab7c69037673c85f7c75ed7ea0051aaa7e5d2807f0bda22e5953a  GaGa-v1.0.0-release.apk
ed295fe0e7072dda90c2a563bf58c9aceee8c2c82b11ede5eb6584dc620155f9  GaGa-v1.0.0-release.aab
```

## Signing certificate

```
DN: CN=GaGa Chat, OU=Mobile, O=GaGa, L=Dhaka, ST=Dhaka, C=BD
SHA-256: 5D:DB:D0:16:31:AA:18:61:AB:30:8E:FF:B3:A1:28:56:66:4F:0A:55:D8:ED:C2:1F:75:D9:0B:F0:3F:35:F4:A2
SHA-1:   B5:FE:13:D4:26:E0:DE:B7:E5:3D:E8:3F:F8:B4:CB:88:A9:96:88:38
```

Signature schemes verified: **v1 (JAR) ✓ · v2 ✓ · v3 ✓**

> **NOTE — signing key.** The release keystore (`android/gaga-release.jks`) is
> git-ignored and was **regenerated** in this build environment (the original
> keystore was not persisted between sessions). The certificate DN is unchanged,
> but the key material — and therefore the certificate SHA-256 — is **new**.
> Devices that already have a build signed with the previous key installed must
> **uninstall it first** before installing this build. Keep this keystore safe:
> all future updates must be signed with the same key.

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

### Chat-room spec pass 2 (link previews, presence, responsive, ordering)

**§41 — Rich link previews.** The first URL in a text message is now rendered as
a Messenger/WhatsApp-style preview card (image, title, description, domain).
`src/lib/linkPreview.ts` extracts and validates the URL (SSRF-hygiene host
blocklist, in-memory LRU cache of 200), then calls a new **`link-preview` Edge
Function** that fetches the page with a 512 KB byte cap, 6 s timeout, and
manual redirect following (re-validating each hop), and parses OpenGraph /
Twitter-card metadata. The preview is persisted on the message
(`messages.link_preview` jsonb, migration `20260927000200_link_previews.sql`)
so it survives reconnect/restart, and is fetched fire-and-forget on send so it
never blocks the message. `LinkPreview.tsx` renders the card; the fetch never
throws (degrades to a slim domain chip).

**§29 — Presence / last seen.** The chat header now shows a detailed,
WhatsApp-style last-seen label — "Last seen today at 6:32 AM", "Last seen
yesterday at 9:05 PM", "Last seen Mon at 4:12 PM", "Last seen 12 Aug at 3:40 PM"
— via `formatLastSeenDetailed` in `src/lib/timeUtils.ts`. When the peer is
online the header shows "Online" (from the presence channel) and the label is
suppressed, so the two never contradict each other.

**§45/§46/§47 — Responsive media + keyboard-safe composer.** Image and video
bubbles now size themselves to the viewport (max 320×420, 75% of viewport
width) and preserve the media's true aspect ratio via `object-contain` — no
stretch, crop, or horizontal overflow on any device or orientation. A new
`useKeyboardInset` hook measures `window.visualViewport` and exposes a
`--kb-inset` CSS variable so the composer rides above the on-screen keyboard
without the layout jumping.

**§23/§24 — Timeline integrity.** Realtime listeners are ref-counted through
`subscribeDeduped` so a chat never opens duplicate channels. After every merge
(initial fetch, realtime echo, and optimistic insert) the timeline is re-sorted
by `timestamp` ascending with a stable identity tiebreaker
(`sortMessagesChronologically`), so out-of-order realtime arrivals can never
render out of order.

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
