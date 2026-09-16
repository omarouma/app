# Native Android backend and Hosting boundary

This audit applies to the `gagachat-native-3.1.17` branch. It separates what the QA APK contains from whether cloud services have actually been deployed.

| Component | Intended role | Evidence and current limit |
| --- | --- | --- |
| Native Android QA/release | Calls `https://api.gagachat.app/api` for account, chat, media and calls | `app/build.gradle.kts` pins the API URL and disables server overrides for QA and release. CI inspects the built QA APK's DEX for this URL and checks that Supabase/PostgREST/GoTrue are absent. An endpoint URL alone does not prove its DNS points to Alibaba Cloud. |
| Firebase Android (`oumagachat`) | FCM notification token and push reception | `google-services.json` registers Android package `gagachat.app`; Gradle includes Firebase Messaging. The app does not include Firebase Auth, Realtime Database, Firestore or Storage client SDKs. |
| Alibaba backend package | API with RDS, Redis, OSS, TURN and FCM push adapter | The supplied `GaGaChat-3.1.17-production-source.zip` has production-mode checks for RDS, Redis, OSS and Firebase push credentials. It is a source/deploy package, not evidence of a running ECS service. |
| Firebase Hosting | Android information page | `firebase.json` now serves `android/hosting` with no Vite bundle or Supabase client. The root Vite source still contains a legacy Supabase web app but is outside the Android build and Hosting deploy path. A live site remains on its last published version until this Hosting configuration is deployed. |

`gagachat-backend-verify.yml` checks the public API from a GitHub runner. A passing DNS, HTTPS, health and readiness run establishes that an endpoint responds; proving its compute is in the user's Alibaba account additionally requires ECS/DNS evidence and runtime logs from that account. Do not enable registration as a production service based only on APK compilation.
