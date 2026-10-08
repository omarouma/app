-- GaGa Circles (roadmap 2.3)
-- A "circle" is an ordinary secure group chat that declares its purpose
-- (family / friends / class / work / business). The type never forks the chat
-- transport; it only decides which structured tools are surfaced around the
-- same end-to-end conversation. This migration:
--   1. adds `circle_type` to `public.groups` (source of truth) and mirrors it
--      onto `public.chats` so the conversation row can render the badge;
--   2. extends the create/update RPCs with a validated `p_circle_type`.
-- Idempotent: safe to re-run on a live project.

alter table public.groups
  add column if not exists circle_type text not null default 'general';

alter table public.chats
  add column if not exists circle_type text not null default 'general';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'groups_circle_type_check') then
    alter table public.groups add constraint groups_circle_type_check
      check (circle_type in ('general','family','friends','class','work','business'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chats_circle_type_check') then
    alter table public.chats add constraint chats_circle_type_check
      check (circle_type in ('general','family','friends','class','work','business'));
  end if;
end $$;

-- Replace the 4-arg create RPC with a 5-arg version that also records the circle
-- type. The old signature is dropped so no ambiguous overload remains.
drop function if exists public.gaga_group_create(uuid,text,text,uuid[]);
create or replace function public.gaga_group_create(
  p_group_id uuid,p_name text,p_description text default null,p_member_ids uuid[] default '{}',p_circle_type text default 'general'
) returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_members uuid[]; v_participants text[]; v_circle text;
begin
  if v_uid is null or not gaga_private.session_active() then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_group_id is null or length(btrim(coalesce(p_name,'')))=0 then raise exception 'Invalid group'; end if;
  v_circle:=case when lower(coalesce(p_circle_type,'general')) in ('general','family','friends','class','work','business')
                 then lower(p_circle_type) else 'general' end;
  select coalesce(array_agg(distinct x),'{}'::uuid[]) into v_members
    from unnest(coalesce(p_member_ids,'{}'::uuid[])) x where x is not null and x<>v_uid;
  if cardinality(v_members)>99 then raise exception 'Too many members'; end if;
  if exists(select 1 from unnest(v_members) x where not exists(select 1 from public.users u where u.id=x))
    then raise exception 'Member unavailable'; end if;
  v_participants:=array_prepend(v_uid::text,array(select x::text from unnest(v_members) x));
  insert into public.groups(id,name,description,created_by,admins,participants,circle_type,updated_at)
    values(p_group_id,btrim(p_name),coalesce(p_description,''),v_uid,array[v_uid::text],v_participants,v_circle,timezone('utc',now()));
  insert into public.group_members(group_id,user_id,role)
    select p_group_id,x,case when x=v_uid then 'owner' else 'member' end
    from unnest(array_prepend(v_uid,v_members)) x
    on conflict(group_id,user_id) do update set role=excluded.role;
  insert into public.chats(id,type,participants,name,description,created_by,admins,circle_type,updated_at)
    values(p_group_id::text,'group',v_participants,btrim(p_name),coalesce(p_description,''),v_uid::text,array[v_uid::text],v_circle,timezone('utc',now()));
end $$;

-- Replace the 4-arg update RPC with a 5-arg version that can also change the
-- circle type.
drop function if exists public.gaga_group_update(uuid,text,text,text);
create or replace function public.gaga_group_update(
  p_group_id uuid,p_name text default null,p_description text default null,p_avatar text default null,p_circle_type text default null
) returns void language plpgsql security definer set search_path='' as $$
declare v_circle text;
begin
  if auth.uid() is null or not gaga_private.session_active() then raise exception 'Sign in required' using errcode='42501'; end if;
  if not exists(select 1 from public.groups g where g.id=p_group_id and (g.created_by=auth.uid() or auth.uid()::text=any(coalesce(g.admins,'{}'::text[]))))
    then raise exception 'Not authorized' using errcode='42501'; end if;
  v_circle:=case when p_circle_type is null then null
                 when lower(p_circle_type) in ('general','family','friends','class','work','business') then lower(p_circle_type)
                 else null end;
  update public.groups g set
    name=coalesce(nullif(btrim(p_name),''),g.name),
    description=case when p_description is null then g.description else p_description end,
    avatar=case when p_avatar is null then g.avatar else p_avatar end,
    circle_type=coalesce(v_circle,g.circle_type),
    updated_at=timezone('utc',now())
  where g.id=p_group_id;
  update public.chats c set
    name=coalesce(nullif(btrim(p_name),''),c.name),
    description=case when p_description is null then c.description else p_description end,
    avatar=case when p_avatar is null then c.avatar else p_avatar end,
    circle_type=coalesce(v_circle,c.circle_type),
    updated_at=timezone('utc',now())
  where c.id=p_group_id::text;
end $$;

revoke all on function public.gaga_group_create(uuid,text,text,uuid[],text) from public,anon;
revoke all on function public.gaga_group_update(uuid,text,text,text,text) from public,anon;
grant execute on function public.gaga_group_create(uuid,text,text,uuid[],text) to authenticated;
grant execute on function public.gaga_group_update(uuid,text,text,text,text) to authenticated;
