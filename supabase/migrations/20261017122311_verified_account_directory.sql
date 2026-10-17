-- Organizations are enrolled by their owner and approved only by a trusted operator.
-- Never derive official/service authority from user-editable profile metadata.
create table public.gaga_account_applications (
  user_id uuid primary key references public.users(id) on delete cascade,
  account_kind text not null check (account_kind in ('official','service')),
  organization_name text not null check (length(btrim(organization_name)) between 2 and 120),
  website text not null check (website ~ '^https://[^ /]+(/[^ ]*)?$' and length(website)<=500),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note text,
  reviewed_at timestamptz,
  requested_at timestamptz not null default now()
);
create table public.gaga_account_directory (
  user_id uuid primary key references public.users(id) on delete cascade,
  account_kind text not null check (account_kind in ('official','service')),
  organization_name text not null,
  website text not null,
  verified_at timestamptz not null default now(),
  active boolean not null default true
);
alter table public.gaga_account_applications enable row level security;
alter table public.gaga_account_directory enable row level security;
revoke all on public.gaga_account_applications, public.gaga_account_directory from public,anon,authenticated;
grant select,insert,update on public.gaga_account_applications to authenticated;
grant select on public.gaga_account_directory to authenticated;
grant all on public.gaga_account_applications, public.gaga_account_directory to service_role;
create policy applications_read_own on public.gaga_account_applications for select to authenticated
  using (user_id=(select auth.uid()) and gaga_private.session_active());
create policy applications_submit_own on public.gaga_account_applications for insert to authenticated
  with check (user_id=(select auth.uid()) and status='pending' and reviewed_at is null
    and review_note is null and gaga_private.session_active());
create policy applications_edit_pending on public.gaga_account_applications for update to authenticated
  using (user_id=(select auth.uid()) and status in ('pending','rejected') and gaga_private.session_active())
  with check (user_id=(select auth.uid()) and status='pending' and reviewed_at is null and review_note is null
    and gaga_private.session_active());
create policy directory_read_active on public.gaga_account_directory for select to authenticated
  using (active and gaga_private.session_active());

create function public.gaga_request_account_verification(p_kind text,p_organization text,p_website text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null or not gaga_private.session_active() then
    raise exception 'Active session required' using errcode='28000';
  end if;
  insert into public.gaga_account_applications(user_id,account_kind,organization_name,website)
  values(auth.uid(),p_kind,btrim(p_organization),btrim(p_website))
  on conflict(user_id) do update set account_kind=excluded.account_kind,
    organization_name=excluded.organization_name,website=excluded.website,status='pending',
    reviewed_at=null,review_note=null,requested_at=now();
end $$;
revoke all on function public.gaga_request_account_verification(text,text,text) from public,anon;
grant execute on function public.gaga_request_account_verification(text,text,text) to authenticated;

-- Server-only atomic review. Approval requires external ownership verification by an operator.
create function public.gaga_review_account_application(p_user_id uuid,p_approve boolean,p_note text)
returns void language plpgsql security invoker set search_path='' as $$
declare v_request public.gaga_account_applications%rowtype;
begin
  if nullif(btrim(p_note),'') is null or length(p_note)>1000 then
    raise exception 'A verification/rejection note is required' using errcode='22023';
  end if;
  select * into strict v_request from public.gaga_account_applications where user_id=p_user_id for update;
  if v_request.status<>'pending' then raise exception 'Request is not pending' using errcode='22023'; end if;
  update public.gaga_account_applications set status=case when p_approve then 'approved' else 'rejected' end,
    review_note=p_note,reviewed_at=now() where user_id=p_user_id;
  if p_approve then
    insert into public.gaga_account_directory(user_id,account_kind,organization_name,website)
    values(p_user_id,v_request.account_kind,v_request.organization_name,v_request.website)
    on conflict(user_id) do update set account_kind=excluded.account_kind,organization_name=excluded.organization_name,
      website=excluded.website,verified_at=now(),active=true;
  end if;
end $$;
revoke all on function public.gaga_review_account_application(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.gaga_review_account_application(uuid,boolean,text) to service_role;

-- Only public organization identity is returned; phone/email and review evidence stay private.
create function public.gaga_account_directory(p_kind text,p_query text default '',p_offset integer default 0,p_limit integer default 40)
returns table(id uuid,name text,username text,avatar text,website text,is_verified boolean)
language sql stable security invoker set search_path='' as $$
  select d.user_id,d.organization_name,u.username,u.avatar,d.website,true
  from public.gaga_account_directory d join public.users u on u.id=d.user_id
  where d.active and d.account_kind=p_kind
    and (coalesce(p_query,'')='' or position(lower(left(p_query,120)) in lower(d.organization_name))>0
      or position(lower(left(p_query,120)) in lower(coalesce(u.username,'')))>0)
  order by lower(d.organization_name),d.user_id
  offset greatest(coalesce(p_offset,0),0) limit least(greatest(coalesce(p_limit,40),1),100);
$$;
revoke all on function public.gaga_account_directory(text,text,integer,integer) from public,anon;
grant execute on function public.gaga_account_directory(text,text,integer,integer) to authenticated;
