# Production Runtime Fixes — ChatRoom Crash + Supabase 400/403

## Objective

Fix three production runtime errors observed in the deployed app:

1. **React error #321** — ChatRoom crashed with "Rendered fewer hooks than expected".
2. **Supabase 403 Forbidden** — `PATCH /messages` (mark-as-read) blocked by RLS.
3. **Supabase 400 Bad Request** — `GET /users?id=eq...` (last-seen fetch) failed.

## Root Causes & Fixes

### 1. React error #321 — Nested hooks in `useChatEffects.ts` ✅
- **Cause:** `useRef()` and `useLayoutEffect()` were called *inside* a `useEffect()`
  callback (the "Friend status" effect). This violates the Rules of Hooks — React
  saw a different number of hooks across renders → "Rendered fewer hooks than
  expected" → ChatRoom error boundary crash.
- **Fix:** Moved the `useRef` + `useLayoutEffect` to the top level of the
  component, keeping the stable-ref pattern without nesting.

### 2. Supabase 403 — messages RLS blocked "mark as read" ✅
- **Cause:** The single `messages_chat_participant` policy was `FOR ALL` with
  `WITH CHECK (auth.uid()::text = sender_id AND ...)`. When a chat **recipient**
  marks a message as read, they are NOT the sender → `WITH CHECK` fails → **403**.
- **Fix:** Created `supabase_fix_messages_rls.sql` which splits into granular
  policies:
  - `messages_participant_select` — any chat participant can read.
  - `messages_participant_insert` — the sender inserting into their chat.
  - `messages_participant_update` — participants may flip read-state; senders
    may edit their own content.
  - `messages_participant_delete` — participants may delete (clear/leave).
- **Action required:** Run `supabase_fix_messages_rls.sql` in the Supabase SQL
  Editor once.

### 3. Supabase 400 — selecting non-existent `online` column ✅
- **Cause:** `useChatEffects.ts` queried `users` with `.select('last_seen, online')`.
  The `users` table has **no `online` column** (it uses the `status` text column),
  so PostgREST returned **400 Bad Request**.
- **Fix:** Changed the query to `.select('status, last_seen')` and read
  `status === 'online'` for presence (matching how `usePresence.ts` writes).

## Verification
- [x] `npx tsc -b --noEmit` → 0 errors.
- [x] `npm run build` → clean production build (`✓ built in 14.96s`).

## Deploy Note
The frontend fix is in the latest `dist/`. The RLS fix requires running
`supabase_fix_messages_rls.sql` in the Supabase SQL Editor before the
mark-as-read 403 is resolved server-side.

## Real-time Implementations Verified & Deployed
All real-time feature TODOs were reviewed and confirmed complete:
- ✅ `TODO_PROD_CHAT_REALTIME_FIX.md` — ChatRoom real-time + retry, deployed
- ✅ `TODO_REALTIME_CALL_FIX.md` — real-time call pipeline refactor, deployed
- ✅ `TODO_post_creation_realtime.md` — optimistic post creation real-time, deployed
- ✅ `TODO_PROD_CHAT_UX_IMPROVEMENTS.md` — chat input + delivery-status UX, deployed
- ✅ `CALLING_FIX_TRACKING.md` — full calling pipeline (Agora), deployed
- ✅ `CODE_FIX_TODO.md` — all 42 TS errors resolved, clean build

## Final Build & Deploy (realtime)
- [x] `npm run build` → `✓ built in 16.77s` (zero errors)
- [x] `firebase deploy --only hosting` → `Deploy complete!` → https://oumagachat.web.app
