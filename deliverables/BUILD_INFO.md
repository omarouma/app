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
016c528ed1323ac207a35bbf8d960a50516d2d58a181c29e36ead04972d6b3e6  GaGa-Chat-v1.0.0-release.apk
d18ad441d32867e82c7ce63304f291f49f2b97fdd73c1372cd1b02de49b79f49  GaGa-Chat-v1.0.0-release.aab
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

### Platform
13. **Real-time calling** — ZEGO App ID `372536818` + Supabase token server baked in.
14. **GaGa branding** — icon, splash, app name, colors (#00C300), manifest, logo.

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
