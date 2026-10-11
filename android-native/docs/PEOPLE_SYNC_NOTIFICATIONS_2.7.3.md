# GaGa People — Cross-device Favorites, Friend Notifications, Contact Invites

Development source package based on `feat/gaga-qr-people-professional-2.7.3` (PR #61); includes previous Chat UI and API 36 hardening layers.

## What the source does

1. **Favorite Friends:** Uses the new `public.favorite_friends` owner-only RLS table for authoritative reads and writes. Device DataStore is the offline cache; writes are committed to server **before** the local UI changes. On People refresh the client fetches favorite ids for the signed-in owner, so another device receives them after refresh. A failed write is reported rather than pretended successful. The table allows favorites only for actual friends and deletes stale favorites when a friendship edge is removed.
2. **Friend inbox events:** A database trigger inserts a recipient-owned `public.notifications` event for new friend requests and accepted requests, in the **same transaction** as the request. No customer-supplied display names, private addresses or service keys are present in the notification text. This is an inbox notification even when FCM fails.
3. **Push delivery:** A restricted `friend-event-push` Supabase Edge Function verifies the user's JWT with Supabase Auth, checks the current request status and actor, then records a server-only event deduplication entry and calls the existing service-role-only `send-fcm-push` function. The Android repository calls it after successful send/accept. This path is explicitly **best effort**; loss of connectivity after the DB transaction can prevent an immediate push. The durable notification record and a normal People refresh still work.
4. **Android notifications:** Separate Friend Requests notification channel; taps open the People screen using existing authenticated deep-link handling. Actual push delivery depends on the Edge Function, existing FCM credentials and valid device tokens.
5. **Contact invitation:** The user taps Invite a Phone Contact, selects ONE contact using Android's system contact picker, sees an explicit confirmation, and opens the Android share sheet with the GaGa profile URL. No bulk contacts, phone numbers, or contact hashes are uploaded or searched. This is opt-in **invitation**, not silent contact matching or automated friend discovery.

## Files

- `supabase/migrations/20261015000000_favorite_friends_and_friend_events.sql` (new; **not deployed**)
- `supabase/functions/friend-event-push/index.ts` (new; **not deployed**)
- `supabase/functions/friend-event-push/tests/dispatch.test.mjs` (new)
- `supabase/functions/send-fcm-push/index.ts` (channel mapping)
- `android-native/core/network/src/main/kotlin/app/gagachat/core/network/rest/SupabaseRestApi.kt`
- `android-native/core/data/src/main/kotlin/app/gagachat/core/data/preferences/FavoritePeoplePreferences.kt`
- `android-native/core/data/src/main/kotlin/app/gagachat/core/data/repository/FriendsRepository.kt`
- `android-native/feature/people/src/main/kotlin/app/gagachat/feature/people/PeopleViewModel.kt`
- `android-native/feature/people/src/main/kotlin/app/gagachat/feature/people/DiscoverScreen.kt`
- `android-native/app/src/main/kotlin/app/gagachat/push/PushHandler.kt`
- `android-native/app/src/main/kotlin/app/gagachat/push/NotificationHelper.kt`
- `android-native/app/src/main/kotlin/app/gagachat/push/NotificationChannels.kt`
- `android-native/docs/PEOPLE_SYNC_NOTIFICATIONS_2.7.3.md` (this document)

## Safe backend deployment steps

Do not apply the migration to the production database from an unreviewed UI button. First:

1. Back up the Supabase project (schema + data) and stage a test project; do not overwrite the existing `user_settings` table.
2. Apply the new migration in a **staging database** and verify `favorite_friends` owner-only RLS, role grants, on-unfriend cleanup and notification trigger behavior.
3. Deploy the revised `send-fcm-push` and the new authenticated `friend-event-push` functions to staging. The new function must require a **real user JWT**, and `send-fcm-push` must stay service-role-only.
4. Set normal Supabase/Firebase service configuration **in server-side secrets only**; do not put service-role keys or Firebase private keys into the APK.
5. Test the two-account matrix below with two actual non-admin test users. Deploy to production only after those tests and rollback review.
6. If production migration is delayed, the new Favorites UI will retain cached values but cannot synchronize; it should show a sync-error notice. Do not claim the feature is live before the table exists.

## Two-account and two-device tests (NOT yet executed)

| Scenario | Expected result |
|---|---|
| A favorites B | A's other device shows B after People refresh; B never sees A's private Favorites |
| A un-favorites B | Both A devices reconcile; B cannot alter A's favorite status |
| A removes B as friend | A and B friendship edges are removed; stale favorites are purged |
| A requests B | A sees Sent, B sees Requests and has a persisted notification row |
| B accepts A | Both accounts see friendship; A has friend_accepted inbox event |
| B rejects A | A never becomes a friend; no unearned accepted push |
| A resends a duplicate | Server rejects or dedupes; no duplicate FCM dispatch |
| Unauthenticated push | Edge endpoint returns 401 and no recipient event |
| Non-member push | Caller cannot dispatch for another actor's event |
| Repeated push | Deduplication ledger prevents duplicate FCM delivery |
| Device B offline | DB event remains; a later People/notifications refresh discovers it |
| Blocked A/B | Request/accept must respect existing block guards and user privacy |
| Contacts denied | User can still share profile manually; no bulk contacts import |
| Contact chosen | Only selected contact's name is inspected locally; user confirms share |

## Android local build

Check out `feat/gaga-people-sync-notifications-2.7.3`, open `android-native` in Android Studio and use Gradle 8.11.1 + JDK 17 + SDK 36. For command-line builds:

```bash
cd android-native
gradle --no-daemon :feature:qr:testReleaseUnitTest :core:data:testReleaseUnitTest :app:assembleRelease :app:bundleRelease
```

A signed release requires the existing GaGa 2.7.2-compatible original keystore in the trusted signing environment. CI packaging may supply unsigned artifacts only. This is **source work for developer review**, not a completed Play Store release.

## Known remaining limitations

- Android device/emulator tests cannot be replaced by repository compile tests. Real QR scans, notifications, accepting/declining, and media should be checked on two phones.
- Device FCM delivery is best-effort. Full server-driven delivery after a client crash requires a durable background outbox/worker; database notification rows are already durable.
- Contact invitation is user-confirmed, not automated address-book-based friend matching; implement a privacy-preserving opt-in discovery service separately if wanted.
- Favorites synchronization is refresh-based, not a full Realtime cross-device push subscription.
- Existing `20261014000000_friend_request_lifecycle_rpcs.sql` is not recorded in live Supabase migration history; verify its compatibility before relying on atomic friend-request acceptance in production.
- Existing QR App Links and the new hosted release metadata must be validated on actual deployed hosting, not assumed from the GitHub source.
