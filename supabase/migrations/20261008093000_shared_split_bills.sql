-- GaGa 2.2.1 shared split bills.
-- Split records are bookkeeping only; GaGa does not move or hold funds.

create table if not exists public.gaga_split_bills (
  id uuid primary key,
  chat_id text not null references public.chats(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  source_message text,
  title text not null check (length(btrim(title)) between 1 and 160),
  total_minor bigint not null check (total_minor > 0 and total_minor <= 100000000000),
  currency text not null default 'BDT' check (currency in ('BDT','USD','CNY')),
  due_at timestamptz,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.gaga_split_bill_members (
  bill_id uuid not null references public.gaga_split_bills(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  share_minor bigint not null check (share_minor > 0),
  settled boolean not null default false,
  settled_at timestamptz,
  settled_by uuid references auth.users(id),
  primary key (bill_id,user_id)
);

create index if not exists gaga_split_bills_chat_created_idx
  on public.gaga_split_bills(chat_id,created_at desc);
create index if not exists gaga_split_bill_members_user_idx
  on public.gaga_split_bill_members(user_id,settled);

alter table public.gaga_split_bills enable row level security;
alter table public.gaga_split_bill_members enable row level security;

revoke all on table public.gaga_split_bills from public,anon,authenticated;
revoke all on table public.gaga_split_bill_members from public,anon,authenticated;
grant select on table public.gaga_split_bills to authenticated;
grant select on table public.gaga_split_bill_members to authenticated;
grant select,insert,update,delete on table public.gaga_split_bills to service_role;
grant select,insert,update,delete on table public.gaga_split_bill_members to service_role;

create or replace function gaga_private.can_access_split(p_bill_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null
    and gaga_private.session_active()
    and exists (
      select 1 from public.gaga_split_bills b
      where b.id=p_bill_id
        and (
          b.creator_id=auth.uid()
          or exists (
            select 1 from public.gaga_split_bill_members m
            where m.bill_id=b.id and m.user_id=auth.uid()
          )
        )
    );
$$;
revoke all on function gaga_private.can_access_split(uuid) from public,anon;
grant usage on schema gaga_private to authenticated;
grant execute on function gaga_private.can_access_split(uuid) to authenticated;

drop policy if exists gaga_split_bills_read on public.gaga_split_bills;
create policy gaga_split_bills_read on public.gaga_split_bills
  for select to authenticated using (gaga_private.can_access_split(id));

drop policy if exists gaga_split_bill_members_read on public.gaga_split_bill_members;
create policy gaga_split_bill_members_read on public.gaga_split_bill_members
  for select to authenticated using (gaga_private.can_access_split(bill_id));

create or replace function public.gaga_create_split_bill(
  p_bill_id uuid,
  p_chat_id text,
  p_source_message text,
  p_title text,
  p_total_minor bigint,
  p_currency text,
  p_due_at timestamptz,
  p_participant_ids uuid[],
  p_share_minors bigint[]
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid();
  v_count integer;
  v_distinct integer;
  v_sum bigint;
begin
  if v_uid is null or not gaga_private.session_active() then
    raise exception 'Sign in required' using errcode='42501';
  end if;
  if p_bill_id is null or p_chat_id is null or length(btrim(coalesce(p_title,'')))=0 then
    raise exception 'Invalid split bill';
  end if;
  if p_total_minor <= 0 or p_total_minor > 100000000000 then
    raise exception 'Invalid total';
  end if;
  if upper(coalesce(p_currency,'')) not in ('BDT','USD','CNY') then
    raise exception 'Unsupported currency';
  end if;
  if not exists(
    select 1 from public.chats c
    where c.id=p_chat_id and v_uid::text=any(coalesce(c.participants,'{}'::text[]))
  ) then raise exception 'Chat unavailable' using errcode='42501'; end if;

  v_count:=coalesce(array_length(p_participant_ids,1),0);
  if v_count < 2 or v_count > 50 or v_count <> coalesce(array_length(p_share_minors,1),0) then
    raise exception 'Choose 2 to 50 participants with matching shares';
  end if;
  select count(distinct x) into v_distinct from unnest(p_participant_ids) x;
  if v_distinct <> v_count then raise exception 'Duplicate participant'; end if;
  if exists(select 1 from unnest(p_share_minors) x where x <= 0) then
    raise exception 'Every share must be positive';
  end if;
  select sum(x) into v_sum from unnest(p_share_minors) x;
  if v_sum <> p_total_minor then raise exception 'Shares must equal total'; end if;
  if exists(
    select 1 from unnest(p_participant_ids) x
    where not exists(
      select 1 from public.chats c
      where c.id=p_chat_id and x::text=any(coalesce(c.participants,'{}'::text[]))
    )
  ) then raise exception 'Every participant must belong to the chat' using errcode='42501'; end if;

  insert into public.gaga_split_bills(
    id,chat_id,creator_id,source_message,title,total_minor,currency,due_at
  ) values (
    p_bill_id,p_chat_id,v_uid,nullif(btrim(coalesce(p_source_message,'')),''),
    btrim(p_title),p_total_minor,upper(p_currency),p_due_at
  );

  insert into public.gaga_split_bill_members(bill_id,user_id,share_minor)
  select p_bill_id,p_participant_ids[i],p_share_minors[i]
  from generate_subscripts(p_participant_ids,1) g(i);

  return p_bill_id;
end $$;
revoke all on function public.gaga_create_split_bill(uuid,text,text,text,bigint,text,timestamptz,uuid[],bigint[]) from public,anon;
grant execute on function public.gaga_create_split_bill(uuid,text,text,text,bigint,text,timestamptz,uuid[],bigint[]) to authenticated;

create or replace function public.gaga_set_split_share_status(
  p_bill_id uuid,p_user_id uuid,p_settled boolean
) returns void
language plpgsql security definer set search_path='' as $$
declare v_creator uuid;
begin
  if auth.uid() is null or not gaga_private.session_active() then
    raise exception 'Sign in required' using errcode='42501';
  end if;
  select creator_id into v_creator from public.gaga_split_bills where id=p_bill_id;
  if v_creator is null then raise exception 'Split bill unavailable'; end if;
  if auth.uid()<>p_user_id and auth.uid()<>v_creator then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  update public.gaga_split_bill_members
  set settled=p_settled,
      settled_at=case when p_settled then timezone('utc',now()) else null end,
      settled_by=case when p_settled then auth.uid() else null end
  where bill_id=p_bill_id and user_id=p_user_id;
  if not found then raise exception 'Participant unavailable'; end if;
end $$;
revoke all on function public.gaga_set_split_share_status(uuid,uuid,boolean) from public,anon;
grant execute on function public.gaga_set_split_share_status(uuid,uuid,boolean) to authenticated;
