# GaGa Firebase / Supabase integration security repair — 2026-10-20

## Scope

This patch modifies **Firestore rules source only**, not the deployed rules,
Supabase database, FCM sending credentials, or Firebase Admin SDK keys.

The authoritative database is Supabase `fcjgbbmfqdkucfpqjxae`.
The supported native Android Firebase project is `oumagachat`, package
`gagachat.app`. The optional Firebase hybrid Firestore/RTDB chat mirror is
**OFF by default** in `android-native/core/firebase/build.gradle.kts`.
FCM push notifications are a separate, active Firebase SDK integration.

## Confirmed client authorization defects and fixes

### Chat-membership forgery

Before this change, `firestore.rules` permitted any signed-in Firebase user
to create `chats/{chatId}` if the user placed themselves in a *self-chosen*
`participants` array. Supabase did not validate this write, although it is
the source of truth for participant lists. A malicious Firebase Auth user could
therefore create an invented chat and authorize further writes under its ID.

**Fix:** `allow create: if false;` for chat documents. A trusted backend
must load the authorized Supabase participant list and provision the mirrored
Firestore chat with Firebase Admin SDK (which bypasses client rules). This
trusted provisioning endpoint is **not yet implemented or deployed**.
Do not enable `FIREBASE_TRANSPORT_ENABLED=true` in production until it is.

Existing Firestore chat documents and their client-side derived preview updates
remain subject to participant/type immutability checks. The app's Supabase
chat creation/messaging flow is unchanged.

### Profile-role injection on initial creation

Before this change, `users/{userId}` was owner-writable on creation without
the restrictions already present on updates. A user could initialize their own
Firestore profile with client-asserted `role`, `admin`, `isAdmin`,
or `isModerator` fields.

**Fix:** Deny those fields on client profile creation as well as updates.
Any trusted privileged profile fields must be provisioned by an authorized
backend and never inferred from user-controlled Firestore documents.

### What this does NOT prove

- This is a reviewed rules-source patch, not proof it is deployed to Firebase.
- Static regression checks only verify rules structure, not Firebase Rules
  runtime behavior. Run a real `@firebase/rules-unit-testing` emulator suite
  with cases: unauthenticated create, authenticated forged chat, profile
  privilege creation, legitimate profile create, existing member preview
  update, nonmember message read/write, and allowed owner presence.
- Changing rules alone cannot rotate the previously disclosed Firebase Admin
  key. Google Cloud/Firebase console access is required to rotate and revoke
  that key and update both Supabase `FIREBASE_PRIVATE_KEY` and
  `FCM_PRIVATE_KEY` Edge Function secrets.
- Firebase Hosting SEO deployment, Play signing and live Firebase Security
  Rules cannot be verified through the GitHub connection alone.

## Safe rollout sequence

1. Run `python3 -m unittest discover -s firebase/tests -p 'test_*.py'`.
2. Run the **real Firestore Rules emulator** allow/deny suite in the
   independently isolated project `demo-gaga-security-tests`:

   ```bash
   npm install --prefix firebase --no-audit --no-fund
   firebase/node_modules/.bin/firebase emulators:exec \
     --project demo-gaga-security-tests --only firestore \
     --config firebase/emulator.json \
     "node --test firebase/tests/firestore.rules.emulator.test.mjs"
   ```

   The test suite is defined in `firebase/tests/firestore.rules.emulator.test.mjs`,
   and the CI workflow at `.github/workflows/firebase-security-rules.yml` runs
   it automatically on matching PR updates. The tests use mocked Firebase
   identities and bypass rules **only to seed server-authored test records**.
   They do not access production projects, credentials or user data.

3. Verify the Firebase project's certificate registrations, IAM key rotation,
   and FCM dry-run send before deploying any new Firebase Auth bridge code.
4. Deploy **Firestore rules only** through an authorized Firebase console or
   CLI session *after tests pass*: `firebase deploy --only firestore:rules --project oumagachat`.
5. Verify blocked fabricated chat creations from an authenticated test account,
   allowed legitimate profile creation, and existing authorized user reads.
6. Keep hybrid mirroring disabled until the trusted Supabase-membership-backed
   provisioning function is implemented and evaluated. Do not edit live
   `hosting/public/app-updates/android.json` or push a new APK implicitly.

**Never** deploy `firebase deploy` without `--only` from this patch: doing so
could unintentionally touch Hosting, RTDB, Storage and unrelated configuration.
