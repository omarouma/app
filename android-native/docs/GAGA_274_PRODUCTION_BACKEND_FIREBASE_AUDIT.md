# GaGa 2.7.4 — Production Backend, Firebase and Release Audit
Checked 2026-10-12. Source branch: `feat/gaga-2.7.4-backend-firebase-release-gates`. Supabase project `fcjgbbmfqdkucfpqjxae`; Firebase public client project `oumagachat`; Android package `gagachat.app`.

## Verified read-only findings
- GitHub Actions run 38182551260 completed **successfully** and produced `GaGa-2.7.4-release-unsigned.apk` and `GaGa-2.7.4-release-unsigned.aab`. The actual artifact includes `SIGNING-REQUIRED.txt`: the original release keystore was **not** available. Do not publish those unsigned files or present them as installable signed updates.
- Both user-supplied Firebase configuration JSONs identify `oumagachat`; the PUBLIC `google-services.json` matches the checked-in `android-native/ci/backend-public.json` (project ID, number, app ID, release package, bucket, database URL, web OAuth client). The Admin SDK JSON is a **private server key**; it must never be bundled in Android, uploaded to source control, or copied into a debug APK.
- Android CI runs `android-native/ci/prepare.py` to generate `app/google-services.json` from PUBLIC configuration; Google Services + Crashlytics plugins are applied when that file exists. FCM registration is implemented in `GagaFirebaseMessagingService`, with token association through Supabase `user_devices`.
- The Firebase Firestore + RTDB mirroring feature defaults to **OFF** (`core/firebase/build.gradle.kts`); production messaging remains Supabase authoritative. Do not enable Hybrid transport until Firestore, RTDB auth identity, rules and quota are tested. FCM is separate from this opt-in mirror.
- Firebase live Console/Auth/Cloud Messaging/Firestore Rules/Hosting were **not accessible through a connected Firebase admin integration** during this audit. Repository rules and Android config are not evidence they have been deployed to Google.
- Supabase project GaGa is `ACTIVE_HEALTHY` in Seoul (`ap-northeast-2`). Its public tables include `favorite_friends` and `friend_push_dispatches`. Applied migrations include `20261014000000_friend_request_lifecycle_rpcs` and `20261015000000_favorite_friends_and_friend_events`; associated friend-request and cleanup triggers exist.
- Earlier overbroad named friend SELECT policies (`friend_requests_select_public`, `friendships_select_public`) are no longer present; remaining read policies enforce participants/friend-visibility, in addition to a restrictive active-session policy. This is a source/policy check, **not** a two-user penetration test.
- Supabase `send-fcm-push` active v36 requires either a service-role bearer or server webhook secret in its handler despite gateway `verify_jwt=false`; it filters out `user_devices.revoked_at` rows. Never infer that a disabled gateway JWT flag by itself makes an endpoint public. `firebase-token` checks caller through `/auth/v1/user` and mints a token with Supabase user ID.
- A separate `firebase-session` function uses a prefixed `sb_<supabase_uuid>` Firebase UID, unlike `firebase-token`. Do not mix those two authentication paths without a full Firebase Rules review.
- A `users` BEFORE UPDATE trigger explicitly blocks client changes to `is_admin`, `is_verified`, `is_premium`, balances, coins, and other server-managed fields. `activate_premium` requires server-owned coins, and `admin_update_user` verifies admin status. Avoid applying sweeping revocations without inspecting legitimate application RPC calls.

## P0: Deployed link-preview Edge Function lacks adequate authorization / egress restriction
Read-only source review of live `link-preview` v27 confirmed that it only tests whether an Authorization header has a nonempty value before fetching the requested URL. It does not verify the token against Supabase Auth, accepts arbitrary HTTP(S) hosts, follows redirects, and calls `response.text()` before limiting the response size.

**Source fix included in this PR (NOT deployed):**
- `supabase/functions/link-preview/index.ts` copied from actual live function and revised to validate the bearer token against Supabase Auth, require approved public HTTPS hostnames before any outgoing request/cache lookup, block redirects, cap streamed HTML response bytes and return generic network errors.
- `supabase/functions/link-preview/security.mjs` exact-host allowlist with a text-only preview for unapproved sites.
- `supabase/functions/link-preview/tests/security.test.mjs` regression tests for internal/metadata hosts, user-info deception, IP literals, scheme/port restrictions and safe fallback.

The restrictive allowlist deliberately trades rich previews on unknown sites for safety. Expanding arbitrary URL preview support requires a dedicated fetching service with network-level egress filtering and DNS/redirect protections. **Deploy this security patch after source/Edge tests and planned rollback; do not leave the vulnerable live function serving untrusted URLs.**

## Important remaining security/release work (NO PRODUCTION CHANGES MADE)
| Priority | Issue | Production gate |
|---|---|---|
| P0 | Uploaded Firebase Admin service-account private key may be exposed | **Rotate that key in Google Cloud IAM**, update `FCM_PRIVATE_KEY`, `FIREBASE_PRIVATE_KEY` and any other server secrets using it, test production notification/custom-token auth, then disable/delete the previous key. Do not revoke first and break FCM. Never supply a private key to the client APK. |
| P0 | No direct Firebase admin connection for this audit | Connect Firebase with the official Firebase integration, then inspect Google-side IAM keys, FCM API, registered Android SHA-1/SHA-256 signing fingerprints, deployed Firestore/RTDB rules, Auth domains/providers, Crashlytics and Hosting. |
| P0 | Original GaGa release signing key missing in CI | Store matching approved keystore and passwords only in GitHub Actions secrets, verify SHA-256 signer against existing Play upload key, then build a signed APK/AAB. Unrelated Google service-account keys do **not** sign Android releases. |
| P0 | Production notification/call workflows untested | Two-account, two-device real FCM delivery including background/killed, revoked tokens, calls and friend events. Verify real network failures, retries, and navigation. |
| P0 | Release website/App Links not verified live | Check `https://gagachat.app/.well-known/assetlinks.json`, release manifest, Firebase Hosting deployed rules, update redirect, Android intent verification, TLS and actual release certificate before shipping. |
| P0 | 62 callable SECURITY DEFINER functions flagged by advisory | Review function-by-function `EXECUTE` privilege, authorization and `search_path`; **not all** are defects. Pay attention to account, moderation, wallet and call RPCs. |
| P1 | Supabase leaked-password protection is disabled | Enable Auth leaked-password protection from Supabase Dashboard and verify registration/password-reset behavior. |
| P1 | Supabase performance warnings | 123 auth-RLS initialization warnings, 90 multiple permissive policies, 3 unindexed FKs; profile representative queries before optimizing. 68 unused-index warnings alone are not permission to drop indexes. |
| P2 | Supabase "RLS enabled no policy" on 3 tables | `chat_hidden_users` and `chat_user_settings` intentionally have revoked direct table grants and guarded RPC access; `friend_push_dispatches` is reserved for server dispatch. Do not blindly add public RLS policies. |
| P2 | `pg_net` and `pg_trgm` extension placement | Follow Supabase advisories and plan staging migration only if needed; avoid moving extensions in production without dependency testing. |
| P2 | Old ZEGOCLOUD Edge Functions still deployed | Investigate `zego-token` and `zego-callback` usage. Retire after confirming LiveKit-only flows; do not delete active dependencies by assumption. |

Relevant Supabase advisor reference:
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan

## Additional P0 discovered: link-preview server-side URL fetching
Read-only inspection of the deployed `link-preview` handler found it checks only that an `Authorization` string was supplied, rather than verifying a Supabase session, then follows redirects when fetching a user-supplied `http(s)` URL. That creates server-side request forgery (SSRF) risk and should be fixed before continued public use.

**Source fix added under `supabase/functions/link-preview/` (not deployed):**
- Verifies the bearer against `/auth/v1/user`, requiring an authentic user ID.
- Only fetches from a strict list of known public HTTPS hosts; all other URLs receive text-only fallback (no backend fetch or redirects).
- Rejects HTTP, private hosts/IP addresses, credentials and unexpected ports.
- Never follows 3xx redirects; caps streamed HTML to 500 KB before decoding, and removes upstream exception details from API responses.
- Node contract tests cover private metadata destinations, spoofed domains, username-in-URL tricks, oversized URLs and safe fallback.
- **Staging test required:** invalid/no JWT = 401; unapproved URL = text-only preview without outbound network; approved URL = bounded preview. Verify legitimate Android chat link rendering after update.
- **Deployment must be separately approved:** production function is still the earlier insecure version until reviewed patch is deployed. Roll out with Supabase Edge Function source, retain a rollback revision and watch function error logs.

## Source-only CI hardening included
1. `android-native/ci/verify_firebase_release_config.py`: validates real Firebase public client project/package/FCM config, Crashlytics/Google Services Gradle integration and presence of the Android push service. Does not touch private credentials or claim live Firebase connectivity.
2. `android-native/ci/verify_production_release.py`: produces `PRODUCTION-READINESS.txt`, differentiates unsigned development artifacts from signed verified builds, blocks production-tag/manual strict releases if the approved key is absent, and checks matching tag/version.
3. `.github/workflows/android-repair.yml`: runs Firebase client validation, supports strict release-tag/manual production gates and includes the report in GitHub Actions deliverables.
4. `.gitignore`: guards against accidentally tracking new Firebase Admin SDK credential files.

## Safe server credential rotation order
1. In Google Cloud, create a *replacement* narrowly scoped service-account credential or preferably migrate to workload identity/server-managed signing; keep it only in trusted secret storage.
2. Update the active Supabase Edge Function secrets for FCM and Firebase Auth bridge to the new key, without showing PEM text in logs, GitHub commits, chat messages or APK resources.
3. Validate dry-run FCM configuration using the **existing service-only** endpoint, then real device delivery and custom token exchange.
4. Revoke and delete the exposed previous key after all live dependencies are migrated. Review Google Cloud audit logs for unexpected use.
5. Review API key restrictions for the **public** Android Firebase API key separately; Firebase `google-services.json` public API keys are not Admin private keys.

## Release acceptance criteria
- New source CI is green; generated config identity and project ID correct; secrets scan clean.
- Server FCM dry-run verifies Google access, actual authenticated push reaches real device, and a revoked device gets no push.
- App uses same approved package/signing identity as Google Play; versionCode grows; signed AAB passes Play prelaunch.
- Supabase migration history, deployed RPCs and RLS authorize both participants and block unauthorized users in staging tests.
- No database resets or unchecked migrations; no service account JSON in client/source.
- Installed release tested on physical Android devices (chat, media, calls, QR, Friends, Today, Settings, profile, account deletion).
- Final privacy/Data Safety, permissions and account deletion disclosures complete.

**Status:** code configuration verified, original CI unsigned, new production CI gates prepared. **NOT certified Play Store publish-ready.**
