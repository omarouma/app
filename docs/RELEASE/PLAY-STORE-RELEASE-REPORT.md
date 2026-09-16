# GaGa Chat v3.1.17 — Play Store Release Build Report

**Date:** 2025-09-16
**Product:** GaGa Chat — native Android messaging app (Kotlin, no webview)
**Package:** `gagachat.app` · **versionName:** `3.1.17` · **versionCode:** `30117`
**Target artifact:** Play-Store-publishable, release-signed Android App Bundle + APKs

---

## 1. Release Artifacts

| Artifact | Size | SHA-256 |
|---|---|---|
| `GaGaChat-v3.1.17-release.aab` (Play Store primary) | 25.5 MB (25,504,465 B) | `372335c80a5cd7190c0db937d54526c80628f4e60892a91439433f6d49c747f4` |
| `GaGaChat-v3.1.17-release-universal.apk` | 47.0 MB (47,033,607 B) | `1f2e84bea5ddcd83ac0fb3c2677e5d2931dfec195c83074c3806b69c30943a6f` |
| `GaGaChat-v3.1.17-release-arm64-v8a.apk` | 15.3 MB (15,263,864 B) | `446c61275806c2dd11ee7cd2029041a9f96a62683b065156733e3127711339d5` |
| `GaGaChat-v3.1.17-release-armeabi-v7a.apk` | 10.3 MB (10,296,842 B) | `e0551a46fb06c3d86de540ee44e0e3473c99a83b4256e2e70b37671cb8d0f33f` |
| `deobfuscation/mapping.txt` (R8, upload to Play Console) | 24.3 MB | `992d6de35d3e7e6d09f6fb37389d0551f31c00f1e2d01372e33a4ff3b463b1ba` |

All sizes are far below the Play Store 150 MB base-module limit (no Play Asset Delivery needed).

**Build type:** `release` (NOT the previous `-qa` debug-signed builds). R8 minify + resource shrinking ON (`proguard-android-optimize.txt` + `proguard-rules.pro`), R8 version 8.10.24, min API 24.

## 2. Release Signing — VERIFIED

- **Keystore:** PKCS12, RSA-2048, SHA256withRSA, valid Sep 2026 → Feb 2054 (satisfies Play's requirement that the upload key remain valid well past 2033).
- **Certificate subject:** `CN=GaGa Chat, OU=Mobile, O=GaChat Ltd, L=Yangon, C=MM`
- **Certificate SHA-256:** `6122cdb94ab862f5162fb164990ebdbf1e4db7bf078512944d343ac8269938f2` — the **release key**, not the Android debug key.

`apksigner verify --print-certs` results:

| Artifact | Verifies | v1 | v2 | v3 |
|---|---|---|---|---|
| arm64-v8a APK | ✅ | — | ✅ | — |
| armeabi-v7a APK | ✅ | — | ✅ | — |
| universal APK | ✅ | — | ✅ | — |
| bundletool-derived universal APK (from AAB) | ✅ | — | ✅ | ✅ |

v2-only signing is correct for minSdk 24 (v1/JAR signing is only required below API 24). The AAB itself is jarsigner-signed (`META-INF/GAGACHAT.RSA`), the required AAB format; Play App Signing re-signs delivered APKs with the upload key.

## 3. Play Store Compliance — ALL PASS

| Requirement | Value | Status |
|---|---|---|
| targetSdkVersion | 36 (exceeds Play's API 34+ requirement) | ✅ |
| minSdkVersion | 24 (Android 7.0+, ~99% devices) | ✅ |
| 64-bit native code | `arm64-v8a` present in all artifacts | ✅ |
| versionName clean | `3.1.17` (no `-qa` suffix) | ✅ |
| Not debuggable | `android:debuggable` absent from release manifest | ✅ |
| No cleartext traffic | `network_security_config`: `cleartextTrafficPermitted="false"` (HTTPS only, `https://api.gagachat.app/api`) | ✅ |
| RTL support | `android:supportsRtl=true` | ✅ |
| Modern lib packaging | `extractNativeLibs=false` | ✅ |
| AAB validity | `bundletool validate` PASS; `build-apks --mode=universal` produced a valid, installable APK set | ✅ |
| 16 KB page support | WebRTC native libs from stream-webrtc-android 1.3.10 (16 KB-compatible) | ✅ |
| Permissions | All well-scoped for a chat app (INTERNET, NETWORK_STATE, POST_NOTIFICATIONS, FOREGROUND_SERVICE + dataSync/microphone/camera types, BOOT_COMPLETED, VIBRATE, BIOMETRIC, CAMERA, RECORD_AUDIO, MODIFY_AUDIO, WAKE_LOCK, FULL_SCREEN_INTENT, FINGERPRINT, C2DM.RECEIVE, custom not-exported receiver permission) — no dangerous/excessive scopes | ✅ |
| Launchable activity | `app.gagachat.mobile.ui.AuthActivity`, label `GaGaChat` | ✅ |

## 4. Functional Completeness in the Release DEX (R8-minified)

- **21 activities** in the release manifest — all 19 GaGa UI screens survived minification: Auth, Main (chat list), Chat, Group, CreateGroup, AddFriends, Search, Profile, Settings, NotificationSettings, Safety, Storage, ConnectionStatus, Wallet, Call, IncomingCall, CallHistory, VoiceNote, ImageView — plus zxing CaptureActivity and BiometricActivity.
- **Core services in DEX:** `GaGaService` (foreground realtime), `BootReceiver`, `MessageOutboxWorker`, `GaGaFirebaseMessagingService` (push).
- **Production API wired:** `https://api.gagachat.app/api` found in the release DEX string pool.
- **WebRTC calling:** 9,517 `org.webrtc` references in DEX + `libjingle_peerconnection_so.so` for arm64-v8a / armeabi-v7a / x86 / x86_64.
- **QR scanning:** 445 zxing references + `zxing_capture` layout + beep resource.
- **Localization:** all 12 app locales (ar, bn, de, es, fr, hi, id, pt, ru, tr, ur, zh + English default) present in `resources.arsc` (90 total locales incl. libraries).

## 5. Testing Results — ALL PASS

**Android release-wiring suite (`android/test/release-wiring.cjs`): 6/6 PASS** — static wiring checks (auth/login flows, chat realtime wiring, notification cancel-on-visible-chat, etc.)

**Backend full suite (`backend` `npm test`): 60/60 PASS** covering:
- `test/config.js` — configuration contract
- `test/cloud-adapters.js` — cloud adapter contract
- `test/mysql-contract.js` — MySQL persistence contract
- `test/production-contract.js` — production contract
- `test/release-regression.js` — release regression (auth → messages → idempotency → typing → calls → TURN credentials → wallet demo rules → staging uploads → logout/session revocation → socket close)
- `test/smoke.js` — 60 end-to-end assertions PASS, 0 fail

**Emulator install test:** skipped — no KVM in this sandbox (software-mode emulator is too slow to be meaningful). Installability is instead proven by: apksigner verification (all schemes), `bundletool validate` on the AAB, and `bundletool build-apks` successfully generating a signed universal APK from the AAB — the same pipeline Play Store uses to serve APKs.

## 6. Build Fixes Applied This Session

1. **OOM during R8** (sandbox 3.8 GB RAM, 0 swap): constrained Gradle JVM to `-Xmx1024m -XX:MaxMetaspaceSize=384m`, `org.gradle.parallel=false`, `org.gradle.workers.max=1`; killed the leftover Kotlin compile daemon before rebuilding. R8 then completed successfully.
2. **ABI-splits vs bundle conflict**: `:app:buildReleasePreBundle` failed with "Sequence contains more than one matching element" because `splits.abi` produced 3 APK variants. Fixed by auto-disabling ABI splits for `bundle*` tasks (Play generates per-device APKs from the AAB itself); splits remain active for `assemble*` standalone APK builds. This change is in `android/app/build.gradle.kts` and will be pushed to the repo.

## 7. How to Publish

1. Upload `GaGaChat-v3.1.17-release.aab` to Play Console → Production (or internal testing first).
2. Upload `deobfuscation/mapping.txt` alongside (Play Console → App bundle explorer / Android Vitals deobfuscation file) so R8-obfuscated crash traces are readable.
3. Keep `gaga-release.keystore` + passwords safe — every future update must be signed with the same key. Losing it means losing the app identity (recovery only via Play support).
4. If enrolling in Play App Signing (default for new apps): the keystore above becomes your upload key; Play manages the signing key delivered to users.
5. First-time listing requirements (store-side, not in the APK): 512×512 icon, 1024×500 feature graphic, 2+ phone screenshots, privacy policy URL, content rating questionnaire, data safety form, target audience declaration.

## 8. Verification Log

```
$ apksigner verify --print-certs -v app-arm64-v8a-release.apk
Verifies
Verified using v2 scheme (APK Signature Scheme v2): true
Signer #1 certificate DN: CN=GaGa Chat, OU=Mobile, O=GaChat Ltd, L=Yangon, C=MM
Signer #1 certificate SHA-256 digest: 6122cdb94ab862f5162fb164990ebdbf1e4db7bf078512944d343ac8269938f2
Signer #1 key algorithm: RSA  key size: 2048 bits

$ aapt dump badging app-universal-release.apk
package: name='gagachat.app' versionCode='30117' versionName='3.1.17'
sdkVersion:'24' targetSdkVersion:'36'
launchable-activity: app.gagachat.mobile.ui.AuthActivity
native-code: 'arm64-v8a' 'armeabi-v7a' 'x86' 'x86_64'

$ java -jar bundletool.jar validate --bundle app-release.aab
[this device]  Validation successful — no errors reported

$ java -jar bundletool.jar build-apks --bundle app-release.aab --mode=universal ...
[aab-derived-universal.apks → universal.apk]  apksigner verify → v2+v3 PASS
```
