# GaGa 2.8 redesign and feature improvement tracking

## Implemented in 2.8.0

The native app retains package gagachat.app, Firebase oumagachat, the existing Supabase project and the 2026-10-14 release signing certificate. This is a frontend and notification functionality update.

| Surface | Change in this release | Verification scope |
| --- | --- | --- |
| Shared native UI | Green light/dark palette, clearer type, rounded cards, filled search, icon tiles, consistent headers and navigation | Shared components rendered on emulator at 360dp width and enlarged text |
| Chats | Unread conversation cards, rounded composer, shared bubble shape | Compilation and existing messaging contracts |
| Today | Greeting/date hero with clear dashboard hierarchy | Compilation and daily-life unit tests |
| Notifications | Unread hero, long-press selection, confirmed server dismissal, older-page loading | Owner-scoped mutation contract, failure preservation, account-change regression tests |
| Location confirmation | Pin summary, accuracy and age, explicit map preview and separate Send action | Compilation; external Maps app handling requires device check |
| Settings, People, profile and supporting screens | Shared colors, rows, search and typography where shared components are used | Compilation; full authenticated route walkthrough remains required |
| Authentication, calls, QR, groups, wallet, safety and onboarding | Shared theme inheritance; feature-specific layouts retain existing controls | Existing tests and compilation; no claim of a complete bespoke redesign for every route |

Notification filtering/search applies to loaded pages. Load older updates to include additional records. Pages use a stable created-at/id ordering with offsets; realtime refresh restarts the first page. New arrivals can shift offsets, so a future cursor-based API is preferable for a continuously changing archive.

Native visual artifacts use sample labels in a shared-component preview. They are not screenshots of every live authenticated production screen.

## Next implementation priorities

1. Screen-by-screen native review: login, registration, OTP, recovery, onboarding, Home, chat, chat info, People, discovery, contact/profile, calls, QR, groups, Today, safety, wallet and each settings category. Check loading, empty, failure, offline, keyboard, large text and dark mode for each route.
2. Bespoke layouts for remaining surfaces: stronger primary action hierarchy, readable status summaries, responsive spacing and accessible descriptions, using the same green design system.
3. Messaging depth: attachment retry/cancel, offline recovery, delivery states, media viewer accessibility and destructive action confirmation.
4. People and calls depth: request conflict recovery, pagination, multi-device consistency, missed-call recovery, permission denial and audio route lifecycle checks.
5. Today and safety depth: reminders/time zones, task conflicts, location permission/freshness, check-in delivery and recovery. Require real service behavior before presenting enabled controls.
6. Release/device checks: install over 2.7.9 using the same certificate; validate login, push, realtime, call connection, background delivery, camera/QR and links on physical devices. Play distribution requires its independent console validation.

Do not present planned capabilities as implemented. Existing explicitly planned/coming-soon features remain labeled until their backend and failure handling are verified.
