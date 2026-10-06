-- Additive Daily Life MVP. Existing chat, wallet and account rows are untouched.
create table public.gaga_daily_records (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('income','expense','lent','borrowed','reminder','note','goal','budget','account')),
  title text not null check (length(btrim(title)) between 1 and 160),
  amount_minor bigint not null default 0 check (amount_minor between 0 and 100000000000),
  paid_minor bigint not null default 0 check (paid_minor between 0 and amount_minor),
  currency text not null default 'BDT' check (currency in ('BDT','USD','CNY')),
  category text not null default 'Other' check (length(category) between 1 and 80),
  account text not null default 'Cash' check (length(account) between 1 and 80),
  note text not null default '' check (length(note) <= 4000),
  happened_at timestamptz not null default now(),
  due_at timestamptz,
  completed boolean not null default false,
  source_chat text,
  source_message text,
  created_at timestamptz not null default now(),
  check (kind in ('reminder','note') or amount_minor > 0),
  check (kind <> 'reminder' or due_at is not null)
);
create index gaga_daily_owner_date on public.gaga_daily_records(owner_id,happened_at desc,id);
alter table public.gaga_daily_records enable row level security;
revoke all on public.gaga_daily_records from anon,authenticated;
grant select,insert,delete on public.gaga_daily_records to authenticated;
grant update(title,amount_minor,currency,category,account,note,happened_at,due_at,completed) on public.gaga_daily_records to authenticated;
create policy daily_select on public.gaga_daily_records for select to authenticated using (owner_id=(select auth.uid()));
create policy daily_insert on public.gaga_daily_records for insert to authenticated with check (owner_id=(select auth.uid()) and paid_minor=0);
create policy daily_update on public.gaga_daily_records for update to authenticated using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()));
create policy daily_delete on public.gaga_daily_records for delete to authenticated using (owner_id=(select auth.uid()));
create policy daily_active_session on public.gaga_daily_records as restrictive to authenticated using (gaga_private.session_active()) with check (gaga_private.session_active());

create function gaga_private.daily_record_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if old.paid_minor > 0 and (new.currency <> old.currency or new.amount_minor <> old.amount_minor) then
    raise exception 'Amount and currency cannot change after a repayment or contribution';
  end if;
  return new;
end $$;
revoke all on function gaga_private.daily_record_guard() from public,anon,authenticated;
create trigger gaga_daily_record_guard before update on public.gaga_daily_records for each row execute function gaga_private.daily_record_guard();

create table public.gaga_daily_contributions (
  id uuid primary key,
  record_id uuid not null references public.gaga_daily_records(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  created_at timestamptz not null default now()
);
create index gaga_contributions_record on public.gaga_daily_contributions(record_id);
alter table public.gaga_daily_contributions enable row level security;
revoke all on public.gaga_daily_contributions from anon,authenticated;
grant select on public.gaga_daily_contributions to authenticated;
create policy contributions_read on public.gaga_daily_contributions for select to authenticated using (owner_id=(select auth.uid()) and gaga_private.session_active());

-- Locked parent + caller-scoped operation ID prevents duplicate or excessive repayment.
create function public.gaga_daily_contribute(record_id uuid, amount bigint, operation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.gaga_daily_records; previous public.gaga_daily_contributions;
begin
  if auth.uid() is null or not gaga_private.session_active() then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into r from public.gaga_daily_records d where d.id=record_id and d.owner_id=auth.uid() for update;
  if not found or r.kind not in ('lent','borrowed','goal') then raise exception 'Record unavailable' using errcode='42501'; end if;
  select * into previous from public.gaga_daily_contributions c where c.id=operation_id;
  if found then
    if previous.owner_id=auth.uid() and previous.record_id=record_id and previous.amount_minor=amount then return; end if;
    raise exception 'Operation ID already used';
  end if;
  if amount <= 0 or amount > r.amount_minor-r.paid_minor then raise exception 'Amount exceeds remaining amount'; end if;
  insert into public.gaga_daily_contributions(id,record_id,owner_id,amount_minor) values(operation_id,r.id,auth.uid(),amount);
  update public.gaga_daily_records d set paid_minor=d.paid_minor+amount where d.id=r.id;
end $$;
revoke all on function public.gaga_daily_contribute(uuid,bigint,uuid) from public,anon;
grant execute on function public.gaga_daily_contribute(uuid,bigint,uuid) to authenticated;

create table public.gaga_shopping_lists (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 160),
  member_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  check (cardinality(member_ids) <= 20)
);
create index gaga_shopping_owner on public.gaga_shopping_lists(owner_id);
create index gaga_shopping_members on public.gaga_shopping_lists using gin(member_ids);
alter table public.gaga_shopping_lists enable row level security;
revoke all on public.gaga_shopping_lists from anon,authenticated;
grant select,insert,delete on public.gaga_shopping_lists to authenticated;
grant update(title) on public.gaga_shopping_lists to authenticated;
create policy shopping_read on public.gaga_shopping_lists for select to authenticated using (owner_id=(select auth.uid()) or (select auth.uid())=any(member_ids));
create policy shopping_insert on public.gaga_shopping_lists for insert to authenticated with check (owner_id=(select auth.uid()) and cardinality(member_ids)=0);
create policy shopping_update on public.gaga_shopping_lists for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy shopping_delete on public.gaga_shopping_lists for delete to authenticated using(owner_id=(select auth.uid()));
create policy shopping_session on public.gaga_shopping_lists as restrictive to authenticated using(gaga_private.session_active()) with check(gaga_private.session_active());

create function public.gaga_share_shopping_list(list_id uuid,member_id uuid,remove_member boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare l public.gaga_shopping_lists;
begin
  if auth.uid() is null or not gaga_private.session_active() then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into l from public.gaga_shopping_lists s where s.id=list_id and s.owner_id=auth.uid() for update;
  if not found then raise exception 'Only the owner can share this list' using errcode='42501'; end if;
  if member_id=l.owner_id then return; end if;
  if remove_member then
    update public.gaga_shopping_lists s set member_ids=array_remove(s.member_ids,member_id) where s.id=l.id;
  elsif not member_id=any(l.member_ids) then
    if cardinality(l.member_ids)>=20 then raise exception 'Maximum 20 members'; end if;
    if not exists(select 1 from public.users u where u.id=member_id) then raise exception 'Member unavailable'; end if;
    update public.gaga_shopping_lists s set member_ids=array_append(s.member_ids,member_id) where s.id=l.id;
  end if;
end $$;
revoke all on function public.gaga_share_shopping_list(uuid,uuid,boolean) from public,anon;
grant execute on function public.gaga_share_shopping_list(uuid,uuid,boolean) to authenticated;

create table public.gaga_shopping_items (
  id uuid primary key,
  list_id uuid not null references public.gaga_shopping_lists(id) on delete cascade,
  name text not null check(length(btrim(name)) between 1 and 160),
  quantity text not null default '1' check(length(btrim(quantity)) between 1 and 80),
  purchased boolean not null default false,
  created_at timestamptz not null default now()
);
create index gaga_shopping_items_list on public.gaga_shopping_items(list_id,created_at);
alter table public.gaga_shopping_items enable row level security;
revoke all on public.gaga_shopping_items from anon,authenticated;
grant select,insert,delete on public.gaga_shopping_items to authenticated;
grant update(name,quantity,purchased) on public.gaga_shopping_items to authenticated;
create policy shopping_items_access on public.gaga_shopping_items to authenticated
using (exists(select 1 from public.gaga_shopping_lists s where s.id=list_id))
with check (exists(select 1 from public.gaga_shopping_lists s where s.id=list_id));
create policy shopping_items_session on public.gaga_shopping_items as restrictive to authenticated using(gaga_private.session_active()) with check(gaga_private.session_active());
