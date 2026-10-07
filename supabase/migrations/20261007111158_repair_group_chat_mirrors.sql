-- Repair legacy groups whose old client created the group row/owner member
-- but failed to create the chat mirror or synchronize participant arrays.
insert into public.group_members(group_id,user_id,role)
select g.id,g.created_by,'owner'
from public.groups g
where g.created_by is not null
on conflict(group_id,user_id) do update set role='owner';

with roster as (
  select g.id,
         coalesce(array_agg(gm.user_id::text order by gm.joined_at) filter(where gm.user_id is not null),'{}'::text[]) participants,
         coalesce(array_agg(gm.user_id::text order by gm.joined_at) filter(where gm.role in ('owner','admin')),'{}'::text[]) admins
  from public.groups g left join public.group_members gm on gm.group_id=g.id
  group by g.id
)
update public.groups g set participants=r.participants,admins=r.admins,updated_at=timezone('utc',now())
from roster r where r.id=g.id;

insert into public.chats(id,type,participants,name,avatar,description,created_by,admins,updated_at)
select g.id::text,'group',g.participants,g.name,coalesce(g.avatar,''),coalesce(g.description,''),g.created_by::text,g.admins,timezone('utc',now())
from public.groups g
on conflict(id) do update set
  participants=excluded.participants,
  name=excluded.name,
  avatar=excluded.avatar,
  description=excluded.description,
  admins=excluded.admins,
  updated_at=excluded.updated_at
where public.chats.type='group';

revoke insert,update,delete on table public.groups from anon,authenticated;
revoke insert,update,delete on table public.group_members from anon,authenticated;
revoke update on table public.chats from anon,authenticated;

drop policy if exists groups_update_own_or_admin on public.groups;
drop policy if exists groups_insert_own on public.groups;
drop policy if exists groups_delete_own on public.groups;
drop policy if exists group_members_insert_own on public.group_members;
drop policy if exists group_members_delete_own_or_admin on public.group_members;
