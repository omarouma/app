# GaGa release signing identity — 2.7.8 onward

The owner explicitly authorized a new release key on 14 October 2026.

- Alias: `gaga`
- Algorithm: RSA 3072
- SHA-256: `dd6b6f166100e0db29a3f58af7439f5065c0148632d78ca5cd1d1a585a19af13`
- SHA-1: `cd2f9de5f1932c836d79573726e1033de44bedf9`
- Package: `gagachat.app`

APK/AAB signatures were verified. Firebase SHA-1 and SHA-256 registration is checked through the management API. Asset Links retains older fingerprints and adds the new certificate.

## Migration
Older APKs signed with different certificates cannot update in place. Back up local-only drafts, uninstall once and reinstall the new APK. Preserve this exact new keystore for all subsequent direct APK releases. Server-side account data is not deleted by an Android uninstall, but local-only data can be lost.

Google Play upload signing is separate: an already registered Play app requires the appropriate upload-key reset/Play App Signing process. Creating this key does not update the Play Console or replace the Play app-signing certificate.

## Private backup and CI
The keystore and generated passwords are supplied separately in the private signing backup. Never commit that backup, JKS or credentials to git.

Configure `GAGA_RELEASE_KEYSTORE_BASE64`, `GAGA_RELEASE_STORE_PASSWORD`, `GAGA_RELEASE_KEY_ALIAS` and `GAGA_RELEASE_KEY_PASSWORD` using `ci/configure_signing_secrets.py`. CI rejects any other certificate. GitHub secrets cannot be configured through the current connector's exposed tools; until installed, CI will produce unsigned artifacts. The separately delivered 2.7.8 APK/AAB are already signed locally.
