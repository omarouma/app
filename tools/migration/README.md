# GaGa Chat — History migration tooling (Supabase → Firestore)

This directory contains the **offline, idempotent, reversible** tooling used to
copy every existing conversation, message, membership, read receipt, attachment
reference and call record from the live Supabase project into Cloud Firestore
**without re-keying ids and without losing a single row**.

The tooling is deliberately boring and dependency-light:

* The **export** and **reconcile** steps use only the Node standard library
  (`fetch`, `node:fs`, `node:http`, `node:crypto`) — no third-party packages.
* `firebase-admin` is imported **lazily** and only by the steps that actually
  write to / read from Firestore (`import-firestore.mjs`, `export-firestore.mjs`).
  That means `--dry-run` and the whole test suite run with **no credentials and
  no network**.
* Every step preserves the **original ids and timestamps verbatim**. Nothing is
  re-derived from wall-clock time, so a re-run is a no-op and the reconcile gate
  can compare the two stores byte-for-byte.

> **Read this first:** the end-to-end procedure, cutover order and rollback
> steps live in [`docs/FIREBASE_MIGRATION_RUNBOOK.md`](../../docs/FIREBASE_MIGRATION_RUNBOOK.md).
> This file documents the tooling itself.

---

## 1. Layout

```
tools/migration/
  package.json              # scripts + the single lazy dependency (firebase-admin)
  export-supabase.mjs       # Supabase  -> NDJSON snapshot        (read-only)
  import-firestore.mjs      # NDJSON    -> Firestore              (idempotent)
  export-firestore.mjs      # Firestore -> NDJSON snapshot        (inverse)
  reconcile.mjs             # Supabase snapshot vs Firestore snapshot (gate)
  lib/
    util.mjs                # arg parsing, NDJSON IO, hashing, time coercion
    map.mjs                 # Supabase row -> Firestore record mapping
    supabase.mjs            # read-only PostgREST client (offset pagination)
    firestore.mjs           # lazy firebase-admin + batched merge writer
  fixtures/
    supabase-rows.json      # tiny synthetic dataset for the offline tests
  tests/
    map.test.mjs            # unit tests for the row -> record mapping
    pipeline.test.mjs       # export -> import(dry-run) -> reconcile, end to end
```

The intermediate format is **newline-delimited JSON (NDJSON)**, one record per
line, with a companion `manifest.json` that records row counts and a SHA-256
hash of every file. NDJSON streams cleanly, diffs cleanly and can be re-read
without holding a whole collection in memory.

---

## 2. Quick start

```bash
cd tools/migration
npm install                 # installs firebase-admin (only needed for live runs)

# 0. Offline sanity check — no credentials, no network.
npm test

# 1. Export the live Supabase history (read-only; service-role key stays in env).
SUPABASE_URL="https://<project>.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
  node export-supabase.mjs --out ./migration-out

# 2. Validate the snapshot without writing anything.
node import-firestore.mjs --in ./migration-out --dry-run

# 3. Import into Firestore (idempotent; safe to re-run).
GOOGLE_APPLICATION_CREDENTIALS=./oumagachat-firebase-adminsdk-fbsvc-5178434666.json \
  node import-firestore.mjs --in ./migration-out

# 4. Read Firestore back out and diff it against the source snapshot.
GOOGLE_APPLICATION_CREDENTIALS=./oumagachat-firebase-adminsdk-fbsvc-5178434666.json \
  node export-firestore.mjs --out ./firestore-out
node reconcile.mjs --in ./migration-out --firestore ./firestore-out --sample 25
```

`reconcile.mjs` exits **non-zero** on any divergence, so it can be wired straight
into CI or a release gate.

---

## 3. What each step does

### 3.1 `export-supabase.mjs` — secure, read-only export

Reads four source tables over PostgREST using the **service-role key** (so RLS
cannot hide rows), but only ever issues `GET` requests. The key is read from the
environment and is **never written to disk**.

| Supabase table | NDJSON file            | Order column |
| -------------- | ---------------------- | ------------ |
| `chats`        | `conversations.ndjson` | `created_at` |
| `messages`     | `messages.ndjson`      | `created_at` |
| `chat_reads`   | `receipts.ndjson`      | `chat_id`    |
| `call_history` | `call_history.ndjson`  | `created_at` |

`messages` additionally fan out into `members.ndjson` (from `chats.participants`
/ `chats.admins`) and `attachments.ndjson` (from `messages.media_url` +
`messages.media_urls` + `messages.metadata`).

Pagination is **offset-based with a stable `order` column** so pages never
overlap or skip rows. A table that does not exist in a given project (for
example an older deployment without `call_history`) is skipped with a warning
rather than aborting the whole export.

`manifest.json` records the per-table row counts, the per-file record counts and
the SHA-256 of every NDJSON file, so the snapshot is self-describing and
tamper-evident.

Flags: `--out <dir>` (default `./migration-out`), `--page-size <n>` (default
`1000`).

### 3.2 `import-firestore.mjs` — idempotent import

Reads the NDJSON back and writes it to Firestore with `{ merge: true }`, keyed on
the **original id**. Re-running rewrites the same documents in place and never
duplicates them. Timestamps come from the export, never from import time.

Target shape:

```
chats/{chatId}
  type, title, photoUrl, createdBy, createdAt, lastMessageAt,
  lastMessagePreview, lastMessageSenderId, participants[], memberCount
chats/{chatId}/members/{userId}
  role, joinedAt, notificationPref, archived, pinned,
  lastReadMessageId, lastReadAt
chats/{chatId}/messages/{messageId}
  senderId, type, text, clientMessageId, serverTs, clientTs,
  replyToId, forwardedFrom, status, editedAt, deletedAt, attachments[]
chats/{chatId}/messages/{messageId}/reactions/{uid}
  emoji, at
chats/{chatId}/messages/{messageId}/receipts/{userId}
  state, at
call_history/{callId}
  callerId, calleeId, participantIds[], chatId, type, status, roomId,
  startedAt, endedAt, durationMs, createdAt
```

Before writing **anything**, the importer validates the invariants that make the
import safe:

* every message has an `id` and a `chatId`;
* every message's `chatId` refers to a conversation present in the snapshot;
* every member has `chatId` + `userId`;
* every receipt has `chatId` + `messageId` + `userId`.

Any violation aborts the run with a non-zero exit **before a single write**.

Writes are batched (400 documents per commit) via `lib/firestore.mjs`.

Flags: `--in <dir>` (default `./migration-out`), `--dry-run` (validate + print
counts, no credentials required, no writes).

### 3.3 `export-firestore.mjs` — the inverse

Reads Firestore back out into the **same NDJSON shape** as the Supabase export.
It is used by the reconcile gate and, during a rollback, to recover messages that
were written after cutover before re-cutting the release. Queries are paged with
`limit` + `startAfter` cursors so a large collection is never loaded at once.

Flags: `--out <dir>` (default `./firestore-out`), `--page-size <n>` (default
`500`).

### 3.4 `reconcile.mjs` — the gate

Diffs the Supabase snapshot against the Firestore snapshot and **fails
non-zero** on any divergence:

1. the set of conversation ids must match exactly (no missing, no extra);
2. global counts for messages / members / receipts / attachments must match;
3. per-conversation message counts and **sender distribution** must match;
4. within the sampled conversations, message ids must have no missing, no extra
   and no duplicates;
5. attachment references (by URL) must resolve to the same messages.

Flags: `--in <dir>` (source), `--firestore <dir>` (target), `--sample <n>`
(number of conversations to deep-check message ids for, default `25`).

---

## 4. Identity note (why ids are never re-keyed)

The migration copies the **existing GaGa user id** (the Supabase `uuid`) as the
canonical id everywhere. It does **not** invent a new id from the Firebase uid.
The Firebase uid ↔ GaGa id mapping is established separately and explicitly by
the `firebase-identity` edge function (see the runbook), and the Firestore
security rules treat the **mapped GaGa id** as the canonical identity — never
`request.auth.uid` on its own, and never an email match. This is what lets a
migrated build keep every account and every conversation intact.

---

## 5. Tests

```bash
npm test          # node --test tests/
```

* `tests/map.test.mjs` — unit tests for the row → record mapping (chat/message
  type normalisation, member roles, reactions, attachment de-duplication, read
  receipts).
* `tests/pipeline.test.mjs` — spins up a **local mock of the PostgREST API** and
  runs the real scripts end to end: export → import (`--dry-run`) → reconcile
  (pass) → reconcile (fail on a dropped message). No network, no credentials.

> Implementation note: the pipeline test runs the child scripts with the
> **async** `execFile`, not `execFileSync`. The mock server lives in the test
> process, so a synchronous spawn would block that process's event loop and the
> mock could never answer the child's HTTP requests — deadlocking the test.

---

## 6. Safety properties

* **Read-only source.** The export only issues `GET`s; the service-role key is
  never persisted.
* **No re-keying.** Original ids and timestamps are preserved verbatim.
* **Idempotent.** `{ merge: true }` keyed on the original id makes re-runs safe.
* **Fail-closed.** The importer validates integrity before writing; the reconcile
  gate exits non-zero on any divergence.
* **Reversible.** `export-firestore.mjs` can recover Firestore-only writes so the
  release can be rolled back to Supabase without data loss.
