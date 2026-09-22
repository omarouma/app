# GaGa Chat — Android Release Build

**Version:** 1.0.0 (versionCode 1)
**Package:** `gagachat.app`
**App label:** GaGa Chat
**Build date:** 2026-09-22
**minSdk:** 22 (Android 5.1+) · **targetSdk:** 34 (Android 14)

## Artifacts

| File | Size | Purpose |
|---|---|---|
| `GaGa-Chat-v1.0.0-release.apk` | 27.2 MB | Direct install / sideload / testing |
| `GaGa-Chat-v1.0.0-release.aab` | 26.8 MB | Google Play Store upload |

## Checksums (SHA-256)

```
8c635b852720ea891aa5a19940a4ea49198713500c1686af18489f4229af028f  GaGa-Chat-v1.0.0-release.apk
09328628869ca9e971ef54672891865f189e1200df5ffd857222f9cfc62fc149  GaGa-Chat-v1.0.0-release.aab
```

## Signing certificate

```
DN: CN=GaGa Chat, OU=Mobile, O=GaGa, L=Dhaka, ST=Dhaka, C=BD
SHA-256: 3E:6E:F7:7D:EE:4B:A0:11:14:4B:2F:68:C5:FB:43:E9:EF:7B:F7:7C:D9:2C:EE:C1:7C:54:69:51:37:0D:34:83
SHA-1:   7A:FF:20:8D:7D:55:4E:18:40:65:BC:46:4A:1A:80:CE:E4:20:2C:D9
```

> **NOTE — signing key changed.** The original release keystore was not present in
> this build environment, so a fresh keystore (`android/gaga-release.jks`) was
> generated. This APK therefore has a **different signature** than the previous
> v1.0.0 build. Devices with the old build installed must uninstall it before
> installing this one. Before publishing to Google Play, keep this keystore safe —
> all future updates must be signed with the same key.

## What's included in this build

### Chat screen (previous milestone)
1. **Group chat parity with direct chat** — the group conversation screen reuses
   the same generic `MessageItem` renderer + virtualized list as 1:1 chat.
2. **Enriched message actions** — Reply, React, Copy, Select, Edit, Forward,
   Pin/Unpin, Save/Unsave, Translate, Info, Delete (for me / for everyone).
3. **Mobile gestures** — long-press to multi-select, double-tap to reply,
   swipe-to-reply.
4. **Reaction picker, image lightbox, scroll-to-bottom button, typing indicator,
   unread separator** in group chats.
5. **Advanced group features** — forward modal, multi-select mode, scheduled send,
   polls, sticker/GIF picker, chat background picker, pinned-message banner,
   jump-to-match search navigation.

### Contacts screen (this milestone)
6. **Design consistency (E1)** — dark-mode-safe sticky section headers
   (`bg-background/95`), semantic active-tab color, and every action surface
   unified to the single GaGa-green accent (mobile + desktop contacts views).
7. **Report user** — full reason picker (spam, harassment, hate speech, violence,
   nudity, false info, other) + optional details, wired to `reportUser`.
8. **Confirmation dialogs** — Remove friend and Block now require confirmation;
   Block accepts an optional reason.
9. **Copy username / Share contact** — copy `@handle` or share a profile link via
   native share sheet.
10. **Close-friend toggle** — mark/unmark close friends from the action menu and
    the preview sheet.
11. **Sort options** — Name (A–Z), Recently active, Online first.
12. **Multi-select mode** — bulk Remove / Block with a selection header bar.

### User profile screen (this milestone)
13. **Design consistency (E1)** — dark-mode-safe sticky header (`bg-background/95`),
    cover gradient and every badge/action surface unified to the single GaGa-green
    accent (business, favorite, request, connect, voice/video, mute, media, share,
    share-sheet, completeness badges). Premium gold branding retained intentionally.
14. **Block with confirmation + reason** — blocking now opens a confirm dialog with
    an optional reason passed to `blockUser`; unblocking stays immediate.
15. **Remove-friend confirmation** — removing a friend now requires confirmation.
16. **Copy username** — copy the `@handle` to the clipboard in one tap.
17. **Close-friend toggle** — add/remove close friends directly from the profile.
18. **Follow / Unfollow** — real follow graph via `followUser`/`unfollowUser`.
19. **Real follower/following counts** — loaded live via `getFollowers`/`getFollowing`
    instead of stale embedded arrays.
20. **Business profile editing** — business accounts can edit name, category,
    description, address, hours, website, email, and phone inline.

### Settings screen (this milestone)
21. **Correct app version** — the About row now shows the real `1.0.0` (was a
    hardcoded `2.0.0`).
22. **Native permission guidance** — the notification tip now points to Android
    system settings instead of web-browser instructions.
23. **Real "Clear Cache"** — clears the Cache API plus non-essential
    `localStorage`/`sessionStorage` keys (auth/session keys preserved) and reports
    the reclaimed size.
24. **Live "Storage Usage"** — reads `navigator.storage.estimate()` and renders a
    real usage bar with used / quota figures.
25. **New "Data & Storage" section** — auto-download media, data saver,
    auto-play videos, auto-play reels, and media-quality selector, all backed by
    the settings store.
26. **New "Accessibility" section** — reduced motion, high contrast, haptic
    feedback, and enter-to-send toggles.
27. **New "Security" section** — biometric lock, security alerts, screen-lock
    timeout selector, change password, two-step verification, and linked devices.
28. **Expanded notifications** — added group sound, mentions, reactions, and quiet
    hours (with start/end time pickers).
29. **Change password flow** — re-authenticates with the current password then
    calls `supabase.auth.updateUser({ password })`.
30. **Design consistency (E1)** — fixed the Privacy page data-protection notice
    from blue (`#2196F3`) to the single GaGa-green accent (`#00C300`).

### Platform
31. **Real-time calling** — ZEGO App ID `372536818` + Supabase token server baked in.
32. **GaGa branding** — icon, splash, app name, colors (#00C300), manifest, logo.

### Chat & Contacts performance + UI (this milestone)
33. **Chat list smoothness** — removed the per-row staggered entrance animation
    (a major source of jank on long lists) so rows render instantly.
34. **Chat list efficiency** — removed the redundant per-row `useFilteredOnline`
    hook (previously N window listeners + N async privacy queries for N rows);
    online state now flows down from the parent as a single prop.
35. **Message list smoothness** — removed the per-message `motion` entrance
    animation that ran on every row inside the virtualized list.
36. **Virtualized list tuning** — `Virtuoso` now uses `computeItemKey`,
    `increaseViewportBy`, `overscan`, `atBottomThreshold`, `defaultItemHeight`,
    and a smarter `followOutput` (only auto-follows when already at the bottom).
37. **Chat search fast-path** — the chat-list filter skips per-row name/preview
    resolution entirely when the search box is empty.
38. **User ID always visible** — the `@handle` (or a short `#id` fallback) now
    shows in every chat-list row, in the 1:1 chat header, and in every contact row.
39. **Faster photo sending** — photos are now compressed client-side (downscaled
    to ≤1600px, JPEG q0.82) before upload, dramatically cutting upload time and
    mobile-data use while keeping quality high. GIF/SVG and already-small images
    pass through untouched.
40. **Design consistency (E1)** — unified every remaining competing color in the
    chat surface to the single GaGa-green accent: chat-list group avatar (indigo),
    mute/archive swipe actions (amber/gray), draft/pending chips (orange), file
    cards (multi-color extension map), poll bubbles/options (purple), text
    links/mentions (blue), and the "New Messages" separator (red).

### Android 10 / 11 / 12 / 13 compatibility (this milestone)

The previous build rendered a **blank screen** on Android 10–13 because the web
bundle used features that older Android **WebViews** cannot parse or render. The
app is a Capacitor WebView app, so its real "minimum OS" is the device's WebView
version, not the Android version. Fixed:

41. **ES2020 syntax removed from the bundle** — the JS shipped optional chaining
    (`?.`) and nullish coalescing (`??`), which throw a `SyntaxError` on WebView
    < 80 (Android 10 ships WebView 74) → instant blank screen. The Vite build
    target was lowered from `es2020` to **`es2017`**, so esbuild now transpiles
    all ES2018–ES2020 syntax down to code every WebView ≥ 55 can parse.
42. **`dvh` viewport units removed** — `100dvh` requires WebView 108 (Android 10–12
    stock WebViews are older), and an unsupported `height:100dvh` collapses the
    layout to zero height. Every `dvh` (57 occurrences across 38 files + CSS) was
    replaced with universally-supported `vh`, with `vh` fallbacks kept in the
    stylesheet.
43. **`inset` shorthand removed** — Tailwind's `inset-0` (70 usages: modals, call
    overlay, image placeholders) emits `inset:0`, which requires WebView 87. All
    were converted to longhand `top-0 right-0 bottom-0 left-0`.
44. **`max()` safe-area fallbacks** — `padding: max(12px, env(safe-area-inset-*))`
    requires WebView 79; plain-value fallbacks were added before each.
45. **Runtime polyfills** — an ES5 polyfill block in `index.html` now provides
    `Promise.allSettled`, `Promise.any`, `queueMicrotask`, `requestIdleCallback`,
    `globalThis`, `Array.prototype.at/flat/flatMap/findLast`, `Object.fromEntries`,
    `Object.hasOwn`, `String.prototype.replaceAll`, `structuredClone`, and
    `Element.prototype.replaceChildren` for WebViews that lack them.
46. **Install-time feature fix** — the `BLUETOOTH` permission made Android infer
    `android.hardware.bluetooth` as a **required** feature, blocking installation
    on some devices. It (plus bluetooth_le, telephony, location, gps, touchscreen)
    is now explicitly `required="false"`.
47. **Signature schemes** — the APK is now signed with **v1 + v2 + v3** (previously
    v1 + v2) for the widest verification coverage.
48. **Native hardening** — `android:largeHeap="true"`,
    `android:hardwareAccelerated="true"`, and
    `android:requestLegacyExternalStorage="true"` (helps file access on Android 10).

Result: the APK installs and runs on **Android 5.1 (API 22) through Android 14
(API 34)**, including Android 10, 11, 12 and 13.

## Build pipeline

```
npx tsc -b
npx vite build
npx cap sync android
node scripts/strip-native-web-assets.mjs
cd android && ./gradlew assembleRelease bundleRelease
```

## Publishing note

ZEGOCLOUD free plan caps at 100 MAU — upgrade before a large public launch.
