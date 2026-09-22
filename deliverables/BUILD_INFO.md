# GaGa — Android Release Build

**Version:** 1.0.0 (versionCode 1)
**Package:** `gagachat.app`
**App label:** GaGa
**Build date:** 2026-09-22
**minSdk:** 22 (Android 5.1+) · **targetSdk:** 34 (Android 14)

## Artifacts

| File | Size | Purpose |
|---|---|---|
| `GaGa-v1.0.0-release.apk` | 26.0 MB | Direct install / sideload / testing |
| `GaGa-v1.0.0-release.aab` | 25.6 MB | Google Play Store upload |

## Checksums (SHA-256)

```
9294f6086f1fbc3e1a6d9b0267459f9467de22486fc3590e777e5f79c3cc8408  GaGa-v1.0.0-release.apk
942e34a37757b94b0b9ba6f879abbf9d616553a3965090d925a80192d2874d7a  GaGa-v1.0.0-release.aab
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

### 1. App renamed to "GaGa"
- Launcher label (`strings.xml` `app_name` / `title_activity_main`) → **GaGa**
- Capacitor `appName` → **GaGa**
- `index.html` `<title>` + `application-name` → **GaGa**
- `manifest.json` `name` / `short_name` → **GaGa**
- `package.json` name → `gaga`
- In-app Logo wordmark → **GaGa**
- Localized `appName` (en/es/fr/bn/ar/zh) → **GaGa**
- Deliverable filenames → `GaGa-v1.0.0-release.apk` / `.aab`

### 2. Real data implemented (PDF §17 — Build & Dependency Hygiene)
- **Gaga Rewards** — removed the simulated check-in streak ("mark previous days
  for demo"); the 7-day streak now reflects the real backend `users.streak_days`
  (exposed via `public_profiles`). Removed fabricated mission progress; missions
  now derive from real account data only (streak + coin balance).
- **Landing page** — removed fabricated testimonials (fake names + third-party
  `i.pravatar.cc` avatars); replaced with honest, verifiable product highlights.
- **Default avatars** — replaced the external `api.dicebear.com` dependency with
  a self-contained inline-SVG generator (deterministic color + initial). Works
  offline, no third-party calls, no identifier leakage.
- **Logging hygiene** — removed all `console.log/debug/info` from production
  source and added a production guard in `main.tsx` that silences verbose logging
  in release builds. `console.warn/error` retained for real error reporting.
- **No dev endpoints / localhost / sample datasets** found in `src/`.

### 3. Production / responsive fixes (PDF §2)
- Viewport meta now includes `maximum-scale=1` per the PDF's recommended
  configuration (`width=device-width, initial-scale=1, maximum-scale=1,
  viewport-fit=cover`).

### 4. Security gate (PDF §14)
- Verified the shipped bundle contains **only public keys** (Supabase anon key,
  Firebase API key, ZEGO App ID, Web Push public key). No `service_role` /
  private keys are bundled.

### 5. Carried over from the previous milestone
- Attachment/Share screen overhaul (bottom-sheet picker, media preview, camera
  capture, contact picker, live location, voice preview, file download).
- Native permission bridge (`GaGaNative.openAppSettings`).
- Android 10–13 WebView compatibility polyfills.

## Build pipeline

```
./node_modules/.bin/tsc -b
NODE_OPTIONS="--max-old-space-size=1536" npx vite build
npx cap sync android
node scripts/strip-native-web-assets.mjs
cd android && ./gradlew assembleRelease bundleRelease
```

## Backend (production)

- **Supabase** project `fcjgbbmfqdkucfpqjxae` (ap-northeast-2) — Postgres + RLS +
  Realtime + Storage + Edge Functions. `public_profiles` is a view over `users`.
- **Firebase** project `oumagachat` — Auth + FCM.
- **ZEGOCLOUD** App ID `372536818` — voice/video calling.
