# GaGa approved-key signed candidate workflow

Workflow: `.github/workflows/build-signed-candidate.yml`.

## Safety and eligibility

This is a **manual GitHub Actions workflow**. It does not publish a GitHub release,
upload to Google Play, change Supabase Storage, or edit the live app-update manifest.
Never paste or commit a keystore or its passwords to this repository.

A repository administrator must configure these **GitHub Actions encrypted secrets**
with the existing approved GaGa key (NOT a newly generated or arbitrary key):

- `GAGA_RELEASE_KEYSTORE_BASE64` — base64 of the existing keystore file
- `GAGA_RELEASE_STORE_PASSWORD` — keystore password
- `GAGA_RELEASE_KEY_PASSWORD` — alias `gaga` password

The workflow checks the SHA-256 certificate against
`android-native/ci/release-signing-public.json` **before compiling**.
If it is missing or mismatched, signing stops. If it succeeds, both APK and AAB
certificates, package id (`gagachat.app`), embedded version, and checksums are
checked before a private 7-day GitHub Actions artifact is uploaded.

## Run

GitHub → Actions → **Build approved signed GaGa candidate** → **Run workflow**
on `main`, after the standard Android repair test run is green.

The artifact is a **signed candidate**, not automatic deployment permission.
Test upgrades against the already-installed signing identity (without risking
loss of user data), then validate on two physical Android accounts/devices,
compare Play App Signing/upload fingerprints, review privacy and Data Safety,
and only then approve internal testing and staged rollout.

## Out of scope

No keystore recovery, secret installation, database mutations, or public rollout
is performed by adding this workflow. The prior signed 2.8.3 release remains
available until a separately approved version replaces it.
