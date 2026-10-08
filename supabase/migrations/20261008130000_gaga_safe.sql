-- GaGa Safe (Signature Features 2.3): emergency contacts + timed check-ins.
--
-- Additive only: existing chat, location and daily-life rows are untouched.
-- Every row here is private to its owner. Escalation is opt-in (the owner must
-- have created the check-in) and time-bounded; nothing fires on its own.
-- Re-runnable: every object is created with IF NOT EXISTS or dropped first.

-- ---------------------------------------------------------------------------
-- Emergency / trusted contacts
-- ---------------------------------------------------------------------------
create table if not exists public.gaga_safety_contacts (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  phone text not null default '' check (length(phone) <= 32),
  contact_id uuid references auth.users(id) on delete set null,
  priority int not null default 0 check (priority between 0 and 100),
  created_at timestamptz not null default now(),
  -- A contact must be reachable either in-app (contact_id) or by phone.
  check (contact_id is not null or length(btrim(phone)) > 0)
);
create index if not exists gaga_safety_contacts_owner
  on public.gaga_safety_contacts(owner_id, priority, created_at);
alter table public.gaga_safety_contacts enable row level security;
revoke all on public.gaga_safety_contacts from anon, authenticated;
grant select, insert, delete on public.gaga_safety_contacts to authenticated;
grant update(name, phone, contact_id, priority) on public.gaga_safety_contacts to authenticated;

drop policy if exists safety_contacts_select on public.gaga_safety_contacts;
create policy safety_contacts_select on public.gaga_safety_contacts
  for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists safety_contacts_insert on public.gaga_safety_contacts;
create policy safety_contacts_insert on public.gaga_safety_contacts
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists safety_contacts_update on public.gaga_safety_contacts;
create policy safety_contacts_update on public.gaga_safety_contacts
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
drop policy if exists safety_contacts_delete on public.gaga_safety_contacts;
create policy safety_contacts_delete on public.gaga_safety_contacts
  for delete to authenticated using (owner_id = (select auth.uid()));
drop policy if exists safety_contacts_session on public.gaga_safety_contacts;
create policy safety_contacts_session on public.gaga_safety_contacts
  as restrictive to authenticated
  using (gaga_private.session_active()) with check (gaga_private.session_active());

-- ---------------------------------------------------------------------------
-- Timed check-ins ("Check on me in 30 min")
-- ---------------------------------------------------------------------------
create table if not exists public.gaga_safety_checkins (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 160),
  due_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','safe','escalated','cancelled')),
  chat_id text,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists gaga_safety_checkins_owner
  on public.gaga_safety_checkins(owner_id, due_at desc, id);
create index if not exists gaga_safety_checkins_pending
  on public.gaga_safety_checkins(due_at) where status = 'pending';
alter table public.gaga_safety_checkins enable row level security;
revoke all on public.gaga_safety_checkins from anon, authenticated;
grant select, insert, delete on public.gaga_safety_checkins to authenticated;
-- Status transitions go through the RPCs below; the client never writes status.
grant update(label, due_at, chat_id) on public.gaga_safety_checkins to authenticated;

drop policy if exists safety_checkins_select on public.gaga_safety_checkins;
create policy safety_checkins_select on public.gaga_safety_checkins
  for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists safety_checkins_insert on public.gaga_safety_checkins;
create policy safety_checkins_insert on public.gaga_safety_checkins
  for insert to authenticated with check (owner_id = (select auth.uid()) and status = 'pending');
drop policy if exists safety_checkins_update on public.gaga_safety_checkins;
create policy safety_checkins_update on public.gaga_safety_checkins
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
drop policy if exists safety_checkins_delete on public.gaga_safety_checkins;
create policy safety_checkins_delete on public.gaga_safety_checkins
  for delete to authenticated using (owner_id = (select auth.uid()));
drop policy if exists safety_checkins_session on public.gaga_safety_checkins;
create policy safety_checkins_session on public.gaga_safety_checkins
  as restrictive to authenticated
  using (gaga_private.session_active()) with check (gaga_private.session_active());

-- ---------------------------------------------------------------------------
-- Resolve a check-in ("I reached safely" / cancel)
-- ---------------------------------------------------------------------------
create or replace function public.gaga_safety_resolve(checkin_id uuid, new_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.gaga_safety_checkins;
begin
  if auth.uid() is null or not gaga_private.session_active() then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if new_status not in ('safe','cancelled') then
    raise exception 'Unsupported status';
  end if;
  select * into c from public.gaga_safety_checkins s
    where s.id = checkin_id and s.owner_id = auth.uid() for update;
  if not found then
    raise exception 'Check-in unavailable' using errcode = '42501';
  end if;
  if c.status <> 'pending' then
    return; -- already resolved; idempotent
  end if;
  update public.gaga_safety_checkins s
    set status = new_status
    where s.id = c.id;
end $$;
revoke all on function public.gaga_safety_resolve(uuid,text) from public, anon;
grant execute on function public.gaga_safety_resolve(uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Escalate an expired check-in (owner-triggered or device worker).
-- Only the owner can escalate, only a pending check-in past its due time, and
-- only once. GaGa-user contacts receive a notification row; phone-only contacts
-- are surfaced to the owner to call manually (GaGa never auto-dials).
-- ---------------------------------------------------------------------------
create or replace function public.gaga_safety_escalate(checkin_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.gaga_safety_checkins;
  contact record;
begin
  if auth.uid() is null or not gaga_private.session_active() then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  select * into c from public.gaga_safety_checkins s
    where s.id = checkin_id and s.owner_id = auth.uid() for update;
  if not found then
    raise exception 'Check-in unavailable' using errcode = '42501';
  end if;
  if c.status <> 'pending' or c.due_at > now() then
    return; -- nothing to escalate
  end if;
  update public.gaga_safety_checkins s
    set status = 'escalated', notified_at = now()
    where s.id = c.id;
  -- Notify GaGa-user contacts. Each insert is isolated in its own subtransaction
  -- so a notification problem can never roll back the escalation above. The
  -- actor column is `from_id` on current schemas; we fall back to the legacy
  -- `actor_id` name so escalation still notifies on older deployments.
  for contact in
    select contact_id from public.gaga_safety_contacts
      where owner_id = auth.uid() and contact_id is not null
  loop
    begin
      insert into public.notifications(user_id, type, title, body, from_id, data, created_at)
      values (
        contact.contact_id, 'safety_alert',
        'Safety check-in expired',
        'A GaGa Safe check-in was not confirmed on time.',
        c.owner_id,
        jsonb_build_object('checkin_id', c.id, 'owner_id', c.owner_id),
        now()
      );
    exception when others then
      begin
        insert into public.notifications(user_id, type, title, body, actor_id, data, created_at)
        values (
          contact.contact_id, 'safety_alert',
          'Safety check-in expired',
          'A GaGa Safe check-in was not confirmed on time.',
          c.owner_id,
          jsonb_build_object('checkin_id', c.id, 'owner_id', c.owner_id),
          now()
        );
      exception when others then null;
      end;
    end;
  end loop;
end $$;
revoke all on function public.gaga_safety_escalate(uuid) from public, anon;
grant execute on function public.gaga_safety_escalate(uuid) to authenticated;
