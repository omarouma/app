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
5649733508916e008216c86916e902d51d3070e3365ff79760265ee4db7864c0  GaGa-Chat-v1.0.0-release.apk
c4af5269e87202f99cac92624409e0f3a9519bf0e5744a1b0c1667fef4d9427d  GaGa-Chat-v1.0.0-release.aab
```

## Signing certificate

```
DN: CN=GaGa Chat, OU=Mobile, O=GaGa, L=Dhaka, ST=Dhaka, C=BD
SHA-256: 64bb1bf364f0b8cff85a2aaceb0c30eeebb291a4644ab937f04538d9d2b56d20
SHA-1:   6e3e8359af9ba7473a56a6ee64c5e03c956bb373
```

## What's included in this build

1. **Real-time calling fixed** — ZEGO App ID `372536818` + token server baked into the bundle; ZIM + RTC token flow verified.
2. **Profile cover video upload** — photo OR video (≤50 MB), autoplay/muted/loop.
3. **Phone contacts removed** — no contact permissions requested.
4. **Search removed from bottom nav** — People · Chat · Calls · Profile.
5. **Chat room UI polish** — bubbles, reply previews, input bar, header, scroll controls.
6. **GaGa branding** — icon, splash, app name, colors (#00C300), manifest, in-app logo.

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
