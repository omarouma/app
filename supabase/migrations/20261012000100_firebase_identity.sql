-- ═══════════════════════════════════════════════════════════════════════════════
-- Firebase identity mapping + service-role bridges
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- This migration adds the server-owned record that ties a Firebase identity to a
-- GaGa user id (docs/FIREBASE_MIGRATION_PLAN.md §2), the push-dedup ledger, and
-- the service-role bridges that let Firebase-authenticated callers use the
-- existing Supabase call pipeline (which otherwise keys on auth.uid()).
--
-- It is IDEMPOTENT and additive: no existing table, row or policy is dropped.
-- The Supabase chat data stays intact until the migrated build passes the
-- release checklist.
-- ═══════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ─────────────────────────── 1. Identity mapping ───────────────────────────
create table if not exists public.gaga_identities (
  firebase_uid   text primary key,
  gaga_user_id   uuid not null unique,
  email          text,
  method         text not null default 'signup' check (method in ('signup', 'migrated', 'linked')),
  email_verified boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.gaga_identities enable row level security;
-- Service-role only: no client may ever read or write the mapping directly.
revoke all on public.gaga_identities from public, anon, authenticated;
grant all on public.gaga_identities to service_role;

create index if not exists gaga_identities_user_idx  on public.gaga_identities (gaga_user_id);
create index if not exists gaga_identities_email_idx on public.gaga_identities (lower(email));

-- ─────────────────────────── 2. Push delivery dedup ───────────────────────────
create table if not exists public.push_deliveries (
  event_id   text primary key,
  user_id    uuid,
  kind       text,
  created_at timestamptz not null default now()
);
alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from public, anon, authenticated;
grant all on public.push_deliveries to service_role;
create index if not exists push_deliveries_created_idx on public.push_deliveries (created_at desc);

-- ─────────────────────────── 3. call_history additive columns ───────────────────────────
alter table public.call_history add column if not exists request_id uuid;
alter table public.call_history add column if not exists room_id text;
create unique index if not exists gaga_call_request_id_idx
  on public.call_history (request_id) where request_id is not null;

-- ─────────────────────────── 4. Identity RPCs (service-role only) ───────────────────────────

-- Brand-new Firebase signup: mint a fresh GaGa user id. Never consults email.
create or replace function gaga_private.register_identity(
  p_firebase_uid text,
  p_email text,
  p_email_verified boolean,
  p_display_name text,
  p_username text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_username text;
  v_display text;
begin
  if p_firebase_uid is null or length(p_firebase_uid) not between 1 and 128 then
    return jsonb_build_object('error', 'INVALID_FIREBASE_UID');
  end if;

  -- Idempotent: an existing mapping always wins.
  select gaga_user_id into v_uid from public.gaga_identities where firebase_uid = p_firebase_uid;
  if found then
    return jsonb_build_object('gaga_user_id', v_uid, 'existing', true);
  end if;

  v_uid := gen_random_uuid();
  v_display := coalesce(
    nullif(trim(p_display_name), ''),
    nullif(split_part(coalesce(p_email, ''), '@', 1), ''),
    'GaGa User'
  );
  v_username := lower(regexp_replace(coalesce(nullif(trim(p_username), ''), v_display), '[^a-zA-Z0-9]', '', 'g'));
  if v_username is null or length(v_username) < 3 then v_username := 'user'; end if;
  v_username := left(v_username, 20) || '_' || substr(replace(v_uid::text, '-', ''), 1, 6);

  while exists (select 1 from public.users where lower(username) = lower(v_username)) loop
    v_username := left(v_username, 20) || '_' || substr(md5(random()::text), 1, 6);
  end loop;

  insert into public.users (id, email, name, display_name, username, created_at)
    values (v_uid, p_email, v_display, v_display, v_username, now())
    on conflict (id) do nothing;
  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;

  insert into public.gaga_identities (firebase_uid, gaga_user_id, email, method, email_verified)
    values (p_firebase_uid, v_uid, p_email, 'signup', coalesce(p_email_verified, false));

  return jsonb_build_object(
    'gaga_user_id', v_uid,
    'username', v_username,
    'display_name', v_display,
    'existing', false
  );
end $$;

-- Link an EXISTING GaGa account to a Firebase account. The caller must have
-- proven control of both (the edge function verifies the Firebase ID token AND
-- a legacy Supabase session). Conflicts are rejected, never merged.
create or replace function gaga_private.link_identity(
  p_firebase_uid text,
  p_gaga_user_id uuid,
  p_email text,
  p_email_verified boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_existing uuid;
begin
  if p_firebase_uid is null or p_gaga_user_id is null then
    return jsonb_build_object('error', 'INVALID_ARGUMENT');
  end if;

  if not exists (select 1 from public.users where id = p_gaga_user_id) then
    return jsonb_build_object('error', 'LEGACY_USER_NOT_FOUND');
  end if;

  select gaga_user_id into v_existing from public.gaga_identities where firebase_uid = p_firebase_uid;
  if found then
    if v_existing = p_gaga_user_id then
      return jsonb_build_object('gaga_user_id', v_existing, 'existing', true);
    end if;
    return jsonb_build_object('error', 'IDENTITY_CONFLICT');
  end if;

  if exists (select 1 from public.gaga_identities where gaga_user_id = p_gaga_user_id) then
    return jsonb_build_object('error', 'IDENTITY_CONFLICT');
  end if;

  insert into public.gaga_identities (firebase_uid, gaga_user_id, email, method, email_verified)
    values (p_firebase_uid, p_gaga_user_id, p_email, 'migrated', coalesce(p_email_verified, false));

  return jsonb_build_object('gaga_user_id', p_gaga_user_id, 'existing', false);
end $$;

create or replace function gaga_private.get_identity(p_firebase_uid text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object(
      'gaga_user_id', gaga_user_id,
      'email', email,
      'email_verified', email_verified,
      'method', method
    ) from public.gaga_identities where firebase_uid = p_firebase_uid),
    'null'::jsonb
  )
$$;

-- ─────────────────────────── 5. Service-role call bridges ───────────────────────────
-- These take the caller explicitly (instead of auth.uid()) so a Firebase token
-- — which Supabase cannot see — still drives the existing call pipeline.

create or replace function gaga_private.can_call_service(caller uuid, callee uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select caller is not null and callee is not null and caller <> callee
    and gaga_private.call_allowed(caller, callee)
$$;

create or replace function gaga_private.validate_call_service(
  call_id uuid, caller uuid, incoming boolean
) returns boolean language sql stable security definer set search_path = '' as $$
  select caller is not null and exists (
    select 1 from public.call_history h
    where h.id = call_id
      and (case when incoming then h.callee_id = caller else caller in (h.caller_id, h.callee_id) end)
      and (not incoming or h.status in ('calling', 'ringing', 'connecting'))
      and gaga_private.call_allowed(h.caller_id, h.callee_id)
      and (
        (h.status in ('calling', 'ringing', 'connecting', 'accepted') and h.created_at > now() - interval '2 minutes')
        or (h.status in ('connected', 'reconnecting') and h.created_at > now() - interval '24 hours')
      )
  )
$$;

create or replace function gaga_private.create_call_service(
  p_chat_id text,
  p_callee_id uuid,
  p_type text,
  p_caller_id uuid,
  p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row public.call_history%rowtype;
  v_id uuid;
  v_room text;
  v_type text;
begin
  if p_caller_id is null or p_callee_id is null then
    return jsonb_build_object('error', 'INVALID_CALL_REQUEST');
  end if;
  if p_caller_id = p_callee_id then
    return jsonb_build_object('error', 'CANNOT_CALL_SELF');
  end if;
  v_type := case when p_type = 'audio' then 'voice' else p_type end;
  if v_type not in ('voice', 'video') then
    return jsonb_build_object('error', 'INVALID_CALL_REQUEST');
  end if;

  -- Idempotency: a retried request returns the same call without re-ringing.
  if p_request_id is not null then
    select * into v_row from public.call_history where request_id = p_request_id;
    if found then
      return jsonb_build_object(
        'call_id', v_row.id,
        'room_id', coalesce(v_row.room_id, 'gaga_call_' || replace(v_row.id::text, '-', '')),
        'call_type', v_row.type,
        'caller_id', v_row.caller_id,
        'callee_id', v_row.callee_id,
        'replayed', true
      );
    end if;
  end if;

  if p_chat_id is not null and p_chat_id <> '' then
    if not exists (
      select 1 from public.chats c
      where c.id = p_chat_id
        and p_caller_id::text = any (c.participants)
        and p_callee_id::text = any (c.participants)
    ) then
      return jsonb_build_object('error', 'NOT_CHAT_MEMBERS');
    end if;
  end if;

  if not gaga_private.call_allowed(p_caller_id, p_callee_id) then
    return jsonb_build_object('error', 'BLOCKED');
  end if;

  if exists (
    select 1 from public.call_history h
    where h.status in ('calling', 'ringing', 'connecting', 'connected', 'reconnecting')
      and ((h.caller_id = p_caller_id and h.callee_id = p_callee_id)
        or (h.caller_id = p_callee_id and h.callee_id = p_caller_id))
      and h.created_at > now() - interval '2 minutes'
  ) then
    return jsonb_build_object('error', 'BUSY');
  end if;

  v_id := gen_random_uuid();
  v_room := 'gaga_call_' || replace(v_id::text, '-', '');
  insert into public.call_history
    (id, caller_id, callee_id, participant_ids, chat_id, type, status, room_id, request_id, created_at)
    values
    (v_id, p_caller_id, p_callee_id, array[p_caller_id::text, p_callee_id::text],
     nullif(p_chat_id, ''), v_type, 'ringing', v_room, p_request_id, now());

  return jsonb_build_object(
    'call_id', v_id,
    'room_id', v_room,
    'call_type', v_type,
    'caller_id', p_caller_id,
    'callee_id', p_callee_id,
    'replayed', false
  );
end $$;

-- ─────────────────────────── 6. Grants (service-role only) ───────────────────────────
revoke all on function gaga_private.register_identity(text, text, boolean, text, text) from public, anon, authenticated;
revoke all on function gaga_private.link_identity(text, uuid, text, boolean) from public, anon, authenticated;
revoke all on function gaga_private.get_identity(text) from public, anon, authenticated;
revoke all on function gaga_private.can_call_service(uuid, uuid) from public, anon, authenticated;
revoke all on function gaga_private.validate_call_service(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function gaga_private.create_call_service(text, uuid, text, uuid, uuid) from public, anon, authenticated;

grant execute on function gaga_private.register_identity(text, text, boolean, text, text) to service_role;
grant execute on function gaga_private.link_identity(text, uuid, text, boolean) to service_role;
grant execute on function gaga_private.get_identity(text) to service_role;
grant execute on function gaga_private.can_call_service(uuid, uuid) to service_role;
grant execute on function gaga_private.validate_call_service(uuid, uuid, boolean) to service_role;
grant execute on function gaga_private.create_call_service(text, uuid, text, uuid, uuid) to service_role;

-- ─────────────────────────── 7. Media authorization helper ───────────────────────────
-- One authoritative membership predicate the media-auth function can call.
create or replace function gaga_private.is_chat_member(p_user uuid, p_chat text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and p_chat is not null and exists (
    select 1 from public.chats c
    where c.id = p_chat and p_user::text = any (c.participants)
  )
$$;
revoke all on function gaga_private.is_chat_member(uuid, text) from public, anon, authenticated;
grant execute on function gaga_private.is_chat_member(uuid, text) to service_role;

-- ─────────────────────────── 8. Public wrappers (service-role only) ───────────────────────────
-- PostgREST only exposes the `public` schema, so these thin SECURITY INVOKER
-- wrappers are the callable surface. They are executable ONLY by service_role.
create or replace function public.gaga_register_identity(
  p_firebase_uid text, p_email text, p_email_verified boolean, p_display_name text, p_username text
) returns jsonb language sql security invoker set search_path = '' as $$
  select gaga_private.register_identity(p_firebase_uid, p_email, p_email_verified, p_display_name, p_username)
$$;

create or replace function public.gaga_link_identity(
  p_firebase_uid text, p_gaga_user_id uuid, p_email text, p_email_verified boolean
) returns jsonb language sql security invoker set search_path = '' as $$
  select gaga_private.link_identity(p_firebase_uid, p_gaga_user_id, p_email, p_email_verified)
$$;

create or replace function public.gaga_get_identity(p_firebase_uid text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select gaga_private.get_identity(p_firebase_uid)
$$;

create or replace function public.gaga_can_call_service(caller uuid, callee uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select gaga_private.can_call_service(caller, callee)
$$;

create or replace function public.gaga_validate_call_service(call_id uuid, caller uuid, incoming boolean)
returns boolean language sql stable security invoker set search_path = '' as $$
  select gaga_private.validate_call_service(call_id, caller, incoming)
$$;

create or replace function public.gaga_create_call_service(
  p_chat_id text, p_callee_id uuid, p_type text, p_caller_id uuid, p_request_id uuid
) returns jsonb language sql security invoker set search_path = '' as $$
  select gaga_private.create_call_service(p_chat_id, p_callee_id, p_type, p_caller_id, p_request_id)
$$;

create or replace function public.gaga_is_chat_member(p_user uuid, p_chat text) returns boolean
language sql stable security invoker set search_path = '' as $$
  select gaga_private.is_chat_member(p_user, p_chat)
$$;

revoke all on function public.gaga_register_identity(text, text, boolean, text, text) from public, anon, authenticated;
revoke all on function public.gaga_link_identity(text, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.gaga_get_identity(text) from public, anon, authenticated;
revoke all on function public.gaga_can_call_service(uuid, uuid) from public, anon, authenticated;
revoke all on function public.gaga_validate_call_service(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.gaga_create_call_service(text, uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.gaga_is_chat_member(uuid, text) from public, anon, authenticated;

grant execute on function public.gaga_register_identity(text, text, boolean, text, text) to service_role;
grant execute on function public.gaga_link_identity(text, uuid, text, boolean) to service_role;
grant execute on function public.gaga_get_identity(text) to service_role;
grant execute on function public.gaga_can_call_service(uuid, uuid) to service_role;
grant execute on function public.gaga_validate_call_service(uuid, uuid, boolean) to service_role;
grant execute on function public.gaga_create_call_service(text, uuid, text, uuid, uuid) to service_role;
grant execute on function public.gaga_is_chat_member(uuid, text) to service_role;
