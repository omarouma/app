# GaGa trusted Firestore chat provisioner (candidate)

This is a **server-only** Supabase Edge Function, `mirror-chat-authoritative`.
Its purpose is to provision a Firestore `chats/{chatId}` document without
trusting the Android client's participant list. It does **not** send messages.

## Security contract

- Default state **disabled**. The endpoint responds `503 MIRROR_DISABLED`
  unless `GAGA_FIREBASE_MIRROR_PROVISIONING_ENABLED=true` and required
  environment credentials are installed.
- HTTP POST accepts **only** `{"chat_id":"..."}` and a Supabase user bearer
  token. Any `participants`, role, type, or administrative request fields
  fail with 400.
- The server calls Supabase Auth `/auth/v1/user` and loads the authoritative
  `public.chats(id,type,participants)` row using a server-held Supabase
  service credential. The caller must be in that current row. Nonmember and
  unknown chat both return 404.
- Live Supabase chat `type="direct"` maps to Firestore `type="dm"`;
  `group` maps unchanged. The complete server-owned participant list is
  validated before any Google write.
- A rotated Google service account authenticates to Firestore's REST API
  through a short-lived OAuth token. Firestore writes use preconditions
  (`currentDocument.exists=false` for creation, `updateTime` for refresh).
  Concurrent write conflicts fail closed after bounded retries.
- Only the `participants` and `type` Firestore fields are modified;
  no chats or profiles are deleted, no client service token is returned,
  and secrets are not logged.
- No `OPTIONS` CORS response is provided. Until explicitly reviewed, native
  clients can call it without authorizing new browser origins.

## Test

```bash
node --experimental-strip-types --test \
  supabase/functions/mirror-chat-authoritative/tests/handler.test.mjs
```

The `firebase-chat-provisioner.yml` workflow runs these ten negative/positive
authorization tests on PRs. They use stubs, with no live credentials or traffic.

## Blockers before deploying / turning the feature on

1. **Rotate the exposed Firebase Admin key first** and scope the replacement
   to only needed Firestore writes; avoid using a broad old credential.
2. **Implement durable deprovisioning** on participant removal, blocking,
   group membership changes and account deletion. This endpoint currently
   provides on-demand creation/refresh only; it does **not** guarantee rapid
   revocation. A read-then-write race with a removal is possible.
3. Audit any legacy Firestore chat documents created under the old permissive
   client rules; do not assume that all old participant lists were verified.
4. Add test-account Firebase emulator + staging integration tests for true
   membership changes, group joins/removals, revoked tokens, simultaneous
   updates, and interrupted/retried requests.
5. Only then deploy `supabase functions deploy mirror-chat-authoritative`
   with an authorized CLI/CI identity and the reviewed secrets. Keep
   `GAGA_FIREBASE_MIRROR_PROVISIONING_ENABLED` absent/false until QA passes.
   Deploying a disabled endpoint is safer than enabling the mirror prematurely.
6. Verify that Firestore rules PR #146 has been reviewed and deployed by an
   authorized Firebase admin. Android hybrid mirroring must **remain OFF**
   until provisioning + deprovisioning + rules are operational.

No Firebase production data, Supabase schema, Firebase rules or release
artifacts are changed by this GitHub PR.
