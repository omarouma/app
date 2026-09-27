# GaGa Chat — Native Android (Kotlin + Jetpack Compose)

This repository is the **native Android rebuild** of GaGa Chat, implemented to the
*GaGa Chat — Professional Android Rebuild Blueprint*. It replaces the previous
Capacitor WebView wrapper with a local-first, real-time native client that keeps
the existing GaGa branding and the existing Supabase/Firebase backend.

> **Why the rebuild?** The shipped APK was a Capacitor WebView shell
> (`appId gagachat.app`, `webDir dist`). Every screen paid the cost of a WebView
> boot, a JS bundle parse and a network round-trip before it could paint. The
> blueprint's goal is GaGa-Wallet-grade smoothness: instant startup, instant
> screen rendering, smooth scrolling, predictable state and a professional native
> feel — while still using the real backend for users, messages, media, presence,
> notifications and calls.

---

## The formula (PDF §16)

```
native smoothness
  + existing GaGa branding/UI direction
  + local-first Room cache
  + real Supabase/Firebase backend
  + realtime delta synchronization
  + optimistic / idempotent messaging
  + paginated chat history
  + optimized media pipeline
  + persistent authentication
  + WebRTC calling
  + Baseline Profile + release optimization
  = fast, smooth, real-data GaGa Chat for Android
```

---

## Architecture at a glance (PDF §2)

```
Presentation (Compose)  →  ViewModels / UI State / Navigation
        │
Domain (use cases / business rules)
        │
Repository layer
   ├── Local data source   (Room / DataStore / EncryptedSharedPreferences)
   └── Remote data source  (Supabase REST + Realtime + Storage, Firebase push)
        │
Sync + conflict policy (outbox, idempotency, cursors)
        │
Push / WebRTC / Media storage
```

**Core rule:** the UI always renders from local state. The remote backend
synchronizes in the background. The backend is the authoritative source; the local
database is a fast cache and an offline/outbox layer.

---

## Modules (PDF §2.1, §13)

| Module | Responsibility |
| --- | --- |
| `:app` | Application entry, Hilt wiring, navigation host, push, deep links |
| `:core:common` | Result/error types, dispatchers, constants, logging, time/ids |
| `:core:model` | Pure Kotlin domain models (User, Conversation, Message, Call, …) |
| `:core:database` | Room entities, DAOs, database, mappers |
| `:core:network` | Supabase REST/Realtime/Storage, auth, DTOs, error mapping |
| `:core:data` | Repository contracts + local-first implementations, sync policy |
| `:core:ui` | Theme, typography, reusable Compose components |
| `:feature:auth` | Login, register, OTP, session bootstrap |
| `:feature:home` | Conversation list / home |
| `:feature:chat` | Chat room, composer, attachments, message state |
| `:feature:contacts` | Contacts + search |
| `:feature:calls` | Voice/video call UI + call history |
| `:feature:profile` | Profile / account |
| `:feature:settings` | Settings / privacy / notifications |
| `:sync:outbox` | Outbox scheduling contract + work keys |
| `:sync:workers` | WorkManager workers + scheduler implementation |
| `:benchmark` | Macrobenchmarks (startup, scroll) |
| `:baselineprofile` | Baseline Profile generator |

Build logic lives in `build-logic/` as convention plugins, and all versions are
centralized in `gradle/libs.versions.toml`.

---

## Tech stack

Kotlin 2.0.21 · Jetpack Compose (BOM 2024.12.01) · Material 3 · Hilt 2.52 ·
Room 2.6.1 · Ktor 3.0.3 · Supabase (PostgREST + Realtime + Storage + GoTrue) ·
Firebase (Messaging/Analytics/Crashlytics) · Coil 2.7.0 · WorkManager 2.10.0 ·
DataStore · EncryptedSharedPreferences · Baseline Profiles · Macrobenchmark.
AGP 8.7.3 · KSP 2.0.21-1.0.28 · Gradle 8.11.1 · minSdk 24 · targetSdk 35.

---

## Getting started

1. **Configure secrets** — copy `local.properties.example` to `local.properties`
   and fill in `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_STORAGE_BUCKET`.
   (The anon key is a public client key; the service_role key must never ship.)
2. **Firebase (optional)** — drop a real `google-services.json` into `app/` and
   uncomment the `google-services` plugin in `app/build.gradle.kts`. Push is
   disabled until then; the rest of the app works without it.
3. **Build** — `./gradlew :app:assembleDebug`.
4. **Baseline Profile** — `./gradlew :app:generateReleaseBaselineProfile`.
5. **Benchmarks** — `./gradlew :benchmark:connectedBenchmarkAndroidTest`.

> This environment has no Android SDK/JDK installed, so the project is delivered
> as complete, build-ready source. See `docs/RELEASE.md` for the full build and
> signing checklist.

---

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — layers, data flow, sync policy
- [`docs/SECURITY.md`](docs/SECURITY.md) — session storage, RLS, permissions, abuse checks
- [`docs/MIGRATION.md`](docs/MIGRATION.md) — Capacitor → native migration notes
- [`docs/RELEASE.md`](docs/RELEASE.md) — signing, Play tracks, monitoring, rollout

---

## Definition of Done (PDF §14)

- Install → Auth → account create/login → Home works with real backend data.
- Second launch → no landing/login when the session is valid → Home directly.
- Home cached conversation list opens without a blocking network loader.
- Chat opens cached recent messages quickly and syncs new messages in background.
- One send tap creates exactly one message.
- Text/photo/video/file/location/audio send has pending/sent/failed states.
- Message delivery/read state updates correctly.
- Own/other profile photos render correctly in chat.
- Call start/receive/end works and the call event appears in history.
- Contacts, profile and settings do not refetch entire datasets unnecessarily.
- Different Android versions/display sizes pass compatibility testing.
- Release build is signed, optimized, crash/ANR checked and backend rules validated.
