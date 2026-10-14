# GaGa 2.7.8 rebuild

Base: main b83f01640bb00e6f8604653f72eb8f9859569694, collected from omarouma/app on 14 October 2026.
Application: gagachat.app. Version: 2.7.8 / 53. Backend: Firebase oumagachat + Supabase fcjgbbmfqdkucfpqjxae.

## Included changes
- Existing merged chat, People/QR, settings, Today, Action Messages, Circle, location, call, notification and update-system sources are retained.
- Today uses one lifecycle-aware clock, refreshes every 30 seconds while visible, counts reminders due today, and removes elapsed events from Upcoming. Dhaka-midnight/malformed-time/deadline tests added.
- Notification realtime subscriptions reconcile the authenticated inbox on changes and reconnect. Conflated refresh signals keep notification REST requests out of the message event path. No additional Android push is posted.
- Badge count is fetched from backend across all unread rows rather than the latest 50 inbox rows. Mark-all-read reconciles new arrivals instead of blindly forcing zero.
- Account ownership is checked before accepting notification events and before publishing REST results. Existing read error handling and account clearing remain.
- CI packages the complete tracked source snapshot and exact commit, APK/AAB, checksums and regression test reports; explicitly compiles Today/Settings.

## Verified before Android CI
32 Node tests passed for call admission, LiveKit token authorization, friend push, FCM recipients and preview egress. Four Python release-gate tests passed. Firebase public project/app configuration validator passed.
Live notifications metadata confirms RLS, owner-only SELECT/UPDATE/DELETE, restrictive active-session checks and membership in supabase_realtime. No production data/schema was changed.
Android/Kotlin pass status must be taken from the final commit's CI run, not earlier runs or uploaded 2.0.33 reports.

## Discussed plan still requiring completion/verification
This rebuild does not claim the entire product roadmap is finished. Source presence is not functional acceptance.
- Two physical accounts/devices: messaging/media/location, call reconnect, background/terminated push, logout/privacy isolation and update installation.
- Full notification cursor pagination, server dismissal/archive, swipe and bulk actions require further implementation/acceptance; inbox remains bounded to 50 loaded rows, while badge count covers all unread rows.
- Advanced language bridge (voice/document translation), resumable chunked media upload, and complete Circle-specific workflows are roadmap items needing separate end-to-end validation.
- China shopping remains preview/MVP; verified live suppliers, checkout, payment and fulfillment are not completed by this rebuild.
- Wallet/coins payment launch is outside this chat release scope.

## Signing
No replacement key was generated. CI currently accepts only the pinned 2.7.2 certificate bd95b298a3e64314f3135579c3b827e982c033556472693a59472dc8ebf6c89a. SIGNING.md's claim that the 2.7.7 certificate is also accepted is inconsistent with the workflow. Resolve actual installed/Play signing identity before any policy change.
If CI signing secrets are unavailable/mismatched, output is explicitly unsigned and cannot be installed directly or submitted as a signed production release. Real-device tests and Play upload-key checks remain required even if compilation succeeds.
