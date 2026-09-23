# Current GaGa APK rebuild review

Baseline: feat/attachment-share-screen at f8a8a87bfeda01afe791529ff29fd0d53f061dba.
The recorded APK SHA-256 exactly matches uploaded APK (10):
5d1357827a287cc7972552f1afa224faafa6ee916644aa33d9a9d27104ce2bed.

## Verified findings
- BUILD_INFO.md explicitly records a regenerated release keystore. Matching certificate names do not make different signing keys compatible. This can explain update-install failure, but the affected phone's installer failure code is still required to confirm its cause.
- The current package is gagachat.app, versionCode 1, minSdk 22. Android 9-12 are not excluded by minSdk.
- android/app/build.gradle previously allowed an unsigned release when keystore.properties was absent.
- The auth event callback awaited profile database requests inside the Supabase auth callback.
- GitHub Actions run 35147449874 passed frontend lint, typecheck, tests and web build but failed Firebase deployment: "Input required and not supplied: firebaseServiceAccount".
- The inherited deploy workflow hardcodes the older alzwgikndwbecuqmlrca Supabase token endpoint and a fallback Zego app ID. Current APK build record instead names fcjgbbmfqdkucfpqjxae and Zego 372536818.
- This branch had no current Capacitor Android build workflow. Successful older Android runs belong to a different native branch and do not validate this APK.
- adminoumaga-cyber/GaGa main contains only README.md.

## Changes in this branch
- Defer profile fetches outside the auth callback; suppress stale results after later auth events or unsubscribe.
- Add three auth lifecycle regression tests.
- Increment Android release version to 1.0.1 / versionCode 2.
- Fail release builds if signing configuration or keystore is missing. Never generate a replacement key.
- Add an isolated Android workflow that checks types/tests, required configuration, actual Supabase/Firebase project IDs and the APK (10) signer fingerprint before release compilation. It verifies the resulting APK signature/package and publishes signed APK/AAB artifacts only after success.
- No production Firebase/Supabase deployment or database mutation is performed.

## Secure build requirements
Restore the existing APK (10) signer through repository Actions secrets:
ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD.
Expected signer SHA-256:
5DDBD01631AA1861AB308EFFB3A12856664F0A55D8EDC21F75D90BF03F35F4A2.

The workflow also validates required VITE_SUPABASE_* and VITE_FIREBASE_* secrets.
Do not paste private keys/passwords into chat or commit them to git.
A service-account credential is needed to repair the separate Firebase Hosting deployment, but hosting is not required for this Android-only workflow.

## Remaining validation
The current local execution environment is unavailable. Check this branch's Actions result for actual test/build status; source changes are not evidence of a successful build.
Supabase connection is requested but not yet confirmed. Live RLS, migrations, storage, realtime, token functions and logs remain unverified. Firebase console/IAM and deployed configuration have not been inspected directly.
The exact affected base.apk and device install failure code remain useful to distinguish signer mismatch, version downgrade, missing split and device storage/package problems.

The existing profile timeout can still route to auth when no cached profile exists despite a session; this patch addresses callback locking/races, not all session UX.
Offline ID/replay bugs and unsafe missing-column fallbacks identified in the earlier review remain to be ported and validated in source. Device tests on Android 9/10/11/12 and two-phone real messaging/calls remain mandatory before declaring release readiness.
