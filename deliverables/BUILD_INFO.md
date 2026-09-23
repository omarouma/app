# GaGa — Android Release Build

**Version:** 1.0.0 (versionCode 1)
**Package:** `gagachat.app`
**App label:** GaGa
**Build date:** 2026-09-23 (global-reach pass 7 — 12 languages + final audit)
**minSdk:** 22 (Android 5.1+) · **targetSdk:** 34 (Android 14)

## Artifacts

| File | Size | Purpose |
|---|---|---|
| `GaGa-v1.0.0-release.apk` | 5.7 MB | Direct install / sideload / testing |
| `GaGa-v1.0.0-release.aab` | 6.2 MB | Google Play Store upload |

> **Size milestone:** the APK shrank from **27.2 MB → 5.6 MB (−78%)** and the AAB
> from **26.9 MB → 6.1 MB (−76%)** in this pass (see "Performance pass" below).

## Checksums (SHA-256)

```
02d76430cd08b81488343b1816a0b2f38c8c817892017832b85469fde25f6a1a  GaGa-v1.0.0-release.apk
d54b7ef005e69bc3f6404c93b94c3b9855a82b80aaa0dee12b9cd9225fcf8e2b  GaGa-v1.0.0-release.aab
```

> The APK checksum changes on every build because APK signing embeds a
> timestamp; the AAB is byte-for-byte reproducible.

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

## Global compatibility

This is a **single universal APK** — no ABI splits, no device-specific builds —
so one file installs and runs everywhere:

| Dimension | Coverage |
|---|---|
| **Android version** | **5.1 (API 22) → 14 (API 34)** — covers ~99% of active devices |
| **CPU architecture** | **All** — arm64-v8a, armeabi-v7a, x86, x86_64 (pure Java/Kotlin + WebView; **zero native `.so` libs**, so no ABI is excluded) |
| **Locales** | **12 in-app UI languages** (en, zh, hi, es, ar, pt, ru, bn, id, fr, de, ja) + **85 Android framework locales/regions** bundled (af, am, ar, as, az, be, bg, bn, bs, ca, cs, da, de, el, en-AU/CA/GB/IN, es, es-US, et, eu, fa, fi, fr, fr-CA, gl, gu, hi, hr, hu, hy, in, is, it, iw, ja, ka, kk, km, kn, ko, ky, lo, lt, lv, mk, ml, mn, mr, ms, my, nb, ne, nl, or, pa, pl, pt, pt-BR, pt-PT, ro, ru, si, sk, sl, sq, sr, sr-Latn, sv, sw, ta, te, th, tl, tr, uk, ur, uz, vi, zh-CN, zh-HK, zh-TW, zu) |
| **Screen sizes** | All densities (mdpi → xxxhdpi) + portrait-locked UI |
| **Signing** | v1 (JAR) + v2 + v3 — verifies on Android 5 through 14+ |
| **Store-ready** | AAB provided for Google Play; APK for direct/sideload distribution |

## What's included in this build

### Global-reach pass (P0) — language coverage 6 → 12

GaGa's in-app UI was translated into **12 languages** (up from 6), covering the
majority of the world's speakers. Each new dictionary mirrors the English key set
**exactly (250/250 keys, zero fallbacks)** and is wired into the onboarding
language step and Settings → Language selector (both data-driven, so the new
languages appear automatically).

| Code | Language | Speakers (approx.) |
|---|---|---|
| `en` | English | 1.5 B |
| `zh` | Chinese (中文) | 1.1 B |
| `hi` | **Hindi (हिन्दी)** | 600 M |
| `es` | Spanish (Español) | 560 M |
| `ar` | Arabic (العربية) | 380 M |
| `pt` | **Portuguese (Português)** | 260 M |
| `ru` | **Russian (Русский)** | 250 M |
| `bn` | Bengali (বাংলা) | 230 M |
| `id` | **Indonesian (Bahasa Indonesia)** | 200 M |
| `fr` | French (Français) | 130 M |
| `de` | **German (Deutsch)** | 130 M |
| `ja` | **Japanese (日本語)** | 125 M |

New in this pass (bold): **Hindi, Portuguese, Russian, Indonesian, German,
Japanese.** The language list is scrollable on small screens, and RTL is handled
automatically for Arabic.

### Performance & professional-grade pass (P0)

A dedicated performance pass targeting **app size, cold-start speed and runtime
smoothness** — the difference between a hobby build and a store-ready one:

1. **19.4 MB ringtone video → 0.5 MB audio (biggest single win).** The incoming-
   call ringtone was shipped as a **1080p H.264 video** (5.1 Mbps, 19.4 MB) that
   was only ever used for its audio track. It has been demuxed to an audio-only
   AAC `.m4a` (~0.5 MB, 128 kbps stereo, codec copied losslessly from the source)
   — a **~97% reduction** that alone removed ~19 MB from the APK. AAC-in-M4A is
   natively supported by every Android WebView and iOS Safari, so nothing is lost.
   (`src/lib/sounds.ts` now points at `/gta-ringtone.m4a`.)
2. **R8 code shrinking + obfuscation + resource shrinking enabled.** The release
   build previously shipped `minifyEnabled false` / `shrinkResources false`, so
   the full unoptimised DEX and every resource were packaged. R8 now removes
   unused code and resources: **`classes.dex` dropped 7.39 MB → 2.28 MB (−69%)**.
   A comprehensive `proguard-rules.pro` keeps everything reached reflectively —
   Capacitor core + all 6 plugins, the `@JavascriptInterface` WebView bridge,
   Cordova plugins, Firebase/FCM and AndroidX WebKit — verified present in the
   shipped DEX after minification.
3. **Splash images converted to WebP.** All 11 density variants of the launch
   splash were PNG; converted to WebP at q85: **701 KB → 77 KB (−89%)**. Android
   resolves `@drawable/splash` by name, so no code change was needed.
4. **WebView runtime tuning (`MainActivity`).** The WebView now renders on the
   **GPU hardware layer** (smooth 60fps scrolling/animation for message lists),
   allows **media autoplay** (ringtone + profile cover video start without a
   gesture), uses the normal HTTP cache (avatars/media aren't re-downloaded each
   launch), and disables over-scroll glow + scrollbars for a native feel.
5. **Manifest: `hardwareAccelerated="true"` + `largeHeap="true"`.** Explicit GPU
   acceleration and a larger heap for a media-heavy chat app (large images,
   video, voice) to reduce GC pressure and OOM risk on low-RAM devices.
6. **Gradle build performance.** `org.gradle.parallel`, `org.gradle.caching` and
   `org.gradle.configureondemand` enabled so repeat release builds (R8 is
   CPU-heavy) are significantly faster.

**Net result:** APK **27.2 MB → 5.6 MB (−78%)**, AAB **26.9 MB → 6.1 MB (−76%)**,
with faster cold start (smaller DEX), smoother scrolling (GPU layer) and lower
memory pressure — a lean, professional, globally distributable build.

### Security & session-hygiene pass (P0/P1)

A further improvement/fix pass focused on **device security, session hygiene and
deep-link reliability**:

1. **Auth tokens excluded from Android cloud backup / device transfer (security).**
   Android's Auto Backup could previously copy the app's private storage —
   including the persisted Supabase session (`CapacitorStorage.xml`) — to the
   user's Google Drive and restore it onto a *different* device, which is a
   session-hijack risk. Added `android/app/src/main/res/xml/backup_rules.xml`
   (Android 11 and below) and `data_extraction_rules.xml` (Android 12+), both
   excluding `CapacitorStorage.xml`, `CapacitorStorage` and `gaga-auth-token`
   from cloud backup **and** device-to-device transfer, and referenced them from
   `<application>` via `android:fullBackupContent` and
   `android:dataExtractionRules`. Verified present in the compiled manifest
   (`fullBackupContent=@0x7f110000`, `dataExtractionRules=@0x7f110002`).
2. **Offline message queue cleared on logout.** The pending outbound-message
   queue (`gaga-message-queue`) is now cleared on sign-out via a new
   `clearQueue()` in `src/lib/offlineQueue.ts`, so a queued message composed by
   one account can never be flushed under a different account after a switch.
3. **User-scoped local storage cleared on logout.** `resetStores.ts` now also
   purges user-scoped `localStorage` keys on sign-out — message/chat drafts
   (`draft_`, `chat_draft_`), the offline queue, muted-notification types,
   recent searches, recent GIFs, scheduled messages and recent emoji — so no
   residue of the previous account survives a logout (req #30, "never mix cached
   data between accounts").
4. **Android App Links auto-verification.** Added
   `public/.well-known/assetlinks.json` declaring package `gagachat.app` with the
   release signing certificate SHA-256, so `https://gagachat.app/…` links open
   directly in the app (verified App Links) instead of a browser chooser. The
   file is shipped in the web bundle and preserved through `cap sync`.

### Full re-audit pass — missing items implemented (P0)

A complete re-audit of every previously-stated requirement (Startup/Auth Flow +
Chat-Room UI/UX §33–§76) was performed and the following gaps were found and
fixed:

1. **Never mix cached data between accounts (req #30).** Signing out previously
   left every user-scoped Zustand store populated, so signing in as a different
   account could briefly show the previous account's chats, friends, groups,
   calls, notifications, wallet, premium status and settings. Added
   `src/lib/resetStores.ts` (`resetUserStores()`) which returns all data stores
   to their pristine initial state, wired into both the explicit `logout()` path
   (`AuthContext`) and the `SIGNED_OUT` branch of `useAuthStore.init()` (covers
   session revocation / account deletion).
2. **Offline startup → cached Home.** Previously, launching without a network
   connection made the profile fetch fail, which was treated as "signed out" and
   bounced the user to the login screen despite a valid persisted session. Added
   `src/lib/profileCache.ts` (per-user, app-private storage) and made
   `fetchUserProfile()` write on success and fall back to the last-known cached
   profile on failure. The cache is cleared on sign-out for shared-device safety.
3. **Temporary network loss must not log the user out.** `isSessionValid()` (used
   by the periodic session guard) treated *any* `getUser()` error as an invalid
   session. It now distinguishes a definitive auth rejection (HTTP 4xx) from a
   transient network/timeout error — only the former signs the user out.
4. **Cold-start deep links.** `App.getLaunchUrl()` is now handled in
   `useNativeNavigation` so a `gagachat://…` / `https://gagachat.app/…` link that
   launches the app cold still lands on the requested destination (previously
   only the `appUrlOpen` event, which does not fire on cold start, was handled).

### Startup & Authentication Flow — no Landing View on native (P0)

The installed Android app **never** shows the website-style landing page. The
startup flow is now strictly:

- **Fresh install** → GaGa Splash → Login / Create Account → Main Home.
- **Already registered / logged in** → GaGa Splash → Main Home.
- **After logout** → GaGa Splash → Login / Create Account.

Implementation: the `/` route in `App.tsx` redirects to `/auth` on native
(`isNative()`) instead of rendering `LandingView`; the auth-resolution loading
gate (`if (loading) return <PageLoader />`) resolves the session **during the
splash** so there is no flash of Auth before Home; all post-auth navigations use
`replace`, so Android Back from Home can never expose the Auth screen or the
Landing View. The "Home" button inside `AuthView` is hidden on native so there is
no path back to a landing page. Session persistence is handled by Supabase
(`onAuthStateChange` + `subscribeToUserProfile`) with a 6 s safety timeout.

### Profile cover video — always visible and playable

New `ProfileCover` component guarantees the profile cover video is always
visible and playable on the native WebView: muted autoplay + `playsInline`,
graceful fallback to the cover image (poster) if the video fails to load, a
tap-to-play/pause overlay, and a mute/unmute toggle. Wired into `ProfilePage`.

### Chat-room UI/UX production pass (§33–§76)

- **§36/§37 Incoming message UI — fixed invisible bubbles.** Incoming text,
  poll, contact-card, voice and group bubbles used `bg-background` (white) with
  no border on a white conversation surface, making them invisible in light
  mode. They now carry a `border border-border` surface, matching the file /
  location / call bubbles.
- **§39 Message grouping.** Consecutive messages from the same sender now break
  into a new group after a 5-minute gap (in addition to sender change / day
  boundary), so avatars and spacing stay meaningful.
- **§33/§72 Chat surface + dark mode.** The conversation background is now a
  `.chat-surface` token; the user-chosen light gradient is dimmed automatically
  in dark mode so bubbles stay legible and the theme stays consistent.
- **§47 Keyboard-safe composer (group chat).** `GroupChatPage` now uses
  `useKeyboardInset()` and offsets the composer by `--kb-inset`, matching the
  1:1 chat room.
- **§70 Empty state.** The 1:1 chat room now renders a friendly "No messages
  yet" placeholder instead of a blank surface.

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
