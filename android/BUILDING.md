# GaGaChat Android v3.1.17

Requirements: JDK 17, Android SDK Platform 36, Android Build Tools 35.0.0 or
newer, and Gradle 8.11.1. The checked-in wrapper pins the official Gradle archive
checksum.

## QA build

```bash
./gradlew clean lintQa assembleQa
```

The QA APK is for controlled testing only. It uses Android's debug signing key,
the Alibaba endpoint, and package id `gagachat.app` so it matches the registered
Firebase Android client. Uninstall a differently signed build with the same
package before installing QA.

## Production release

Create a new Play upload key outside this repository and expose it only through
your CI secret store:

```bash
export GAGA_SIGNING_STORE_FILE=/secure/path/gagachat-upload.jks
export GAGA_SIGNING_STORE_PASSWORD='...'
export GAGA_SIGNING_KEY_ALIAS='...'
export GAGA_SIGNING_KEY_PASSWORD='...'
export GAGA_REQUIRE_RELEASE_SIGNING=true
./gradlew clean lintRelease bundleRelease
```

Never commit a keystore or password. Release builds lock the API endpoint to
`https://api.gagachat.app/api`. Wallet and OTP remain disabled until their
production providers and compliance controls are ready. Rate-limited
username/password registration is enabled; accounts remain unverified until a
real OTP provider is connected.

## CI artifacts

`.github/workflows/android-build.yml` always produces controlled-testing QA
APKs. A manually approved production run also produces signed release APKs and
an AAB when the four `GAGA_*` signing secrets are configured. The workflow
verifies the package, version code and APK signature, then publishes a
`SHA256SUMS.txt` file with every artifact.
