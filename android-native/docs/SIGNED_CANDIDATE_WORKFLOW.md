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

> **Pin history.** The file was originally pinned to `dd6b6f16…`, a certificate
> that was never present in CI (all four `GAGA_RELEASE_*` secrets are empty, so
> no CI-signed artifact has ever existed). Since 2.8.15 the shipped APK/AAB is
> signed with `a51b9841…` (alias `gaga`, RSA 3072, valid to 2054), and the pin
> now matches it. Rotating this file is a release-identity decision: change it
> only together with a real keystore rotation, and never to make a failing
> verification pass.
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
