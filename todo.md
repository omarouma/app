# GaGa — Performance & Professional-Grade Pass (native Android APK)

Branch: `feat/attachment-share-screen`

## Section 1 — Payload / size wins (biggest impact)
- [x] Replace 19.4 MB `gta-ringtone.mp4` (1080p video) with ~0.5 MB audio-only `gta-ringtone.m4a`; update `sounds.ts`
- [x] Enable R8 minification + resource shrinking in release build (with correct keep rules)
- [x] Verify no source maps / web-only assets ship in the APK
- [x] Convert 11 splash PNGs to WebP (701 KB -> 77 KB)

## Section 2 — Runtime performance (WebView + native)
- [x] WebView performance tuning in MainActivity (hardware layer, cache, media, scroll)
- [x] Manifest: explicit hardwareAccelerated + largeHeap for media-heavy chat
- [x] Gradle: parallel + build cache + configure-on-demand

## Section 3 — Build & Verify
- [x] tsc -b clean
- [x] vite build + cap sync android + strip assets
- [x] gradlew assembleRelease bundleRelease (R8 + shrinkResources ran)
- [x] Verify APK size drop (27.2MB -> 5.6MB) + signature + R8 kept classes + manifest
- [x] Update BUILD_INFO + commit/push
