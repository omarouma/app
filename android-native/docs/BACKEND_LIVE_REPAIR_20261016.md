# GaGa backend repair — 2026-10-16

## Live project (not the canceled Alibaba backend)
GaGa Supabase project `fcjgbbmfqdkucfpqjxae` reports **ACTIVE_HEALTHY** on PostgreSQL 17 in `ap-northeast-2`.

### Fixed and verified
- Migration **20261015191730_gaga_messaging_rls_auth_cache** was applied **in the live Supabase project** with the authenticated owner/membership predicates unchanged.
- Ten `chats`, `messages`, `notifications` RLS policies now cache `auth.uid()` using an initplan. The RLS performance advisor count changed **120 → 110**, and all ten policies remain `PERMISSIVE`.
- The three `gaga_active_session` policies remain `RESTRICTIVE`; no table or row data was dropped.
- The live migration and this repo SQL are the same intended change. Do **not** replay this migration against the live project, where Supabase already recorded its version.

### Investigated — no changes justified
- Supabase Storage: `chat-media` private bucket, 100 MiB file limit and supported media MIME types; recent `storage.object.upload`, `storage.object.sign` and signed downloads responded 200. This does not replace physical-device testing of the new editor/queued retries.
- Realtime publication includes messages, chats, notifications, calls, presence, typing and friends tables. Today's Daily Life API currently uses paged REST reads; don't turn on extra realtime publication without wiring subscribers and privacy testing.
- Sensitive tables `_app_secrets`, `friend_push_dispatches`, `chat_user_settings`, and wallet configuration have RLS with no policy **and no direct authenticated table grants**. These are intentionally inaccessible by direct authenticated REST; do not add broad public policies solely to eliminate INFO notices.
- Inspecting `send_message` alone suggested missing block enforcement, but `gaga_private.guard_message` and `enforce_message_insert_rules` pre-insert triggers already enforce direct-message restrictions and rate limits. No duplicate policy should be added without a tested failing case.
- Recent Edge Function HTTP 409 responses in `create-call` and `livekit-token` require correlation with an actual failing call; do not treat them as unconditional 500s. Most observed function responses are HTTP 200.

### Realtime WebSocket authentication failure isolated (client patch in this PR)

The last-24-hour Supabase API gateway log sample contained roughly **1,643 WebSocket HTTP 401s** against **69 HTTP 101 successful upgrades**. The failures came from the GaGa Kotlin/Ktor Android client, covering **seven distinct authenticated sessions**. These were still present and not expired in `auth.sessions`; this is NOT evidence of general Auth downtime or a reason to delete users.

The Android Realtime client previously opened a socket after swallowing a token-refresh failure, always used the legacy JWT API key on the WebSocket URL, and attached a user Bearer JWT to the HTTP Upgrade itself. GaGa **2.8.5 (versionCode 60)** now:
- Requires a nonblank refreshed user token before a socket connection.
- Uses the current publishable API key for the gateway first, with the configured active legacy anon key as a fallback **only for HTTP 401**; both were confirmed active in the live project.
- Keeps the HTTP WebSocket upgrade on public-key authentication only; **private Phoenix channel joins still include the user JWT**, per the Realtime protocol.
- Forces token refresh after a rejected upgrade and slows repeated reconnect attempts (max 120 seconds).
- Keeps per-channel user access-token authentication and private database RLS in place. No service-role key is bundled or used.
- Adds regression tests for handshake URL selection/deduplication.

This is a **code fix requiring a newly built Android APK**, not a claim that already-installed clients have recovered. The next Android device release must demonstrate a 101 upgrade, successful channel joins, two-account message sync, no 401 storm, and proper token-refresh/logout behavior before being called fixed.

### Remaining backend risks / next remediation
1. **Migration drift:** 106 applied migration records (including this fix) but only 57 SQL files tracked in the previous GitHub `main` revision. Approximately 66 previously applied live versions lack matching GitHub migration filenames. Reconcile each version and its exact SQL **before** provisioning or resetting a database. Never run all tracked migrations blindly.
2. **Security-definer RPCs:** 68 signed-in-callable functions flagged by the advisor. Some are intentionally public RPCs with `auth.uid()`, wallet and membership checks, but each role escalation and sensitive operation requires a negative-path authorization test. No anonymous EXECUTE access to the inspected privileged functions.
3. **Other performance advisories:** 110 RLS initplan, 88 multiple-permissive-policy and 83 unused-index notices remain. Changes must be tested and applied incrementally rather than bulk-removing indexes or policies.
4. **Auth:** Breached-password protection was flagged as disabled; review Auth settings. Full login/session/token rotation and Android Firebase identity/FCM delivery need device verification.
5. **Backend/application contracts:** Validate real two-account messaging, images/video, background media upload, Today records, notifications, calls, location, and logout with traceable logs. No live user data was modified to manufacture a green result.

Production rollout remains on hold until integrated QA and release security checks pass.
