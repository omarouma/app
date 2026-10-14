# GaGa 2.7.9 — new-key signed release

Package gagachat.app; versionCode 54. Android compilation/regression tests passed for d1c9210afa803ff4566ee3676d96d1fedb8475d5. Signed APK/AAB use the user-authorized RSA 3072 key, alias gaga, certificate SHA-256 dd6b6f166100e0db29a3f58af7439f5065c0148632d78ca5cd1d1a585a19af13.

Firebase SHA-1/SHA-256 registrations were verified. Asset Links adds this certificate while retaining older certificates. Release metadata pins APK SHA-256 and byte size. Supabase release storage allows public binary downloads but no client writes; the temporary authenticated upload endpoint is retired after use. GitHub publishing validates APK/AAB signatures, package/version and hashes before creating release assets. Firebase Hosting on Spark uses redirects to GitHub rather than storing prohibited executable files.

Included: realtime notification reconciliation, exact backend unread badges including nullable unread rows, mark-all-read reconciliation, lifecycle-aware Today deadlines, complete source export, and an updater allowlist limited to the exact GaGa Supabase project in addition to existing trusted hosts.

Migration: previous differently signed APKs require one uninstall/reinstall. Back up local-only drafts first. Server account deletion is not part of reinstall. Keep the supplied private signing backup; future direct APK releases must use the same key.

Remaining: GitHub signing secrets must be installed with ci/configure_signing_secrets.py (current connector cannot write repository secrets). Google Play upload-key/account registration is not updated by this release and must be validated separately. Real-device two-account chat/call/media/push/install testing and remaining roadmap features are not certified as complete.
