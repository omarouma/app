-- SOURCE ONLY / STAGING FIRST. Requires the trusted Firebase mirror outbox
-- migration 20261020125000. Do NOT apply blindly to the live database.
-- Ensures a surviving Firebase identity cannot inherit stale chat access merely
-- because deleted Supabase Auth IDs remain in public.chats.participants.
--
-- Auth account existence, including soft-deletion status, is authoritative
-- for whether a member is eligible to appear in a Firestore projection.
-- The client never calls this function: RPC granted only to service_role.
create or replace function public.gaga_mirror_authorized_chat(p_chat_id text)
returns table (
  id text, type text, participants text[], updated_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), '')
  ) is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  -- Defense in depth: a misconfigured trusted caller must not provision
  -- membership before the staging operator explicitly enables the mirror.
  if not exists (
    select 1 from gaga_private.firebase_mirror_settings
    where singleton=true and enabled=true
  ) then
    raise exception 'firebase_mirror_disabled' using errcode='42501';
  end if;

  return query
  select
    c.id,
    c.type,
    array(
      select member.uid
      from unnest(c.participants) with ordinality as member(uid, pos)
      join auth.users au on au.id::text = lower(member.uid)
      where au.deleted_at is null
      order by member.pos
    )::text[],
    c.updated_at
  from public.chats c
  where c.id = p_chat_id;
end
$$;

revoke all on function public.gaga_mirror_authorized_chat(text)
  from public, anon, authenticated;
grant execute on function public.gaga_mirror_authorized_chat(text)
  to service_role;

-- A Firebase projection refresh must be scheduled when an Auth account is
-- deleted or soft-deleted, even if chat participants remain in legacy rows.
-- This does NOT delete or rewrite user chats, messages, or financial records.
-- It uses the already installed, disabled-by-default private outbox.
create or replace function gaga_private.enqueue_mirror_auth_revocation()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.deleted_at is not null or new.deleted_at is null then
      return new;
    end if;
  end if;

  if exists (
    select 1 from gaga_private.firebase_mirror_settings
    where singleton=true and enabled=true
  ) then
    insert into gaga_private.firebase_chat_sync_outbox as q
      (chat_id, revision, attempts, enqueued_at, next_attempt_at)
    select c.id, 1, 0, now(), now()
    from public.chats c
    where old.id::text = any(coalesce(c.participants, '{}'::text[]))
    on conflict (chat_id) do update
      set revision = q.revision+1,
          attempts = 0,
          enqueued_at = now(),
          next_attempt_at = now(),
          leased_until = null,
          lease_token = null,
          last_error_code = null;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

drop trigger if exists trg_gaga_mirror_auth_delete on auth.users;
create trigger trg_gaga_mirror_auth_delete
  after delete on auth.users
  for each row execute function gaga_private.enqueue_mirror_auth_revocation();

drop trigger if exists trg_gaga_mirror_auth_soft_delete on auth.users;
create trigger trg_gaga_mirror_auth_soft_delete
  after update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function gaga_private.enqueue_mirror_auth_revocation();
