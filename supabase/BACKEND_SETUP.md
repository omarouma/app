# GaGa Chat — Backend Setup & Completion

This document records the full end-to-end audit of the live Supabase backend
(`https://fcjgbbmfqdkucfpqjxae.supabase.co`) performed against every REST,
Auth, Storage and Realtime operation the native Android app performs, the bugs
that were found, and exactly how to finish the backend setup.

The audit is reproducible: run `backend_probe.sh` from the repository root. It
signs up two throwaway users and exercises every endpoint the app uses, printing
`OK`/`FAIL` per operation.

---

## 1. What the audit found

### 1.1 Working correctly (no action needed)

| Area | Result |
| --- | --- |
| GoTrue Auth (`/auth/v1`) | Healthy. Email signup enabled, `mailer_autoconfirm = true` (signup returns a session immediately), `disable_signup = false`. |
| `handle_new_user()` trigger | Auto-creates a `users` row on signup (id, name, username, status). |
| `users` upsert | **Works.** The app sends `on_conflict=id` + `Prefer: resolution=merge-duplicates`; the request returns `200`. (An earlier probe reported a 409 only because it omitted the `Prefer` header.) |
| `chats` insert / list / patch | Works. |
| `chats.find_direct` | **Works.** The `participants=cs.{a,b}` array-contains filter returns `200` when the braces are URL-encoded, which Ktor does automatically. (An earlier probe reported a 400 only because raw `{`/`}` were mangled by curl.) |
| `messages` insert / list / by `local_id` / read-receipt patch | Works. |
| `chat_reads`, `call_history`, `friendships`, `friend_requests`, `blocked_users`, `wallets`, `notifications`, `typing`, `presence` | All insert/read correctly. |
| Calls | Signalling rides Supabase Realtime **broadcast** (`call:<callId>`), so no Edge Function is required. |

### 1.2 Bugs found (fixed)

| # | Symptom | Root cause | Fix |
| --- | --- | --- | --- |
| 1 | Media/avatar uploads returned `404 NoSuchBucket` | The shipped build config pointed at a storage bucket named `media`, which does not exist. The live buckets are `chat-media`, `avatars`, `voice-messages`. | **App:** bucket changed to `chat-media` (default in `core/network/build.gradle.kts` + `local.properties`). **DB:** migration creates `media` and the remaining buckets so any config works. |
| 2 | Push-token registration returned `400` (`null value in column "device_id"`) | The app wrote to the `device_tokens` **view**, which did not expose `device_id` — a `NOT NULL` column on the underlying `user_devices` table. | **App:** writes go straight to `user_devices` with `device_id` + `push_token`. **DB:** migration repairs the view and adds an `INSTEAD OF` trigger so legacy clients still work. |
| 3 | Group creation returned `400` (`invalid input syntax for type uuid`) | `IdGenerator.newConversationId()` produced `grp_<uuid>`, but `groups.id` is a `uuid` column (`chats.id` is `text`). | **App:** ids are now bare UUIDs, valid for both tables. |
| 4 | Storage RLS would reject uploads once enforced | The shipped policy scoped writes to path **segment 2**, while the client writes `<userId>/<file>` (**segment 1**). | **App:** upload path is now prefixed with the *sender's* user id. **DB:** migration installs segment-1 policies. |

---

## 2. Applying the database migration

The migration is **idempotent** — it is safe to run repeatedly.

**File:** `supabase/migrations/20260925000100_backend_completion.sql`

### Option A — Supabase Dashboard (no CLI needed)

1. Open your project → **SQL Editor** → **New query**.
2. Paste the entire contents of `supabase/migrations/20260925000100_backend_completion.sql`.
3. Click **Run**.

### Option B — Supabase CLI

```bash
supabase link --project-ref fcjgbbmfqdkucfpqjxae
supabase db push
```

### Verify

```sql
SELECT id, public FROM storage.buckets ORDER BY id;
-- expect: avatars, chat-media, media, posts, reels, stories, voice-messages

SELECT * FROM public.device_tokens LIMIT 1;   -- should not error
SELECT indexname FROM pg_indexes WHERE tablename = 'user_devices';
-- expect: uq_user_devices_user_device
```

---

## 3. Android build configuration

The backend URL/key are injected into `BuildConfig` at build time. Resolution
order (see `core/network/build.gradle.kts`):

1. `-PSUPABASE_URL=...` / `-PSUPABASE_ANON_KEY=...` / `-PSUPABASE_STORAGE_BUCKET=...`
2. Environment variables of the same names
3. `local.properties`
4. Built-in defaults

> **Important:** `project.findProperty()` does **not** read `local.properties`.
> That is why the build script reads it explicitly. If `SUPABASE_URL` is empty
> the build prints a warning and every network call will fail.

`local.properties` for the live project:

```properties
sdk.dir=/path/to/android-sdk
SUPABASE_URL=https://fcjgbbmfqdkucfpqjxae.supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_STORAGE_BUCKET=chat-media
```

---

## 4. Re-running the audit

```bash
bash backend_probe.sh
```

Expected: every line prints `OK`. The only acceptable non-`OK` entries are Edge
Functions the app does not call (`zego-token` expects `GET`; `ai-chat` expects a
populated `message` payload).
