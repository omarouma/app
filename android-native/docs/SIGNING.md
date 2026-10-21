# GaGa release signing identity

Package: `gagachat.app` · Alias: `gaga` · Algorithm: RSA 3072

There are **two** signing identities in GaGa's history. The **current** one is the
Play **upload key** (2.8.14 onward); the previous direct-APK key (2.7.8–2.8.13) is
retained below for reference.

---

## Current identity — Play upload key (2.8.14 onward)

Authorized 2026-10-19 for the first Google Play release. `gagachat.app` was **not
yet published on Play** (HTTP 404), so there was no existing Play App Signing
identity to conflict with and a fresh upload key was viable. The app uses
email/password auth only (no Google Sign-In), so the signing SHA-1 does not gate
authentication and the new key breaks no feature.

- Alias: `gaga`
- Algorithm: RSA 3072
- SHA-256: `749d2475e3f7999566910df947f43ab91461caad48149d359831465fcfaf03b2`
- SHA-1: `0b22642a7a2e0c3fc81b6ffad477721248edf6cc`
- Package: `gagachat.app`
- Certificate DN: `CN=GaGa Chat, OU=Release, O=GaGa, L=Dhaka, ST=Dhaka, C=BD`
- Valid: 2026-10-19 → 2054-03-06

This is the identity pinned in
[`ci/release-signing-public.json`](../ci/release-signing-public.json). CI verifies
the configured keystore against this pin **before** compiling and rejects any
other certificate.

### Google Play App Signing

The upload key signs the AAB you upload; **Play re-signs** the delivered app with
its own app-signing key, generated on first upload. Keep the upload key safe — a
future upload-key reset requires a support request. The app-signing key is managed
by Play and is separate from this upload key.

### CI secrets

Install these four GitHub Actions encrypted secrets (see
[`ci/configure_signing_secrets.py`](../ci/configure_signing_secrets.py)):

- `GAGA_RELEASE_KEYSTORE_BASE64` — base64 of `gaga-upload.jks`
- `GAGA_RELEASE_STORE_PASSWORD` — keystore password
- `GAGA_RELEASE_KEY_ALIAS` — `gaga`
- `GAGA_RELEASE_KEY_PASSWORD` — alias password

Until they are installed, CI produces unsigned artifacts (it writes
`SIGNING-REQUIRED.txt`). The signed 2.8.14 APK/AAB are delivered separately and
verified against the pin above.

---

## Previous identity — direct-APK release key (2.7.8 – 2.8.13)

Owner-authorized on 14 October 2026 for direct (non-Play) APK distribution. Still
the identity of the historical GitHub Releases (`android-2.7.8` … `android-2.8.13`).

- Alias: `gaga`
- Algorithm: RSA 3072
- SHA-256: `dd6b6f166100e0db29a3f58af7439f5065c0148632d78ca5cd1d1a585a19af13`
- SHA-1: `cd2f9de5f1932c836d79573726e1033de44bedf9`

APKs signed with this key cannot update in place onto an APK signed with the new
upload key (and vice-versa). Because the app is not on Play, this only affects
sideloaded APKs: back up local-only drafts, uninstall once, and reinstall.

---

## Private backup

Keystores and passwords are supplied separately in the private signing backup.
Never commit a `.jks` file or its credentials to git. The `gaga-upload.jks` for
the current identity ships with the 2.8.14 signed release bundle.

## Firebase / Google services

The Firebase Android app (`oumagachat`) has registered SHA-1/SHA-256 cert hashes
in [`ci/backend-public.json`](../ci/backend-public.json). Those are used by Google
services (FCM, Play Integrity, OAuth clients) and are independent of the release
signing pin. If Google Sign-In is ever added, register the current upload-key
SHA-1 (`0b22642a…`) and the Play app-signing SHA-1 with the Firebase project.
