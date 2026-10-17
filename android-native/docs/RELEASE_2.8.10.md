# GaGa 2.8.10 (65)

## Included

Consolidates the latest reviewed UI stack into main: compact headers/search/navigation,
persistent layout and font settings, profile and calls improvements, media/contact/location
tools, QR PNG sharing, friend-request realtime reconciliation, notification categories,
history-preserving refresh and correct destinations. Includes the already-deployed
device registration/session revocation guard from PR #108.

## Verified evidence

- Android source in CI artifact run 38967011114 matches merged main's Android source.
- CI reports: 148 XML unit tests, zero failures/errors/skips; model reports also passed.
- Native run 38967011123: 41 tests across UI, Today, chat, contacts, calls, QR and profile;
  zero failures/skips. Conversation light and large-text dark captures inspected.
- Additional local validation: eight configuration/release-policy tests and 32 backend
  authorization/egress tests passed.
- APK/AAB signed from those compiled CI outputs with the existing approved release key.
- APK v2/v3 verification, AAB JAR signature and certificate checks passed.
- APK ZIP alignment checked with 16 KB page alignment. Arm64 native libraries are checked
  separately for 16 KB ELF LOAD alignment before publishing.
- Firebase project oumagachat confirmed through the Google API. Supabase GaGa is healthy;
  messages, notifications, friend requests and friendships have RLS and Realtime enabled.

## Hosting release

The versioned APK/AAB, checksums and signature report are served from the existing
public Supabase gaga-app-releases bucket under 2.8.10/. Firebase Spark Hosting rejects
APK executables, so its website and update manifest redirect to those verified files.
Stable download redirects, website version labels and
the no-cache Android update manifest describe the same signed APK. Play channel remains
disabled (versionCode 0) until Play Console publication is established.

`hosting/prepare_android_release.py` prepares metadata from verified signed artifacts.
`hosting/deploy_verified_release.py` uploads a complete static version through the
official Hosting REST API, retaining the previous version for rollback. Credentials
are supplied through an external GOOGLE_APPLICATION_CREDENTIALS file, never committed.

The GitHub publication workflow reads its signed artifact base from the verified
manifest rather than assuming a stale Supabase release directory.

## Remaining release qualification

Physical-device, two-account messaging/calling, background/terminated-app FCM delivery,
Google sign-in, revoked-session behavior, OEM battery handling and Play prelaunch/account
validation still require direct tests. Automated success does not establish these.
Some optional features remain early access; this release does not claim every roadmap
feature is complete. The separate older photo-mosaic/theme experiment in PR #107 is not
blindly combined with the newer photo pipeline; it needs a compatible follow-up review.

Supabase advisor notices remain for extensions in public and authenticated privileged
RPCs. Several no-policy tables are intentionally server-only; do not add broad policies
or revoke application RPCs just to suppress advisor notices. Leaked-password protection
also remains an account configuration item.
