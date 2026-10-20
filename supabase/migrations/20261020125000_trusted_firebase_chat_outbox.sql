-- STAGING-ONLY until security review, tested restore, Firebase IAM rotation.
-- GaGa Supabase -> Firebase Firestore membership projection outbox.
-- Supabase chats are authoritative; Firebase hybrid remains OFF by default.
-- This migration is NOT applied to production by committing it.
create schema if not exists gaga_private;

create table if not exists gaga_private.firebase_mirror_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into gaga_private.firebase_mirror_settings (singleton, enabled)
  values (true, false) on conflict (singleton) do nothing;

create table if not exists gaga_private.firebase_chat_sync_outbox (
  chat_id text primary key,
  revision bigint not null default 1 check (revision > 0),
  attempts integer not null default 0 check (attempts >= 0),
  enqueued_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  leased_until timestamptz,
  lease_token uuid,
  last_error_code text
);

create index if not exists firebase_chat_sync_outbox_due_idx
  on gaga_private.firebase_chat_sync_outbox (next_attempt_at, enqueued_at);

alter table gaga_private.firebase_chat_sync_outbox enable row level security;
alter table gaga_private.firebase_mirror_settings enable row level security;
revoke all on gaga_private.firebase_chat_sync_outbox from public, anon, authenticated;
revoke all on gaga_private.firebase_mirror_settings from public, anon, authenticated;

create or replace function gaga_private.enqueue_firebase_chat_sync()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_chat_id text := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  -- Fail CLOSED until an operator explicitly enables syncing in staging.
  if not exists (
    select 1 from gaga_private.firebase_mirror_settings
    where singleton = true and enabled = true
  ) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  insert into gaga_private.firebase_chat_sync_outbox
    (chat_id, revision, attempts, enqueued_at, next_attempt_at)
  values (v_chat_id, 1, 0, now(), now())
  on conflict (chat_id) do update
    set revision = gaga_private.firebase_chat_sync_outbox.revision + 1,
        attempts = 0,
        enqueued_at = now(),
        next_attempt_at = now(),
        leased_until = null,
        lease_token = null,
        last_error_code = null;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

drop trigger if exists trg_gaga_fire_chat_create on public.chats;
create trigger trg_gaga_fire_chat_create
  after insert on public.chats
  for each row execute function gaga_private.enqueue_firebase_chat_sync();

drop trigger if exists trg_gaga_fire_chat_membership on public.chats;
create trigger trg_gaga_fire_chat_membership
  after update of participants, type on public.chats
  for each row
  when (old.participants is distinct from new.participants
        or old.type is distinct from new.type)
  execute function gaga_private.enqueue_firebase_chat_sync();

drop trigger if exists trg_gaga_fire_chat_delete on public.chats;
create trigger trg_gaga_fire_chat_delete
  after delete on public.chats
  for each row execute function gaga_private.enqueue_firebase_chat_sync();

-- RPCs live in the exposed public schema solely so the Supabase Edge worker
-- can invoke them via PostgREST; service_role is the ONLY eligible principal.
create or replace function public.gaga_claim_chat_mirror_sync(p_limit integer default 8)
returns table (chat_id text, revision bigint, lease_token uuid)
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  if not exists (
    select 1 from gaga_private.firebase_mirror_settings
    where singleton = true and enabled = true
  ) then
    return;
  end if;
  return query
  with due as (
    select q.chat_id from gaga_private.firebase_chat_sync_outbox q
    where q.next_attempt_at <= now()
      and (q.leased_until is null or q.leased_until < now())
    order by q.next_attempt_at, q.enqueued_at
    for update skip locked
    limit least(greatest(coalesce(p_limit,8),1),10)
  )
  update gaga_private.firebase_chat_sync_outbox q
  set lease_token = gen_random_uuid(),
      leased_until = now() + interval '120 seconds',
      attempts = q.attempts + 1
  from due
  where q.chat_id = due.chat_id
  returning q.chat_id, q.revision, q.lease_token;
end
$$;

create or replace function public.gaga_finish_chat_mirror_sync(
  p_chat_id text, p_revision bigint, p_lease_token uuid,
  p_success boolean, p_error_code text default null
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  if p_success is true then
    delete from gaga_private.firebase_chat_sync_outbox q
      where q.chat_id=p_chat_id and q.revision=p_revision
        and q.lease_token=p_lease_token;
    return found;
  end if;
  update gaga_private.firebase_chat_sync_outbox q
    set leased_until = null,
        lease_token = null,
        next_attempt_at = now() + make_interval(
          secs => least(3600, (5 * power(2, least(q.attempts, 9)))::integer)
        ),
        last_error_code = case
          when p_error_code ~ '^[A-Z_]{3,64}$' then p_error_code
          else 'PROVISIONING_UNAVAILABLE'
        end
    where q.chat_id=p_chat_id and q.revision=p_revision
      and q.lease_token=p_lease_token;
  return found;
end
$$;

revoke all on function public.gaga_claim_chat_mirror_sync(integer)
  from public, anon, authenticated;
revoke all on function public.gaga_finish_chat_mirror_sync(text,bigint,uuid,boolean,text)
  from public, anon, authenticated;
grant execute on function public.gaga_claim_chat_mirror_sync(integer) to service_role;
grant execute on function public.gaga_finish_chat_mirror_sync(text,bigint,uuid,boolean,text)
  to service_role;
