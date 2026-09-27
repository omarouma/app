# GaGa Chat — Release Guide

This document covers Phase 11 of the rebuild blueprint: producing a signed,
optimized AAB/APK, running Play testing tracks, monitoring, and staged rollout.

---

## 1. Build variants

| Variant | applicationId | Minify | Signing | Purpose |
| --- | --- | --- | --- | --- |
| `debug` | `gagachat.app.debug` | No | Debug key | Local development |
| `release` | `gagachat.app` | R8 + resource shrink | Release keystore | Play / distribution |

The debug variant carries an `.debug` suffix so it can be installed alongside a
production build on the same device.

---

## 2. Signing configuration

The release signing config is defined in `app/build.gradle.kts` and reads its
values from Gradle properties or environment variables — **never from the
repo**:

```
GAGA_RELEASE_STORE_FILE      # absolute path to the .jks
GAGA_RELEASE_STORE_PASSWORD
GAGA_RELEASE_KEY_ALIAS
GAGA_RELEASE_KEY_PASSWORD
```

If these are absent, the release build is produced **unsigned** (handy for CI
dry runs and for Play App Signing, where Google holds the upload key's
counterpart). For local signed builds, put them in `local.properties`
(git-ignored); for CI, inject them as secrets.

> **Security:** the keystore and its passwords live in a secure CI/release
> process (PDF §11). They are never committed, never printed to logs, and never
> bundled into the artifact.

### Generating a keystore (first time only)

```bash
keytool -genkeypair -v \
  -keystore gaga-release.jks \
  -alias gaga \
  -keyalg RSA -keysize 4096 -validity 10000
```

Store the resulting `.jks` in your secret manager, not in the repository.

---

## 3. Producing release artifacts

```bash
# Android App Bundle (preferred for Play)
./gradlew :app:bundleRelease

# Universal APK (for direct distribution / QA)
./gradlew :app:assembleRelease
```

Outputs:

- `app/build/outputs/bundle/release/app-release.aab`
- `app/build/outputs/apk/release/app-release.apk`

### Pre-build configuration

1. Copy `local.properties.example` → `local.properties` and fill in
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_STORAGE_BUCKET`.
2. Add `google-services.json` (not committed) to `app/` and uncomment the
   `google-services` plugin in `app/build.gradle.kts` to enable FCM.
3. Provide the signing properties (above) for a signed build.

---

## 4. Baseline Profile & performance

The `:baselineprofile` module generates a Baseline Profile that is consumed by
the release build, and `:benchmark` measures startup and scroll performance.

```bash
# Generate the Baseline Profile (requires a connected device/emulator)
./gradlew :baselineprofile:pixel6Api34BenchmarkAndroidTest

# Run startup + scroll macrobenchmarks
./gradlew :benchmark:pixel6Api34BenchmarkAndroidTest
```

The profile is packaged into the release artifact via
`androidx.profileinstaller`, improving cold start and first-scroll jank on
device. **Never judge performance from a debug build** (PDF §15).

---

## 5. Play Console testing tracks

Promote the AAB through the standard tracks:

1. **Internal testing** — fast iteration, up to 100 testers. Validate auth,
   home, chat, media, calls, and push against the live backend.
2. **Closed testing (alpha/beta)** — a small external cohort. Collect
   Crashlytics and Play vitals.
3. **Open testing** — optional wider beta.
4. **Production** — staged rollout (see §7).

### Store listing essentials

- App name: **GaGa**
- Package: `gagachat.app`
- Category: Communication
- Data safety form: declare message content, media, contacts, location, and
  device identifiers; state that data is encrypted in transit and that tokens
  are stored encrypted on-device.
- Content rating questionnaire.
- Privacy policy URL.

---

## 6. Monitoring

- **Crashlytics** — crash-free sessions and non-fatals. Target ≥ 99.5%
  crash-free before widening rollout.
- **Play vitals** — ANR rate (< 0.47%) and startup time.
- **Analytics** — funnel from install → auth → first message; retention.
- **Supabase logs** — PostgREST error rates, Realtime connection churn, Storage
  upload failures.
- **Alerts** — page on crash-free regression, ANR spike, or auth failure spike.

---

## 7. Staged rollout

Roll out production in stages, gating each step on health metrics:

| Stage | Rollout | Gate to proceed |
| --- | --- | --- |
| 1 | 5% | Crash-free ≥ 99.5%, ANR < 0.47%, no auth regressions |
| 2 | 20% | Metrics hold for 24–48h |
| 3 | 50% | Metrics hold; no P1 support tickets |
| 4 | 100% | Stable |

If a gate fails, **halt the rollout** (Play supports halting without removing
the release) and ship a fix. Because the backend is shared and messaging is
idempotent, a halted client rollout never corrupts server data.

---

## 8. Release checklist

- [ ] Version bumped (`versionCode` / `versionName` in `app/build.gradle.kts`).
- [ ] `local.properties` populated; `google-services.json` present.
- [ ] Signing properties provided; keystore stored securely.
- [ ] `./gradlew :app:bundleRelease` succeeds.
- [ ] Baseline Profile generated and packaged.
- [ ] Macrobenchmarks within budget on a low-end reference device.
- [ ] Security checklist (`docs/SECURITY.md` §11) fully green.
- [ ] Definition of Done (`docs/MIGRATION.md` §8) verified end-to-end.
- [ ] AAB uploaded to Internal testing; smoke-tested.
- [ ] Data safety form and store listing complete.
- [ ] Monitoring dashboards and alerts live.
- [ ] Staged rollout plan agreed.

---

## 9. Versioning policy

- `versionCode` is a monotonically increasing integer; bump on every Play
  upload.
- `versionName` follows semantic versioning (`MAJOR.MINOR.PATCH`).
- The native rebuild starts at `1.0.0` (versionCode 1) as a fresh artifact,
  independent of the legacy WebView build's versioning.
