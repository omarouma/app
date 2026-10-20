# GaGa trusted Supabase → Firestore chat projection (STAGING ONLY)

**Source of truth:** Supabase `fcjgbbmfqdkucfpqjxae`, `public.chats`.
**Target:** Firebase `oumagachat` Firestore, `chats/{chatId}`.
**Status:** Source-only prototype with CI tests; not enabled or deployed.

This design intentionally does **not** put a Firebase Admin key, the Supabase
service role key, or a privileged Firebase write permission in the Android
application. It preserves the primary Supabase messaging and FCM flows.

## Security and consistency

- `trusted-chat-mirror` accepts **only POST** `{"chat_id":"..."}`
  authenticated with the exact server Supabase service-role bearer. It
  **rejects** body-supplied participant lists, chat types, and Firebase paths.
- After authorization, the server reads the latest `id,type,participants,
  updated_at` from Supabase. The production chat types are **`direct` and
  `group`**, not `dm` and `group`.
- A *separate, newly rotated* Google service account requests an OAuth token
  with the `datastore` scope. Firestore REST writes use document-update-time
  preconditions and four bounded CAS retries. A newer Supabase source version
  may not be replaced with an older one. The runtime never logs keys.
- A deleted Supabase chat produces a **tombstone** with `participants=[]`
  and `mirrorDeleted=true`, including when no mirror existed yet; this
  closes a concurrent create-after-delete race. Previous messages remain
  on Firestore until an independent, privacy-reviewed retention cleanup, but
  the rules prohibit reading them once parent membership is removed.
- The private outbox migration installs insert, authoritative membership/type
  update, and delete triggers. All are gated by
  `gaga_private.firebase_mirror_settings.enabled=false` by default.
  Server-only claim/finish RPCs use short leases, row locks, revision checks,
  exponential retries and exact `service_role` checks.
- `trusted-chat-mirror-worker` processes up to 3 claimed events in
  parallel, acknowledges success or records a retry without exposing user
  content. **A trusted scheduler must be configured separately**; merely
  deploying functions does not start automatic synchronisation.

## Do not deploy before these gates

1. Rotate the historically exposed Firebase Admin credential; provision a
   new dedicated service account for this function (least-privilege Firestore
   document access, no project administration). Do not reuse the exposed key.
2. Reconcile the historic 117 Supabase live migration records versus 64
   GitHub migrations (PR #144) and apply the *new* outbox SQL to a disposable
   staging database first. Do **not** run a blind `supabase db push` against
   production.
3. Ensure Firebase Rules PR #146 and Android PR #139 are reviewed. The old
   client chat creation path is unsafe; `FIREBASE_TRANSPORT_ENABLED=false`
   remains the public default. The separate Firestore Rules Emulator suite
   validates legitimate reads and denial after server-side member removals.
4. Configure the following **Edge Function runtime secrets on the trusted
   server only** (never GitHub source, client configs or this chat):
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (normally supplied by
     Supabase server runtime)
   - `FIREBASE_MIRROR_PROJECT_ID=oumagachat`
   - `FIREBASE_MIRROR_CLIENT_EMAIL` (new Firebase service account)
   - `FIREBASE_MIRROR_PRIVATE_KEY` (newly rotated PEM; encrypted secrets)
5. In staging, deploy the two functions with standard gateway JWT validation:
   ```sh
   supabase functions deploy trusted-chat-mirror --project-ref <staging-ref>
   supabase functions deploy trusted-chat-mirror-worker --project-ref <staging-ref>
   ```
   Do not use `--no-verify-jwt`, change public Firebase rules, or enable
   hybrid transport just to test the backend.
6. Run two synthetic accounts across insert, ordinary update, group member
   add/remove, rapid concurrent changes, delete (before/after provisioning),
   duplicate event, 5xx Firebase outage and retry. Confirm a removed member
   cannot read the chat or historic messages. Verify no account has
   unauthorized membership carried over from old Firestore documents.
7. Once staging tests and legacy audit pass, an authorized operator may
   enable the staging outbox setting and seed carefully reviewed chats.
   Configure a trusted periodic service-to-service call to the worker, using
   a vault-backed service bearer; never expose that credential in an
   unauthenticated scheduler, SQL text, browser or Android app.
8. Before production rollout, establish reconciliation monitoring, alert on
   failed/old outbox jobs, test rollback by disabling the setting, verify
   data-retention obligations (#148), and obtain release sign-off.

### Staging only — enabling and controlled backfill

The migration defaults to disabled. An authorized operator may enable it
**only in staging** after all review steps:

```sql
update gaga_private.firebase_mirror_settings
set enabled=true, updated_at=now()
where singleton=true;
-- After auditing existing chat memberships, backfill with a reviewed
-- server-only enqueue operation; do not bulk-seed production blindly.
insert into gaga_private.firebase_chat_sync_outbox as q (chat_id)
select id from public.chats
on conflict (chat_id) do update
set revision=q.revision+1, next_attempt_at=now(),
    leased_until=null, lease_token=null;
```

Disabling the outbox `enabled=false` immediately stops new triggers and
claims. It does **not** roll back previously mirrored Firebase data or
restore permissions to users removed from Firestore; these require explicit
privacy-safe recovery planning.

## Staging operations and revocation monitoring

This queue is **eventually consistent**, not synchronous authorization.
A user removed in Supabase may temporarily retain Firestore access until the
trusted worker successfully updates Firebase. With outages or an unconfigured
scheduler that interval can grow indefinitely. Do **not** treat the mirror as
safe for sensitive chat content without an explicit revocation-latency policy,
fail-closed access strategy and validated operational alerting. Keep hybrid
transport disabled meanwhile.

On the **staging** project only, check the following after provisioning the
queue and enabling the staging setting. The query is read-only and does not
include message content or user identifiers:

```sql
select enabled, updated_at
from gaga_private.firebase_mirror_settings
where singleton = true;

select
  count(*) as pending,
  count(*) filter (where attempts >= 5) as repeated_failures,
  count(*) filter (
    where enqueued_at < now() - interval '10 minutes'
  ) as older_than_ten_minutes,
  count(*) filter (
    where leased_until is not null and leased_until < now()
  ) as expired_leases
from gaga_private.firebase_chat_sync_outbox;
```

Alert for stale/repeatedly failing work, missed worker invocations and Firebase
permission-denied errors. Record the interval between Supabase membership
change and **confirmed Firestore denial** under load and Firebase outages;
review a maximum allowed interval before approving any public client access.
A disabled trigger does not automatically drain or revoke old mirrored chats.

### Project and migration checks

- Live Supabase `fcjgbbmfqdkucfpqjxae` currently contains real users and chats.
  The new outbox table was confirmed **absent** on 2026-10-20.
- Do not confuse the live `main` Supabase branch with an isolated staging DB.
  Inspect its migration status and divergence before any branch creation or
  migrations; generating staging compute may incur additional charges.
- Current live `public.chats` has an `updated_at` BEFORE UPDATE trigger;
  all 90 chats have supported types and non-null timestamps. The read-only
  preflight also identified **one duplicate-member chat** and **two direct
  chats with nonstandard member counts**. Investigate without changing user
  data; strict duplicate validation intentionally blocks unsafe projection.
  The seven group rows have consistent chat/group/roster memberships.
- Before **any** backfill, run the read-only
  `supabase/tests/firestore_chat_mirror_preflight.sql` on the target source
  and record the results. It reports aggregate findings only, no user IDs.
- This source PR intentionally has no production deployment action.

## Empty chat membership
A valid Supabase chat may temporarily or permanently have `participants=[]`.
The provisioner now mirrors that empty list, removing every Firebase read/write
permission while retaining the authoritative chat's original type and allowing
legitimate future server-authorized re-adding. This is different from a
Supabase-deleted chat: deletion uses a non-resurrectable tombstone. The
authorization behavior is covered by the companion Firestore Rules Emulator
test in PR #146 and the provisioner unit test in PR #149.

## Tests and current limitations

```sh
node --test supabase/functions/trusted-chat-mirror/tests/provisioner.test.mjs \
  supabase/functions/trusted-chat-mirror-worker/tests/worker.test.mjs
```

CI workflow: `.github/workflows/trusted-chat-mirror-tests.yml`.

- Pure contract/unit tests use fake Supabase/Firebase endpoints; these tests
  never mutate production data or test Google OAuth credentials.
- The **ephemeral PostgreSQL 17 CI** suite exercises the migration's SQL,
  triggers, ACLs, leases, revision fencing, retry and deletion behavior.
  This does **not** validate migration compatibility with the production
  schema or a real Supabase staging environment.
- Privileged RPC authorization reads the verified PostgREST
  `request.jwt.claims` JSON role, with a legacy claim fallback. The SQL
  regression suite rejects a modern `authenticated` claim even if an
  obsolete scalar claim says `service_role`.
- Firestore project must be configured and IAM-scoped correctly. Neither
  Firebase Admin credential rotation nor the actual staging/prod deployment
  is performed in this PR.
- The optional Firestore mirror cannot replace Supabase messaging, and no
  realtime delivery or push notification success is claimed here.
- Deleting a Supabase account does not yet remove all Firebase identity/data;
  this is separately blocked by issue #148.
