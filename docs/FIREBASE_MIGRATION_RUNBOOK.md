# GaGa Chat — Migration & Cutover Runbook

**Date:** 2026-10-05
**Scope:** moving authentication and chat from Supabase to Firebase while keeping
Supabase Storage for media and LiveKit for calls, **without losing existing
accounts, conversations or media access.**

> **Hard rule:** do **not** disable Supabase login and do **not** delete Supabase
> chat records until Stage 7 verification passes. The Supabase chat database is
> retired only after the migrated build is verified.

---

## 0. Prerequisites

- Firebase project `oumagachat` (billing stays **disabled**; Cloud Storage is
  **not** used this phase).
- Admin SDK service account JSON available to the migration runner only
  (`oumagachat-firebase-adminsdk-*.json`) — never committed, never shipped.
- Supabase service-role key available to the migration runner only.
- `firebase deploy --only firestore:rules,database` and
  `supabase functions deploy` rights.

---

## 1. Stage 2 — Authentication & identity mapping

### 1.1 Deploy the identity backend
```bash
supabase db push                       # applies *_firebase_identity.sql
supabase functions deploy firebase-identity --no-verify-jwt
supabase functions deploy media-auth --no-verify-jwt
supabase functions deploy send-fcm-push --no-verify-jwt
supabase functions deploy livekit-token --no-verify-jwt
supabase functions deploy create-call --no-verify-jwt
```

### 1.2 Secrets
```bash
supabase secrets set \
  FIREBASE_PROJECT_ID=oumagachat \
  FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@oumagachat.iam.gserviceaccount.com \
  FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### 1.3 Link existing accounts (one-time, per user)
The **only** supported way to link a legacy account is through
`firebase-identity` with **both** a Firebase ID token and a legacy Supabase
session for the same email. A batch helper is provided for users who sign in
through the app (they link themselves on first launch); there is **no** bulk
email-matching script by design.

Verification: `select count(*) from gaga_identities;` grows by exactly one per
linked user; no two rows share a `gaga_user_id`.

---

## 2. Stage 3 — Firestore chat transport

```bash
firebase deploy --only firestore:rules,firestore:indexes,database
```

Verification: two test accounts exchange messages; each send produces exactly one
`chats/{id}/messages/{mid}` document and one push; offline send survives a
force-stop and reconnects in order.

---

## 3. Stage 4 — Firebase-authorized media

Media objects move to **private** buckets. Reads go through `media-auth`, which
verifies the Firebase token, checks membership, and returns a short-lived signed
URL. Remove the public-read policy only after the app build that uses `media-auth`
is deployed.

```sql
-- executed by the migration, after the new client is live
drop policy if exists gaga_media_public_read on storage.objects;
```

---

## 4. Stage 7 — History migration

### 4.1 Inventory (read-only)
```bash
node tools/migration/export-supabase.mjs --out ./migration-out
```
Produces `conversations.ndjson`, `messages.ndjson`, `members.ndjson`,
`receipts.ndjson`, `attachments.ndjson` and `manifest.json` (row counts + hashes).
**Stable IDs and original timestamps are preserved verbatim.**

### 4.2 Import (idempotent)
```bash
GOOGLE_APPLICATION_CREDENTIALS=./oumagachat-firebase-adminsdk.json \
node tools/migration/import-firestore.mjs --in ./migration-out
```
Every document is written with `merge` semantics keyed on the **original id**, so
re-running is safe and never duplicates. `clientTs`/`serverTs` come from the
exported timestamps, not from import time.

### 4.3 Reconcile
```bash
node tools/migration/reconcile.mjs --in ./migration-out --sample 25
```
Compares per-conversation message counts, sender distribution and attachment
references between the export and Firestore. **Gate:** zero missing, zero
duplicates in the sampled conversations.

---

## 5. Cutover

1. Ship the migrated build to a closed track first.
2. The migrated build **reads and writes Firestore only** (one authoritative
   transport). No mirroring in the release build.
3. If a temporary mirror is used during the transition, it must carry an explicit
   dedup key: the client message id (`clientMessageId`) is the idempotency key;
   the mirror writes `chats/{id}/messages/{clientMessageId}` with `merge`, and the
   reconciliation job de-duplicates on that key. **One send ⇒ one message ⇒ one
   notification.**
4. Keep the Supabase chat tables read-only for at least one release cycle.

---

## 6. Rollback

- The original Supabase records are **never mutated** by the migration (export is
  read-only; import writes to Firestore only).
- Keep the last Supabase-authoritative release (`2.0.30`) available as a
  compatible fallback.
- If reconciliation fails: stop the rollout, revert the closed-track build to
  `2.0.30`, and re-run import after fixing. New messages written to Firestore
  during the failed window are exported back with
  `tools/migration/export-firestore.mjs` (inverse) before re-cutting.
- Rollback must not lose messages written after cutover — hence the inverse
  export step.

---

## 7. What must be proven on real devices (not in CI)

- Two devices, two-way audio **and** live video over LiveKit.
- Ring on the recipient; stop-ring on accept/decline/cancel/timeout.
- Call outcome identical in the Calls tab and the chatroom, and matching the
  missed-call notification.
- Offline send across process death.
- Account switching shows no cross-account cache.
