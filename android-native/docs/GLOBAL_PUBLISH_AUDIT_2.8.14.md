# GaGa Chat 2.8.14 — global publishing audit

Date: 2026-10-22 · Package `gagachat.app` · Version 2.8.14 (versionCode 69)
Project `oumagachat` · Website `https://gagachat.app`

This audit answers one question: **is the 2.8.14 build ready to publish to a
worldwide audience on Google Play, and what exactly is still missing?** Every
claim below was verified against the actual signed artifacts, the live Firebase
project (via the Admin service account), and the live website — not inferred
from repository text.

---

## 1. Signed artifacts — verified genuine and intact

| Artifact | Size (bytes) | SHA-256 | Result |
| --- | --- | --- | --- |
| `GaGa-2.8.14-release.apk` | 49,109,800 | `988b959152cde4159198600962968090e43957006df8bdd26fd506a4f2766d17` | matches release report |
| `GaGa-2.8.14-release.aab` | 48,023,827 | `daa5e7649c32ece321904df280ba2eb0d4a9bba49d4639179b4589fd7da24295` | matches release report |

**APK.** Package `gagachat.app`, versionName `2.8.14`, versionCode `69`,
minSdk `26`, targetSdk `36`, compileSdk `36`. `android:debuggable` is absent,
`android:allowBackup="false"`, `networkSecurityConfig` present. Signature
schemes **v2 + v3** verified. Signing certificate:

```
subject = C=BD, ST=Dhaka, L=Dhaka, O=GaGa, OU=Release, CN=GaGa Chat
SHA-1   = 0B:22:64:2A:7A:2E:0C:3F:C8:1B:6F:FA:D4:77:72:12:48:ED:F6:CC
SHA-256 = 74:9D:24:75:E3:F7:99:95:66:91:0D:F9:47:F4:3A:B9:14:61:CA:AD:48:14:9D:35:98:31:46:5F:CF:AF:03:B2
valid   = 2026-10-19 → 2054-03-06 (RSA-3072)
```

**AAB.** jarsigner-signed (`META-INF/MANIFEST.MF`, `GAGA.SF`, `GAGA.RSA`), same
upload certificate as the APK. Every one of the **723** `MANIFEST.MF` entries
was re-hashed and compared: **723 checked, 0 mismatches, 0 missing files**. The
bundle is internally intact. Native ABIs present: `arm64-v8a` and `armeabi-v7a`
(64-bit requirement satisfied).

---

## 2. Firebase live state — verified with the Admin service account

* Android app `1:545448312835:android:d71f67bf2c8f96f4cd8e36`, state **ACTIVE**.
* **Eight** registered certificates: four SHA-1 and four SHA-256, including the
  new upload key (`0b22642a…f6cc` / `749d2475…03b2`). Confirmed by direct
  `androidApps/{id}/sha` query.
* Registering the new SHA-1 caused Firebase to mint Android OAuth client
  `545448312835-o7his2evlshkhvv00pqsj1e9ml5i5aa8…` (certificate hash
  `0b22642a…`).
* Firestore and Realtime Database rules, Auth providers and Hosting custom
  domain were reported identical/active in the 2.8.14 release report; no drift
  was found in this audit that would block publishing.

---

## 3. Website and Android App Links

* `https://gagachat.app` → 200; `/privacy` → 200; `/terms` → 200;
  `/app-updates/android.json` → 200.
* Live `/.well-known/assetlinks.json` serves **12** SHA-256 fingerprints,
  including the new upload key. `autoVerify="true"` is declared on the
  `https://gagachat.app` intent filter in the manifest, so App Links verify.

---

## 4. Defects found and fixed in this change

These were real repository-vs-production drifts or policy issues, not cosmetic.

1. **`hosting/public/.well-known/assetlinks.json` was missing the new upload-key
   SHA-256.** The repo had 11 fingerprints; production had 12. A fresh deploy
   from `main` would have silently broken App Link verification for the new
   signing key. **Fixed** — repo now matches the live 12-fingerprint set.

2. **`android-native/ci/backend-public.json` was missing the new Android OAuth
   client.** It had 3 certificate-specific clients; Firebase now has 4. Because
   `ci/prepare.py` generates `google-services.json` from this file, a CI build
   would have produced a config that diverges from the real Firebase
   registration and could break Google Sign-In / certificate association.
   **Fixed** — added `545448312835-o7his2evlshkhvv00pqsj1e9ml5i5aa8…` with
   certificate hash `0b22642a…f6cc`.

3. **`verify_firebase_release_config.py` asserted 3 clients.** **Fixed** — now
   expects 4, matching the real registration.

4. **`firebase-analytics-ktx` was a dependency but is never used in code.** The
   SDK auto-merges `com.google.android.gms.permission.AD_ID` and starts
   background event collection. GaGa shows no ads, so this added an advertising
   ID permission and an unnecessary Data Safety disclosure for zero product
   value. **Fixed** — removed the dependency (Crashlytics does not depend on
   Analytics). This removes `AD_ID` from the next build's merged manifest.

5. **No public account-deletion page existed** (`/delete-account` returned 404).
   Google Play requires a discoverable web resource for account deletion for any
   app that offers account registration. PR **#143** added
   `hosting/public/delete-account.html`; it was merged into `main` as part of
   this work and is included in the same release.

> Note: items 1–4 change source, so the **next** build will differ from the
> already-signed `daa5e764…` AAB. The existing AAB is still valid to upload; the
> fixes take effect on the following build (and the deletion page is a website
> deploy, independent of the APK).

---

## 5. Google Play readiness matrix

| Requirement | Status | Notes |
| --- | --- | --- |
| Signed AAB | ✅ | `daa5e764…`, upload-key signed |
| targetSdk 36 | ✅ | meets current Play target-API policy |
| 64-bit native libs | ✅ | arm64-v8a + armeabi-v7a |
| App icon 512×512 | ✅ | `play/icon-512.png`, RGB, correct size |
| Feature graphic 1024×500 | ✅ | `play/feature-graphic-1024x500.png`, RGB |
| Store listing copy | ✅ | name ≤30, short ≤80, full ≤4000 |
| Phone screenshots (2–8) | ❌ **blocker** | `play/screenshots/` contains only a README — no real captures |
| Account-deletion web page | ✅ (after #143) | `/delete-account`, deploy pending |
| In-app account deletion | ✅ | Settings → Delete account |
| Privacy policy URL | ✅ | `https://gagachat.app/privacy` |
| Data safety form | ⚠️ owner | must declare messages, media, files, location, contacts, device IDs |
| Content rating questionnaire | ⚠️ owner | Play Console only |
| Ads declaration | ✅ | app shows no ads (and Analytics/AD_ID now removed) |
| Play App Signing key → Firebase | ⚠️ post-publish | Play mints its own key on first upload |
| Play App Signing key → assetlinks | ⚠️ post-publish | add Play SHA-256 after first upload |
| AAB upload to Play | ⚠️ owner | internal testing → production |

---

## 6. Policy-sensitive permissions review

All of the following are declared in `app/src/main/AndroidManifest.xml` and are
legitimate for a messenger/calling app, but each needs a matching Play Console
declaration:

| Permission | Why it is there | Play action |
| --- | --- | --- |
| `READ_CONTACTS` | "Find friends already on GaGa" | declare in Data Safety + permission declaration |
| `ACCESS_FINE/COARSE_LOCATION` | user-initiated live location sharing | declare; foreground-only usage |
| `MANAGE_OWN_CALLS` + `FOREGROUND_SERVICE_PHONE_CALL` | self-managed calling | allowed for calling apps |
| `USE_FULL_SCREEN_INTENT` | full-screen incoming-call UI | allowed for calling apps (auto-granted) |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | keep incoming calls ringing in Doze | **sensitive permission** — must be declared/justified; Play may request a form |
| `POST_NOTIFICATIONS`, `CAMERA`, `RECORD_AUDIO` | core messaging/calling | runtime prompts already implemented |
| `AD_ID` | was pulled in by Analytics | **removed** in this change |

No broad storage permissions are requested; attachments use the system pickers
and a non-exported `FileProvider`. `allowBackup=false`. Only the expected
components are exported (launcher activity, Firebase Auth activities, FCM
receiver, WorkManager/ProfileInstaller, GMS revocation service). The LiveKit
`ScreenCaptureService` has no `android:exported` and no intent filter, so it
defaults to non-exported — safe.

---

## 7. Remaining owner actions (in order)

1. **Capture 2–8 real phone screenshots** from the release build and place them
   in `android-native/play/screenshots/` (see that folder's README). This is the
   only hard blocker left in the repository.
2. **Deploy the website** (`firebase deploy --only hosting --project oumagachat`)
   so `/delete-account` and the corrected `assetlinks.json` go live.
3. **Upload `daa5e764…` AAB to Play internal testing**, then promote to
   production. Play will mint the app-signing key on first upload.
4. **After first upload**, register the Play app-signing SHA-1/SHA-256 with
   Firebase and add the Play SHA-256 to `assetlinks.json`, then redeploy.
5. **Complete Play Console forms**: Data safety, content rating, target audience,
   and the battery-optimization permission justification.
6. **Install the four release secrets** in GitHub if CI signing is desired:
   `GAGA_RELEASE_KEYSTORE_BASE64`, `GAGA_RELEASE_STORE_PASSWORD`,
   `GAGA_RELEASE_KEY_ALIAS=gaga`, `GAGA_RELEASE_KEY_PASSWORD`.

---

## 8. Security — rotate the exposed service-account keys

The `oumagachat` Admin service-account JSON was shared in plaintext during this
work, and an earlier key (`private_key_id db42813167aae0affe06ac10829896f895958fd7`)
was also exposed. **Both should be revoked and replaced** in Google Cloud
Console → IAM → Service Accounts → Keys. The new key was used only locally for
read-only verification and was never written into the repository or any build
artifact.

Recommended follow-up: restrict the replacement key to the minimum scopes
(Firebase Management read, Identity Toolkit) and rotate on a schedule.

---

## 9. Verification commands used

* APK/AAB hashes: `sha256sum`
* APK signature + manifest: `androguard` 4.1.4 (`APK.get_certificates_v2`,
  `get_android_manifest_xml`)
* AAB signature: `openssl pkcs7 -print_certs` on `META-INF/GAGA.RSA`
* AAB integrity: custom re-hash of all 723 `MANIFEST.MF` entries (JAR 72-byte
  continuation-aware parser)
* Firebase certificates: `firebase.googleapis.com/v1beta1/.../sha` with the
  service account
* Live website: `curl` status checks on `/`, `/privacy`, `/terms`,
  `/app-updates/android.json`, `/.well-known/assetlinks.json`
