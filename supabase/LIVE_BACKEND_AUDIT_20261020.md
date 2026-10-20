# GaGa live Supabase audit and safe recovery gates — 2026-10-20

**Project:** `fcjgbbmfqdkucfpqjxae` (`GaGa`, ap-northeast-2, PostgreSQL 17)  
**Inspection:** authenticated Supabase connection; read-only metadata, SQL
catalogue queries, security advisor, and Edge Function source. No user records,
private keys, passwords, live migrations or data were modified.

## Confirmed working platform contracts

- Project state: `ACTIVE_HEALTHY` (not an end-to-end Android test).
- RLS enabled on `users`, `chats`, `messages`, `notifications`,
  `friend_requests`, `call_signaling`, `wallets` and transactions; each
  inspected core table has at least one policy. Live publication
  `supabase_realtime` includes messages, chats, notifications, call_signaling,
  friend_requests, friendships, and user_devices.
- `chat_hidden_users`, `chat_user_settings`, `friend_push_dispatches`
  and `wallet_feature_flags` have no direct SELECT/INSERT/UPDATE privilege
  for `authenticated`; zero policies on these tables are therefore
  intentional, not evidence of an app-facing data leak. Do not add open RLS
  policies merely to clear an informational advisor.
- Current `send_message` RPC checks `auth.uid()`, active session and chat
  membership; the database's message-insert guards must also remain active.
  The `gaga_private.delete_account()` function checks recent authentication,
  requires media removal first, then deletes associated profile/device records
  and the Supabase auth account. Do not bypass these gates.
- The inspected `send-fcm-push` Edge Function authorizes service-role or a
  dedicated webhook-secret caller. `create-call` verifies the user token and
  RPC admission before creating a call. Source inspection does not establish
  real-device push/voice-call delivery.
- Real-money wallet transfers are guarded by the
  `real_money_p2p` feature flag. Do not switch it on without the authorized
  payment settlement and regulatory workflow.

## Reconciliation of production migration history

| Class | Count | Interpretation |
|---|---:|---|
| Repo migrations | 64 | SQL files currently tracked in GitHub `main` |
| Live migration records | 117 | `supabase_migrations.schema_migrations` |
| Exact version match (null names accepted) | 46 | Recorded under the same version |
| Retimestamped name match | 15 | Mostly China Direct migrations |
| Documented repo-only exceptions | 3 | Not equivalent by version/name |
| Historic / out-of-band live-only records | 56 | Missing matching repo version/name |

The **three exceptions** require distinct handling:

1. `20261009090000_settings_center` is a **forward migration** not present
   live; prior audit identified device DataStore settings as current behavior.
   Do not apply it unreviewed merely to silence the drift report.
2. `20261013000000_call_lifecycle_rpcs` was historically delivered through
   `gaga_atomic_call_lifecycle` (`20261003131552`) and requires SQL
   definition comparison before provisioning a new environment.
3. `20261016000000_wallet_ledger_hardening` was reportedly applied as
   an out-of-band repair, but no matching migration-history version exists.
   The live wallet objects/RPCs exist; equality to committed SQL has **not**
   been established by migration metadata alone.

An earlier audit considered this drift reconciled by matching migration
names/objects. **Do not interpret that as proof that a fresh database built
from 64 files reproduces all 117 historical effects.** A true restore test
must provision a disposable environment, replay a reviewed canonical
baseline and integration-test authorization, messaging, calls and wallets.

### Guard created in this PR

- `supabase/tests/live_migration_inventory_20261020.json`: exact live
  **version/name metadata** snapshot, no user content or secrets.
- `supabase/tests/verify_live_migration_inventory.py`: compares repository
  migration filenames to snapshot, explicitly reports the three known
  exceptions, detects new/renamed migrations, optionally fetches the live
  migration inventory through read-only Supabase Management API.
- `supabase/tests/test_verify_live_migration_inventory.py`: regression
  tests for 46/15/3/56 known classes, changed live versions, same-version
  conflicting names, duplicates and offline mode.

Run offline (no credentials, no networking, no DDL):

```bash
python3 supabase/tests/verify_live_migration_inventory.py
python3 -m unittest discover -s supabase/tests -p 'test_verify_live_migration_inventory.py'
```

Optional **read-only live** comparison on a trusted workstation:

```bash
SUPABASE_ACCESS_TOKEN=<private-token-in-environment> \
  python3 supabase/tests/verify_live_migration_inventory.py --online
```

Never commit, paste or print the Management API token. The snapshot is
evidence of the observed *migration record list*, not table definition
equivalence, a full disaster-recovery backup or permission QA.

## Security advisor observations (not automatically vulnerabilities)

1. `authenticated_security_definer_function_executable`: **72 WARN
   findings**. Several audited RPCs explicitly authorize the current
   user. Prioritize negative-path tests for `admin_update_user`,
   `wallet_*`, privileged China Direct supplier/product operations
   and device/session RPCs. Review callable privileges; **do not revoke
   all authenticated RPCs** or messaging/groups will break.
   See: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
2. `rls_enabled_no_policy`: **11 INFO** findings; some tables intentionally
   deny direct access. Confirm all affected grants/function boundaries before
   introducing a policy.
   See: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
3. `extension_in_public`: `pg_net` remains in `public` (WARN). A
   schema relocation may impact database hooks/async requests; require
   dependency scan and staging tests before touching production.
   See: https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public
4. `auth_leaked_password_protection`: password breach checking is disabled
   (WARN). Review and enable it in the Supabase Auth admin dashboard if
   supported by the account plan; this is **not** a SQL-only setting.
   See: https://supabase.com/docs/guides/auth/password-security

## Remaining deployment gates

- Run two-account test matrix: signup/login/logout, direct and group messages,
  typing/read receipts, FCM background delivery, call admission/finish,
  media and view-once cleanup, Today, device-switch, account deletion.
- Verify destructive account-deletion flows using **test accounts only**.
- Rotate any previously exposed Firebase Admin service account credential.
- Validate live functions with negative authorization tests before any grant
  or `SECURITY DEFINER` change.
- Keep Play 2.8.15 PR #139, public APK updater, and live production schema
  unchanged until signed artifact, device tests and migration reconciliation
  are actually complete.
