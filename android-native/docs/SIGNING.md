# GaGa Android release signing

## Current release identity (2.7.7+)

The GaGa 2.7.7 re-release is signed with a **new** release certificate because the original
keystore (used for the earlier 2.7.6 download) was not available.

| Property | Value |
| --- | --- |
| Distinguished name | `CN=GaGa Chat, OU=Mobile, O=GaGa, L=Dhaka, ST=Dhaka, C=BD` |
| Key algorithm | RSA 2048 |
| Certificate SHA-256 | `19a68b9615bef4967a5ad0b1f32ddb91910014052fea5b8fd353d44a065b88f8` |
| Certificate SHA-1 | `7d84940a3b72aa3804da3e1cd7b19ae7d4660984` |
| Signature schemes | APK Signature Scheme v2 + v3 |

The keystore file (`gaga-release.jks`), its store/key passwords and alias are delivered with the
release. **Store them in a secure secret manager. Never commit them to git.**

### Compatibility note
Android refuses to install an update whose signature differs from the installed app. Because this
is a new key, users on older GaGa builds must **uninstall once and reinstall** 2.7.7. After that,
in-place updates work normally.

## Approved identities in CI

`.github/workflows/android-repair.yml` signs a release only when the configured keystore's
certificate matches one of the approved identities:

- `bd95b298a3e64314f3135579c3b827e982c033556472693a59472dc8ebf6c89a` — original GaGa 2.7.2 key
- `19a68b9615bef4967a5ad0b1f32ddb91910014052fea5b8fd353d44a065b88f8` — GaGa 2.7.7 key (current)

If no keystore is configured, CI produces **unsigned** artifacts plus a `SIGNING-REQUIRED.txt`
marker and the strict production gate refuses to certify them.

## Enabling signed CI releases

Set these four repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `GAGA_RELEASE_KEYSTORE_BASE64` | `base64 -w0 gaga-release.jks` |
| `GAGA_RELEASE_STORE_PASSWORD` | keystore store password |
| `GAGA_RELEASE_KEY_ALIAS` | `gaga-release` |
| `GAGA_RELEASE_KEY_PASSWORD` | key password |

Then run the **GaGa Android repair validation** workflow with `production_release = true`
(or push an `android-*` tag) to produce a signed `GaGa-<version>-release.apk` and `.aab`.

## Firebase / App Links

The release certificate fingerprints are registered in:

- Firebase → Project settings → Android app `gagachat.app` → SHA certificate fingerprints
- `hosting/public/.well-known/assetlinks.json` (served at `https://gagachat.app/.well-known/assetlinks.json`)
