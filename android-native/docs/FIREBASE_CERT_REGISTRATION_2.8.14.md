# GaGa Firebase project repair — 2.8.14 (new Play upload key)

Project: `oumagachat` (number 545448312835)
Android app: `gagachat.app` — Firebase app id `1:545448312835:android:d71f67bf2c8f96f4cd8e36`
Performed: 2026-10-19, using the project's Firebase Admin service account.

This records the Firebase-side changes made when the release signing identity
moved to the fresh Play upload key, plus a read-only audit of the rest of the
Firebase configuration.

## 1. Release certificate registration (write)

The Firebase Android app previously carried six certificates, none of which was
the new upload key. The following were **added** via the Firebase Management API
(`projects/oumagachat/androidApps/{appId}/sha`):

| Type | Value |
| --- | --- |
| SHA-1 | `0b22642a7a2e0c3fc81b6ffad477721248edf6cc` |
| SHA-256 | `749d2475e3f7999566910df947f43ab91461caad48149d359831465fcfaf03b2` |

The Android app now carries eight certificates (four SHA-1, four SHA-256),
including the retired direct-APK key (`cd2f9de5…` / `dd6b6f16…`) which is kept
for reference.

### New OAuth client

Registering the SHA-1 caused Firebase to mint a new Android OAuth client:

- `545448312835-o7his2evlshkhvv00pqsj1e9ml5i5aa8.apps.googleusercontent.com`
  (certificate hash `0b22642a7a2e0c3fc81b6ffad477721248edf6cc`)

`ci/backend-public.json` was updated to include it, so the CI-generated
`app/google-services.json` faithfully mirrors the Firebase registration. The
count assertion in `ci/verify_firebase_release_config.py` was updated from three
to four clients. The app uses **email/password auth only** (no Google Sign-In),
so the new client is inert until Google Sign-In is enabled.

### App Links

`hosting/public/.well-known/assetlinks.json` gained the new upload-key SHA-256
(`74:9D:24:75:…:03:B2`) so Android App Links verify for direct-APK installs.

> When the app is published to Google Play, also register the **Play
> app-signing key's** SHA-1/SHA-256 with Firebase and add its SHA-256 to
> `assetlinks.json`. Play re-signs the delivered app with its own key, so that
> fingerprint — not the upload key — is what end users' devices see.

## 2. Read-only audit (no changes needed)

| Area | Result |
| --- | --- |
| Firestore rules | Live ruleset identical to `firestore.rules` |
| Realtime Database rules | Live rules identical to `database.rules.json` |
| Firebase Auth | Email/password provider **enabled**; phone enabled; email templates set |
| Hosting | Site `oumagachat`; custom domain `gagachat.app` `DOMAIN_ACTIVE` (cert active) |
| Firebase Storage | Not used by the app (media lives in Supabase Storage); storage ruleset present but unreleased — acceptable |
| Web app | `1:545448312835:web:9f2a1700e24924f5cd8e36` (GaGa) |

## 3. Website deployment

The website (`hosting/public`, 29 files) was deployed to Firebase Hosting
(`firebase deploy --only hosting --project oumagachat`), publishing the updated
`assetlinks.json`. The live site (`https://gagachat.app`) serves 12 SHA-256
fingerprints including the new key.

## 4. Remaining owner action

Rotate the exposed Admin SDK service-account key
(`private_key_id db42813167aae0affe06ac10829896f895958fd7`) once the Supabase
Edge Function secrets (`FIREBASE_PRIVATE_KEY`, `FCM_PRIVATE_KEY`) point at the
replacement — see `FIREBASE_PUBLIC_CONFIG_AND_ADMIN_ROTATION.md`.
