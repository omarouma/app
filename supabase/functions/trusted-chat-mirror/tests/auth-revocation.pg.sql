\set ON_ERROR_STOP on
-- Ephemeral PostgreSQL 17 CI only; preflight.pg.sql created synthetic users.
-- This migration is source-only and must not be applied to live GaGa here.
\i supabase/migrations/20261020142000_mirror_active_auth_membership.sql

-- Exact service-role principal required, even if scalar legacy says service.
select set_config('request.jwt.claim.role','service_role',false);
select set_config('request.jwt.claims','{"role":"authenticated"}',false);
do $auth_denied$
begin
  perform public.gaga_mirror_authorized_chat('preflight-clean');
  raise exception 'Unauthorized projection RPC exposed to authenticated user';
exception when insufficient_privilege then null;
end
$auth_denied$;

select set_config('request.jwt.claims','{"role":"service_role"}',false);
do $mirror_off$
begin
  perform public.gaga_mirror_authorized_chat('preflight-clean');
  raise exception 'Disabled mirror still exposed eligible participants';
exception when insufficient_privilege then null;
end
$mirror_off$;
update gaga_private.firebase_mirror_settings
set enabled=true, updated_at=now() where singleton=true;
do $auth_before$
declare r record;
begin
  select * into r from public.gaga_mirror_authorized_chat('preflight-clean');
  if r.id <> 'preflight-clean' or
     r.participants <> array[
       '11111111-1111-4111-8111-111111111111',
       '22222222-2222-4222-8222-222222222222']::text[] then
    raise exception 'Valid active chat membership changed unexpectedly';
  end if;
  -- The 4444 identity never existed in auth.users, although public.chats
  -- still lists it: it MUST NOT appear in an authorized Firebase projection.
  select * into r from public.gaga_mirror_authorized_chat('preflight-orphan');
  if r.participants <> array['11111111-1111-4111-8111-111111111111']::text[] then
    raise exception 'Orphan Supabase Auth membership leaked to Firebase';
  end if;
end
$auth_before$;

-- Trigger-driven revocation, with old chat rows deliberately retained.
update auth.users set deleted_at=now()
where id='22222222-2222-4222-8222-222222222222';
do $auth_soft_deleted$
declare r record;
begin
  select * into r from public.gaga_mirror_authorized_chat('preflight-clean');
  if r.participants <> array['11111111-1111-4111-8111-111111111111']::text[] then
    raise exception 'Soft-deleted Auth user retained Firebase access';
  end if;
  if not exists (
    select 1 from gaga_private.firebase_chat_sync_outbox
    where chat_id='preflight-clean'
  ) then
    raise exception 'Soft deletion did not enqueue Firebase membership revocation';
  end if;
end
$auth_soft_deleted$;

delete from auth.users
where id='11111111-1111-4111-8111-111111111111';
do $auth_deleted$
declare r record;
begin
  select * into r from public.gaga_mirror_authorized_chat('preflight-clean');
  if r.participants <> array[]::text[] then
    raise exception 'Hard-deleted Auth account remains Firestore member';
  end if;
  if not exists (
    select 1 from gaga_private.firebase_chat_sync_outbox
    where chat_id='preflight-orphan'
  ) then
    raise exception 'Hard deletion did not enqueue related orphan chat';
  end if;
end
$auth_deleted$;

-- Disabled outbox must stay disabled and not enqueue on further Auth changes.
update gaga_private.firebase_mirror_settings
set enabled=false, updated_at=now() where singleton=true;
truncate table gaga_private.firebase_chat_sync_outbox;
delete from auth.users where id='22222222-2222-4222-8222-222222222222';
do $auth_off$
begin
  if exists (select 1 from gaga_private.firebase_chat_sync_outbox) then
    raise exception 'Outbox disabled yet Auth deletion still enqueued';
  end if;
end
$auth_off$;

select 'active_auth_mirror_projection_and_deletion_outbox_pass' as result;
