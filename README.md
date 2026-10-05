# GaGa Chat — Native Android

GaGa Chat is a real-time messaging and calling product. **This repository contains
the native Android application** (Kotlin + Jetpack Compose) plus the static
marketing / download website served at [gagachat.app](https://gagachat.app). The
legacy React/Vite web client and its Data Connect / Web Push tooling have been
removed; the Android app is the single app publish target.

| | |
| --- | --- |
| **App id** | `gagachat.app` |
| **Version** | 2.0.27 (versionCode 29) |
| **Min / target SDK** | 26 / 35 |
| **Language / UI** | Kotlin 2.0, Jetpack Compose (Material 3) |
| **Backend** | Supabase (`fcjgbbmfqdkucfpqjxae`) + Firebase (Messaging / Analytics / Crashlytics) |
| **Calling** | LiveKit (WebRTC SFU); signalling over Supabase Realtime; server-issued tokens |

## Layout

```
android-native/            The Android Gradle project (open this in Android Studio)
├── app/                   Application shell, Hilt wiring, navigation, push, deep links
├── core/                  common · model · database · network · data · ui · firebase
├── feature/               onboarding · auth · home · chat · contacts · people ·
│                          groups · qr · wallet · calls · profile · settings
├── sync/                  outbox · workers (WorkManager)
├── build-logic/           Gradle convention plugins
├── ci/                    prepare.py + backend-public.json (public backend config)
└── docs/, play/           Engineering docs and Play Store assets
supabase/                  Backend edge functions + SQL migrations
└── functions/livekit-token/  Server-only LiveKit JWT minting (native calling)
hosting/public/            Static website (gagachat.app) — landing + APK download
```

## Build

The project targets **JDK 17**, **AGP 8.7.3**, **Gradle 8.11.1**, **Kotlin 2.0.21**.

```bash
cd android-native
python3 ci/prepare.py          # writes local.properties + app/google-services.json
gradle :app:assembleRelease    # or :app:bundleRelease for the Play Store AAB
```

`ci/prepare.py` reads the public backend identifiers from `ci/backend-public.json`
and generates the local, git-ignored configuration files. Release signing reads
`GAGA_RELEASE_STORE_FILE`, `GAGA_RELEASE_STORE_PASSWORD`, `GAGA_RELEASE_KEY_ALIAS`
and `GAGA_RELEASE_KEY_PASSWORD` from Gradle properties or the environment; when
they are absent the build produces an unsigned artifact.

See [`android-native/README.md`](android-native/README.md) for the full
architecture, module map and engineering notes, and
[`android-native/CHANGELOG.md`](android-native/CHANGELOG.md) for release history.

## Website

`hosting/public/` is a static site deployed to **Firebase Hosting** (site
`oumagachat`, custom domain `gagachat.app`). It hosts the landing page, the
`/download` page, the App Links file (`/.well-known/assetlinks.json`) and the
`/downloads/gaga-latest.apk` redirect. Deploy with:

```bash
firebase deploy --only hosting --project oumagachat
```

The download redirects in `firebase.json` point at the current GitHub Release;
bump them together with the app version on every release.

## Backend

The Android app talks directly to Supabase (PostgREST + Realtime + Storage +
GoTrue) and to Firebase Cloud Messaging. The only custom server component is the
`livekit-token` edge function, which authenticates the caller, verifies call
membership, and mints a short-lived room-scoped LiveKit JWT so the LiveKit API
secret never ships inside the APK.
