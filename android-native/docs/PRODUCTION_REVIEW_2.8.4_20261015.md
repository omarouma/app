# GaGa Native Android — Production Review (15 October 2026)

**Candidate:** Android 2.8.4, versionCode 59. **Repository:** omarouma/app. **Branch:** feat/gaga-today-chats-four-screen-20261015.

## Evidence and scope
Reviewed the complete Android source snapshot included in the passing 2.8.3 CI artifact, CI logs and workflow definitions, active Supabase project metadata (read-only), security/performance advisors, and the design PR. Compilation and visual checks passed for 2.8.3; 2.8.4 changes must pass CI independently. A passing emulator check is not a real-device, dual-account, production, or Play Console sign-off.

## Release-critical findings

| Priority | Finding | Disposition |
|---|---|---|
| P0 | 2.8.3 unsigned APK/AAB exist, but CI reports **matching-key signed APK/AAB NOT PRESENT**. | **Blocking**. Release must be signed with the existing approved upload key, verified against `android-native/ci/release-signing-public.json`, and checked for Play account compatibility. Do not regenerate or change the signing identity casually. |
| P0 | Play-distributed app declared REQUEST_INSTALL_PACKAGES solely for in-app self-update. | **Code fix prepared in 2.8.4**: permission removed; update UI opens Google Play or official website, instead of requesting installation rights. Verify after CI. |
| P0 | Live Supabase project has 105 applied migrations while 57 migration files were present in this source snapshot; names/versions differ. | **Blocking for DB schema deploy/rebuild**. Reconcile against authoritative schema before running automated migrations; no database mutations were performed in this review. |
| P0 | Supabase security advisor reports 68 signed-in-callable SECURITY DEFINER functions, including sensitive wallet/admin operations. | **Manual security review needed**. Some inspected RPCs explicitly validate `auth.uid()`, membership, role, or wallet constraints; advisor count is not proof of 68 vulnerabilities. Test unauthorized and authorized roles, record justified exceptions, fix any unsafe grants individually. |
| P0 | Hardware two-account runtime behavior, cold start, background push and calls, media uploads and RLS-negative tests are not evidenced by CI. | **Pre-production device acceptance required**. |
| P1 | Supabase advisors report 120 auth-in-RLS performance, 88 multiple-permissive-policy, 83 unused-index and 2 extension-schema findings. | Profile query plans / test first; do not bulk-delete policies/indexes. |
| P1 | Password breach protection is flagged as off by Supabase Auth advisor. | Enable in project Auth settings if available for your plan, then validate login/signup flows. |
| P1 | Google Play data safety declaration, sensitive notification/call/contacts/location permissions and Play App Signing remain unverified. | Perform Play Console prelaunch review and declare genuine usage only. |

## Android module coverage

| Module | Code present | Production QA still needed |
|---|---|---|
| Login/onboarding | Auth flows, profile setup, permissions, session restore | Email/OTP, logout, account switching, locked session restore |
| Chats list | Conversation repository, search/filter, unread/pins, new-chat | Two accounts, sync across devices, offline and empty states |
| Chatroom | Messages, attachments, reactions/replies, location and action suggestion | Real media upload/download, send retry, no duplicates, correct permissions |
| People/contacts/QR | Discovery, contact and QR flows | Permission denial and privacy/blocked-user tests |
| Groups/Circles | Group/membership routes and model integration | Admin-member RBAC, notification and delivery consistency |
| Calls | LiveKit/native active-call flow, push/signaling | Foreground/background/terminated, denial/timeout, both directions |
| Today/workspace | Live records, tasks, reminders, events, lists and expenses | Persist/edit/complete, timezone boundaries, syncing, permission checks |
| Notifications | FCM and backend notification handling | Android 13+ permission, token rotation, cross-account clearing |
| Settings/security | Settings center, session, lock, app update | Sensitive data exposure, restore and UI accessibility |
| Profile | Profile settings, editing and user information | Data consistency and account deletion correctness |
| Wallet | Feature routes and server-side ledger RPC code | **Do not advertise real-money payment capability** without settlement/licensing/compliance testing |
| China Direct | Catalog/quote preview | **No verified live checkout**. Keep preview labeling. |

## Automated evidence
- CI workflows: Android repair validation and native redesign visual checks both **passed** on 2.8.3 PR head `66caf9dd4`.
- Release artifact zip contains `GaGa-2.8.3-release-unsigned.apk`, `GaGa-2.8.3-release-unsigned.aab`, SHA256SUMS and release notes.
- New 2.8.4 changes add a Google Play manifest-policy regression test and require their own clean CI compile before merge.
- No verified signed 2.8.4 artifact or Play Store release is claimed.

## Controlled production sequence
1. Obtain green Android 2.8.4 compile, unit tests, visual checks and reproduce APK/AAB checksums.
2. Validate signing keystore fingerprint and Play App Signing continuity in a secure build environment.
3. Reconcile Supabase migration inventory and review privileged RPCs; run non-destructive auth/RLS regression tests.
4. Pass two-account physical-device acceptance (messages, photos/video/file, calls, notifications, Today, circles, security and logout).
5. Publish to Play internal testing, complete prelaunch/Data Safety review, then staged rollout with crash and ANR monitoring.
6. Do not update the public version manifest or push rollout to users until signed artifacts and smoke tests match the intended build.

**Conclusion:** The application has substantial implemented features and verified Android CI compilation, but is **not yet verified production-ready**. Do not advertise or deploy unsigned build artifacts as signed production packages.
