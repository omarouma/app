-- ============================================================================
-- GaGa Chat — Phase 4 Milestone A2
-- Identity mapping, DB constraints, indexes, idempotency, moderation audit
-- ----------------------------------------------------------------------------
-- Architecture: Firebase Spark (Auth + FCM) + Supabase (DB/Realtime/Storage)
-- This migration is IDEMPOTENT and safe to re-run.
--
-- Recon findings (live project fcjgbbmfqdkucfpqjxae) that shaped this file:
--   * users_username_key UNIQUE(username) already exists
--   * messages_sender_local_id_uq UNIQUE(sender_id, local_id) already exists
--   * check_message_rate_limit(sender_id) already exists (30 msg / 60s)
--   * security_events, reports, user_reports already exist
--   * public_profiles + device_tokens views already exist
--   * prevent_client_* guard functions already exist
-- So this migration only adds what is genuinely MISSING.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. IDENTITY MAPPING: firebase_uid <-> auth.users
-- ---------------------------------------------------------------------------
-- Supabase Auth remains the row owner (users.id -> auth.users.id ON DELETE
-- CASCADE). firebase_uid is a nullable, unique, secondary identity anchor so a
-- Firebase-authenticated client can be resolved to its Supabase row without
-- trusting a client-supplied id.
alter table public.users
  add column if not exists firebase_uid text;

comment on column public.users.firebase_uid is
  'Firebase Auth UID (Spark plan). Secondary identity anchor; users.id remains the Supabase auth.users FK.';

-- Unique only when present (legacy Supabase-only accounts have NULL).
create unique index if not exists users_firebase_uid_key
  on public.users (firebase_uid)
  where firebase_uid is not null;

-- Fast reverse lookup for the bridge / edge functions.
create index if not exists idx_users_firebase_uid
  on public.users (firebase_uid)
  where firebase_uid is not null;

-- ---------------------------------------------------------------------------
-- 2. IDENTITY RESOLUTION HELPER
-- ---------------------------------------------------------------------------
-- Resolves the caller's Supabase user id from either the Supabase JWT subject
-- or a Firebase UID. SECURITY DEFINER so RLS-protected reads work, but it only
-- ever returns the id of the *current* auth.uid() or an explicitly supplied
-- firebase uid that the caller already proved ownership of via Firebase.
create or replace function public.resolve_user_id(p_firebase_uid text default null)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    auth.uid(),
    (select u.id from public.users u
      where p_firebase_uid is not null
        and u.firebase_uid = p_firebase_uid
      limit 1)
  );
$function$;

revoke all on function public.resolve_user_id(text) from public;
grant execute on function public.resolve_user_id(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. DATA-INTEGRITY CHECK CONSTRAINTS (only where missing)
-- ---------------------------------------------------------------------------
-- messages.delivery_status — client-visible send lifecycle.
-- Values mirror src/lib/supabaseDb.ts + useMessageStore optimistic states.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'messages_delivery_status_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_delivery_status_check
      check (
        delivery_status is null
        or delivery_status in (
          'pending', 'sending', 'sent', 'delivered', 'read', 'failed', 'queued'
        )
      ) not valid;
  end if;
end $$;

-- messages.type — message kind.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'messages_type_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_type_check
      check (
        type is null
        or type in (
          'text', 'image', 'video', 'audio', 'voice', 'file', 'document',
          'location', 'contact', 'sticker', 'gif', 'system', 'call',
          'poll', 'link'
        )
      ) not valid;
  end if;
end $$;

-- users.friend_request_privacy / group_add_privacy — privacy enums.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_friend_request_privacy_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_friend_request_privacy_check
      check (
        friend_request_privacy is null
        or friend_request_privacy in ('everyone', 'contacts', 'nobody')
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'users_group_add_privacy_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_group_add_privacy_check
      check (
        group_add_privacy is null
        or group_add_privacy in ('everyone', 'contacts', 'nobody')
      ) not valid;
  end if;
end $$;

-- reports.severity / target_type — moderation taxonomy.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reports_severity_check'
      and conrelid = 'public.reports'::regclass
  ) then
    alter table public.reports
      add constraint reports_severity_check
      check (
        severity is null
        or severity in ('low', 'medium', 'high', 'critical')
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reports_target_type_check'
      and conrelid = 'public.reports'::regclass
  ) then
    alter table public.reports
      add constraint reports_target_type_check
      check (
        target_type is null
        or target_type in ('user', 'message', 'call', 'group', 'chat')
      ) not valid;
  end if;
end $$;

-- security_events.severity — audit taxonomy.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'security_events_severity_check'
      and conrelid = 'public.security_events'::regclass
  ) then
    alter table public.security_events
      add constraint security_events_severity_check
      check (
        severity is null
        or severity in ('info', 'low', 'medium', 'high', 'critical')
      ) not valid;
  end if;
end $$;

-- Validate the NOT VALID constraints now that they are declared. If legacy
-- rows violate them the statement raises and the constraint stays NOT VALID,
-- which is the desired fail-safe behaviour (no data is mutated).
do $$
declare
  c record;
begin
  for c in
    select conname, conrelid::regclass as tbl
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and not convalidated
      and conname in (
        'messages_delivery_status_check',
        'messages_type_check',
        'users_friend_request_privacy_check',
        'users_group_add_privacy_check',
        'reports_severity_check',
        'reports_target_type_check',
        'security_events_severity_check'
      )
  loop
    begin
      execute format('alter table %s validate constraint %I', c.tbl, c.conname);
      raise notice 'validated %', c.conname;
    exception when others then
      raise warning 'could not validate % (%): leaving NOT VALID', c.conname, sqlerrm;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. DROP REDUNDANT / DUPLICATE INDEXES
-- ---------------------------------------------------------------------------
-- These are exact duplicates of another index/constraint on the same columns.
-- They cost write throughput and disk for zero read benefit.
-- Some are backed by a UNIQUE CONSTRAINT, so the constraint must go first.
alter table public.typing          drop constraint if exists typing_chat_user_unique;
alter table public.typing          drop constraint if exists typing_chatid_userid_unique;
alter table public.presence        drop constraint if exists presence_userid_unique;
alter table public.presence        drop constraint if exists presence_user_id_unique;
alter table public.user_settings   drop constraint if exists user_settings_user_id_uq;

drop index if exists public.typing_chat_user_unique;
drop index if exists public.typing_chatid_userid_unique;
drop index if exists public.presence_userid_unique;
drop index if exists public.presence_user_id_unique;
drop index if exists public.user_settings_user_id_uq;
drop index if exists public.idx_presence_userid;       -- dup of idx_presence_user_id
drop index if exists public.idx_messages_chat_id;      -- dup of idx_messages_chat_created_at
drop index if exists public.idx_messages_chatid_ts;    -- dup of idx_messages_chat_created_at
drop index if exists public.call_history_callee_idx;   -- dup of idx_call_history_callee
drop index if exists public.call_history_caller_idx;   -- dup of idx_call_history_caller

-- ---------------------------------------------------------------------------
-- 5. INDEXES FOR HOT PATHS
-- ---------------------------------------------------------------------------
-- 5a. Conversation list: "my chats, newest activity first".
--     participants is a text[]/uuid[]; GIN already exists for membership.
--     This partial btree accelerates the ORDER BY after the GIN filter.
create index if not exists idx_chats_updated_desc
  on public.chats (updated_at desc nulls last);

-- 5b. Message pagination (keyset / cursor). The existing
--     idx_messages_chat_created_at covers (chat_id, created_at DESC); adding
--     id makes the cursor stable when timestamps collide.
create index if not exists idx_messages_chat_created_id
  on public.messages (chat_id, created_at desc, id desc);

-- 5c. Unread counts per chat (only unread rows are indexed).
create index if not exists idx_messages_unread_by_chat
  on public.messages (chat_id, sender_id)
  where read = false;

-- 5d. Contact / user lookup by display name (fuzzy) and by email.
create extension if not exists pg_trgm;

create index if not exists idx_users_display_name_trgm
  on public.users using gin (display_name gin_trgm_ops);

create index if not exists idx_users_email_lower
  on public.users (lower(email));

-- 5e. Call history: "my calls, newest first" across both roles.
create index if not exists idx_call_history_caller_created
  on public.call_history (caller_id, created_at desc);
create index if not exists idx_call_history_callee_created
  on public.call_history (callee_id, created_at desc);

-- 5f. Moderation queue.
create index if not exists idx_reports_status_created
  on public.reports (status, created_at desc);

-- 5g. Security/audit log scan.
create index if not exists idx_security_events_user_created
  on public.security_events (user_id, created_at desc);
create index if not exists idx_security_events_type_created
  on public.security_events (event_type, created_at desc);

-- 5h. Group membership reverse lookup (already has user_id + group_id btrees);
--     add a covering index for "my groups with role".
create index if not exists idx_group_members_user_role
  on public.group_members (user_id, role);

-- ---------------------------------------------------------------------------
-- 6. IDEMPOTENCY KEYS (generic, for Edge Functions + retried writes)
-- ---------------------------------------------------------------------------
create table if not exists public.idempotency_keys (
  key           text primary key,
  user_id       uuid references auth.users(id) on delete cascade,
  scope         text not null default 'default',
  request_hash  text,
  response      jsonb,
  created_at    timestamptz not null default timezone('utc', now()),
  expires_at    timestamptz not null default (timezone('utc', now()) + interval '24 hours')
);

comment on table public.idempotency_keys is
  'Generic idempotency ledger. Insert-first semantics: a duplicate key raises 23505 and the caller replays the stored response.';

create index if not exists idx_idempotency_keys_expires
  on public.idempotency_keys (expires_at);
create index if not exists idx_idempotency_keys_user
  on public.idempotency_keys (user_id, created_at desc);

alter table public.idempotency_keys enable row level security;

drop policy if exists "idempotency_keys_select_own" on public.idempotency_keys;
create policy "idempotency_keys_select_own"
  on public.idempotency_keys for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "idempotency_keys_insert_own" on public.idempotency_keys;
create policy "idempotency_keys_insert_own"
  on public.idempotency_keys for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "idempotency_keys_delete_own" on public.idempotency_keys;
create policy "idempotency_keys_delete_own"
  on public.idempotency_keys for delete
  to authenticated
  using (user_id = auth.uid());

-- Claim-or-replay helper. Returns the stored response when the key already
-- exists, otherwise records the key and returns NULL so the caller proceeds.
create or replace function public.claim_idempotency_key(
  p_key text,
  p_scope text default 'default',
  p_request_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_existing public.idempotency_keys%rowtype;
begin
  if p_key is null or length(p_key) < 8 then
    raise exception 'idempotency key too short' using errcode = '22023';
  end if;

  select * into v_existing
  from public.idempotency_keys
  where key = p_key;

  if found then
    if v_existing.expires_at < timezone('utc', now()) then
      delete from public.idempotency_keys where key = p_key;
    else
      return coalesce(v_existing.response, '{}'::jsonb);
    end if;
  end if;

  insert into public.idempotency_keys (key, user_id, scope, request_hash)
  values (p_key, auth.uid(), p_scope, p_request_hash)
  on conflict (key) do nothing;

  return null;
end;
$function$;

revoke all on function public.claim_idempotency_key(text, text, text) from public;
grant execute on function public.claim_idempotency_key(text, text, text) to authenticated;

-- Store the response for a previously claimed key.
create or replace function public.complete_idempotency_key(
  p_key text,
  p_response jsonb
)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.idempotency_keys
     set response = p_response
   where key = p_key
     and (user_id = auth.uid() or user_id is null);
$function$;

revoke all on function public.complete_idempotency_key(text, jsonb) from public;
grant execute on function public.complete_idempotency_key(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. MODERATION ACTIONS (audit trail for report handling)
-- ---------------------------------------------------------------------------
create table if not exists public.moderation_actions (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid references public.reports(id) on delete set null,
  actor_id     uuid references auth.users(id) on delete set null,
  target_user  uuid references auth.users(id) on delete set null,
  action       text not null,
  reason       text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default timezone('utc', now())
);

comment on table public.moderation_actions is
  'Immutable audit trail of moderation decisions (warn, mute, suspend, ban, dismiss).';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'moderation_actions_action_check'
      and conrelid = 'public.moderation_actions'::regclass
  ) then
    alter table public.moderation_actions
      add constraint moderation_actions_action_check
      check (action in (
        'dismiss', 'warn', 'mute', 'suspend', 'ban', 'unban',
        'delete_content', 'escalate', 'note'
      ));
  end if;
end $$;

create index if not exists idx_moderation_actions_report
  on public.moderation_actions (report_id, created_at desc);
create index if not exists idx_moderation_actions_target
  on public.moderation_actions (target_user, created_at desc);
create index if not exists idx_moderation_actions_actor
  on public.moderation_actions (actor_id, created_at desc);

alter table public.moderation_actions enable row level security;

-- Only admins may read the moderation trail. Writes go through SECURITY DEFINER
-- functions / the service role, never directly from a client.
drop policy if exists "moderation_actions_admin_read" on public.moderation_actions;
create policy "moderation_actions_admin_read"
  on public.moderation_actions for select
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 8. RLS HARDENING — make sure every new table is locked down
-- ---------------------------------------------------------------------------
-- idempotency_keys and moderation_actions have RLS enabled above with explicit
-- policies. Force RLS so table owners cannot bypass it accidentally.
alter table public.idempotency_keys force row level security;
alter table public.moderation_actions force row level security;

-- ---------------------------------------------------------------------------
-- 9. HOUSEKEEPING: expire old idempotency keys + stale typing rows
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_phase4_housekeeping()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  delete from public.idempotency_keys
   where expires_at < timezone('utc', now());

  delete from public.typing
   where updated_at < timezone('utc', now()) - interval '30 seconds';
end;
$function$;

revoke all on function public.cleanup_phase4_housekeeping() from public;

-- ---------------------------------------------------------------------------
-- 10. REFRESH PLANNER STATISTICS
-- ---------------------------------------------------------------------------
analyze public.users;
analyze public.messages;
analyze public.chats;
analyze public.call_history;
analyze public.group_members;
analyze public.reports;
