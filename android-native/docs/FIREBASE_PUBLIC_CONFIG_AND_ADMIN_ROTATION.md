# GaGa Firebase Android public configuration and Admin key rotation

## Verified identity (public)
- Firebase project ID: `oumagachat`
- Android package: `gagachat.app`
- Firebase Android App ID: `1:545448312835:android:d71f67bf2c8f96f4cd8e36`
- The approved GaGa release signing certificate SHA-1 is `cd2f9de5f1932c836d79573726e1033de44bedf9`. It matches an Android OAuth certificate in the Firebase console configuration supplied for this review.
- The generated public `google-services.json` preserves the Android OAuth certificate registrations, plus the Web client and the debug build package. All values are public mobile-app configuration; no Firebase Admin SDK credential belongs in this file.

## Action needed: exposed Admin SDK private key

A complete Admin SDK service-account private key was pasted in a chat. Treat the key as exposed. **Never copy that key or any replacement key into GitHub, a built APK/AAB, a CI artifact, a log, or another chat.**

1. In Google Cloud Console for `oumagachat`, go to **IAM & Admin → Service Accounts → the Firebase Admin service account → Keys**.
2. Arrange a secure rotation: create a new key in the authorized console; store it only in an approved secret store. Minimize the overlap between new and old keys.
3. Update the existing GaGa Supabase Edge Function secrets **`FIREBASE_PRIVATE_KEY`** (used by `firebase-token`) and **`FCM_PRIVATE_KEY`** (used by `send-fcm-push`). Their corresponding client-email and project-id settings must identify the active service account. If the new key belongs to the same account, email and project do not change.
4. Test an authorized Firebase custom-token mint/login and the authenticated FCM sender's **dry-run configuration check**, then test a real push on a consenting test device. Avoid logging tokens or credentials. Redeploy the functions if necessary to pick up revised secrets.
5. **Disable/delete the exposed private-key ID immediately after cutover**, or immediately if a safe cutover is not available. Inspect IAM key usage and Cloud Audit Logs for unexpected activity. Revoke any other unauthorized keys.
6. Lock down who can create new service-account keys; prefer workload identity or short-lived credentials rather than long-lived JSON keys for server use when supported.

GaGa's Supabase production project remains `fcjgbbmfqdkucfpqjxae`; this public Android configuration update does not change that database or touch existing users.

## Release gates
- Run `python3 android-native/ci/prepare.py` and both Firebase public-config tests.
- Run Android build/visual CI and confirm FCM registration after install.
- Keep 2.8.5 signed release candidate unchanged until rebuilt/approved; updating source creates a distinct candidate needing signing, verification and device QA.
- Firebase Hosting is a separate web deployment; configuring `google-services.json` does not deploy the native APK.
