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
| Calls | Media rides **LiveKit** (WebRTC SFU); the invite/ring/accept/hang-up handshake rides Supabase Realtime **broadcast** (`call:<callId>` for the per-call room, `call:user:<userId>` for a user's invite inbox). The only Edge Function involved is `livekit-token`, which mints the room-scoped access token. |

### 1.2 Bugs found (fixed)

| # | Symptom | Root cause | Fix |
| --- | --- | --- | --- |
| 1 | Media/avatar uploads returned `404 NoSuchBucket` | The shipped build config pointed at a storage bucket named `media`, which does not exist. The live buckets are `chat-media`, `avatars`, `voice-messages`. | **App:** bucket changed to `chat-media` (default in `core/network/build.gradle.kts` + `local.properties`). **DB:** migration creates `media` and the remaining buckets so any config works. |
| 2 | Push-token registration returned `400` (`null value in column "device_id"`) | The app wrote to the `device_tokens` **view**, which did not expose `device_id` — a `NOT NULL` column on the underlying `user_devices` table. | **App:** writes go straight to `user_devices` with `device_id` + `push_token`. **DB:** migration repairs the view and adds an `INSTEAD OF` trigger so legacy clients still work. |
| 3 | Group creation returned `400` (`invalid input syntax for type uuid`) | `IdGenerator.newConversationId()` produced `grp_<uuid>`, but `groups.id` is a `uuid` column (`chats.id` is `text`). | **App:** ids are now bare UUIDs, valid for both tables. |
| 4 | Storage RLS would reject uploads once enforced | The shipped policy scoped writes to path **segment 2**, while the client writes `<userId>/<file>` (**segment 1**). | **App:** upload path is now prefixed with the *sender's* user id. **DB:** migration installs segment-1 policies. |
| 5 | New signups showed the email local-part as their display name | The `handle_new_profile()` trigger only read the `name` / `full_name` metadata keys, but the app sends `data: { display_name: <name> }`. | **DB:** migration replaces `handle_new_profile()` so it prefers `raw_user_meta_data->>'display_name'`. |

---

## 2. Applying the database migration

> **STATUS: ✅ ALREADY APPLIED.** The migration in
> `supabase/migrations/20260925000100_backend_completion.sql` has been applied to
> the live project `fcjgbbmfqdkucfpqjxae` and verified end-to-end (buckets, storage
> RLS, device registry, `device_tokens` view, realtime publication and the
> `handle_new_profile()` display-name fix). The steps below are kept for reference
> and for re-applying the (idempotent) migration to another environment.

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
Functions the app does not call (`livekit-token` expects `GET`; `ai-chat` expects a
populated `message` payload).

---

## 5. Deploying `livekit-token` (required for calling)

Calling is the one feature that needs a server-side secret: the **LiveKit API
secret** signs the room access token, and it must never be embedded in the APK.
The Android client therefore asks `livekit-token` for a short-lived, room-scoped
JWT instead of holding any LiveKit credential itself.

### 5.1 Set the secrets

Values come from the LiveKit Cloud project (Settings → Keys). They are
project-specific and must **not** be committed to the repository:

```bash
supabase secrets set \
  LIVEKIT_URL=wss://<your-project>.livekit.cloud \
  LIVEKIT_API_KEY=<api key> \
  LIVEKIT_API_SECRET=<api secret>
```

### 5.2 Optional: background incoming-call push

The Realtime invite only reaches a *running* app. To make a killed/backgrounded
device ring, `livekit-token` also sends a high-priority FCM data push to the
callee the moment the caller requests its token. This reuses the same Firebase
service-account secrets as `firebase-token`:

```bash
supabase secrets set \
  FIREBASE_PROJECT_ID=<project id> \
  FIREBASE_CLIENT_EMAIL=<service account email> \
  FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

When these are absent the function still mints tokens; only the background ring
is skipped (foreground calls keep working over Realtime).

### 5.3 Deploy

```bash
supabase functions deploy livekit-token --no-verify-jwt
```

`--no-verify-jwt` is required because the function performs its own Supabase
session check against `/auth/v1/user` (the same pattern as `firebase-token`).

### 5.4 What the function enforces

1. A valid Supabase session is required (`401` otherwise).
2. A caller may only request a token for **its own** user id (`403` otherwise).
3. The room must be `call_<callId>`, the call row must exist, and the caller must
   be its `caller_id`, `callee_id` or a listed `participant_ids` entry
   (`403` / `404` otherwise).
4. The call must still be live (`calling` / `ringing` / `connected` /
   `connecting`) and less than 120 seconds old, so an abandoned ring cannot leave
   a permanently joinable room (`409` otherwise).

The minted token is scoped to exactly one room (`video.room`), so it cannot be
replayed against any other call.


---

## 6. Call lifecycle RPCs (reproducibility fix)

Outbound calling is driven by three Postgres functions that were originally
shipped as an **out-of-band repair script** (`supabase/repairs/call_lifecycle.sql`)
and applied straight to the live project. They worked in production, but they
were never captured as a migration — so a database provisioned from
`supabase/migrations/*` alone was missing `gaga_create_call`, and every outbound
call failed with a PostgREST `404 PGRST202` ("function not found").

That gap is now closed by
`supabase/migrations/20261013000000_call_lifecycle_rpcs.sql`, which recreates the
functions idempotently. The migration chain now yields the exact schema the live
project runs.

| Function | Purpose | Caller |
| --- | --- | --- |
| `gaga_create_call(p_chat_id, p_callee_id, p_type, p_caller_id, p_request_id)` | Atomically create a call: locks both participants (advisory locks), validates chat membership / block state / user existence, replays an existing `request_id`, enforces the busy check, then inserts `call_history` + `call_signaling`. Returns `{call_id, room_id, status, ...}` or `{error}`. | `service_role` only (the `create-call` Edge Function) |
| `gaga_touch_call(p_call_id)` | Marks a call `connected` and refreshes `last_heartbeat_at`. Participant-only. | `authenticated` |
| `gaga_finish_call(p_call_id, p_status, p_duration_seconds)` | Terminal transition (`ended`/`declined`/`missed`/`cancelled`/`timeout`/`busy`/`failed`), participant-only, duration clamped to `[0, 86400]`s. | `authenticated` |

The migration also adds `call_history.last_heartbeat_at` (the column the busy
check reads) and issues `notify pgrst, 'reload schema'` so the new signatures are
immediately callable over the Data API.

### Verify

```sql
select proname, pg_get_function_identity_arguments(oid) as args
from pg_proc where proname in ('gaga_create_call','gaga_touch_call','gaga_finish_call')
order by proname;
```

---

## 7. `send-fcm-push` (background push dispatcher)

`send-fcm-push` is the single server-side place that turns a server event (an
incoming call, a new message) into Firebase Cloud Messaging pushes for every
device a recipient has registered in `public.user_devices`. Like the call RPCs,
it was previously **deployed out-of-band but missing from the repository**; the
source now lives in `supabase/functions/send-fcm-push/`.

It is **service-role only**: callers must present the Supabase service-role key
in the `Authorization`/`apikey` header, so the public Data API can never reach
it. The `create-call` function calls it with exactly those headers after it has
authenticated the caller.

```
POST { user_id, type, title?, body?, data?, event_id? }
     Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
```

It mints an FCM OAuth2 access token from the Firebase service account (RS256
JWT), caches it until expiry, loads the recipient's `push_token`s, and sends FCM
HTTP v1 messages on channel `gaga_calls` (calls) or `gaga_messages` (messages)
with `android.priority=high`. It returns `{sent, failed, devices}`.

### Deploy

```bash
supabase functions deploy send-fcm-push --no-verify-jwt
```

`--no-verify-jwt` is required because the function performs its own service-role
check. It reuses the same Firebase secrets as `firebase-token` / `livekit-token`:

```bash
supabase secrets set \
  FIREBASE_PROJECT_ID=oumagachat \
  FIREBASE_CLIENT_EMAIL=<service account email> \
  FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### Test

```bash
node --test supabase/functions/send-fcm-push/tests/push.test.mjs
```

The suite asserts the service-role gate (`401`), method guard (`405`), payload
validation (`400`), the zero-device path (`200 {sent:0,failed:0,devices:0}`) and
the CORS preflight (`204`). It runs in CI alongside the `livekit-token` and
`create-call` suites.
