create or replace function public.gaga_group_add_member(p_group_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not gaga_private.session_active() then raise exception 'Sign in required' using errcode='42501'; end if;
  if not exists(select 1 from public.groups g where g.id=p_group_id and (g.created_by=auth.uid() or auth.uid()::text=any(coalesce(g.admins,'{}'::text[]))))
    then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_user_id is null or not exists(select 1 from public.users u where u.id=p_user_id)
    then raise exception 'Member unavailable'; end if;
  insert into public.group_members(group_id,user_id,role) values(p_group_id,p_user_id,'member')
    on conflict(group_id,user_id) do nothing;
  update public.groups g set participants=case when p_user_id::text=any(coalesce(g.participants,'{}'::text[]))
    then g.participants else array_append(coalesce(g.participants,'{}'::text[]),p_user_id::text) end,
    updated_at=timezone('utc',now()) where g.id=p_group_id;
  perform set_config('gaga.trusted_rpc','on',true);
  update public.chats c set participants=case when p_user_id::text=any(coalesce(c.participants,'{}'::text[]))
    then c.participants else array_append(coalesce(c.participants,'{}'::text[]),p_user_id::text) end,
    updated_at=timezone('utc',now()) where c.id=p_group_id::text;
end $$;

create or replace function public.gaga_group_remove_member(p_group_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_owner uuid;
begin
  if auth.uid() is null or not gaga_private.session_active() then raise exception 'Sign in required' using errcode='42501'; end if;
  select g.created_by into v_owner from public.groups g where g.id=p_group_id;
  if v_owner is null then raise exception 'Group unavailable' using errcode='42501'; end if;
  if p_user_id=v_owner then raise exception 'Owner cannot leave or be removed'; end if;
  if auth.uid()<>p_user_id and not exists(
    select 1 from public.groups g where g.id=p_group_id and (g.created_by=auth.uid() or auth.uid()::text=any(coalesce(g.admins,'{}'::text[])))
  ) then raise exception 'Not authorized' using errcode='42501'; end if;
  delete from public.group_members gm where gm.group_id=p_group_id and gm.user_id=p_user_id;
  update public.groups g set
    participants=array_remove(coalesce(g.participants,'{}'::text[]),p_user_id::text),
    admins=array_remove(coalesce(g.admins,'{}'::text[]),p_user_id::text),
    updated_at=timezone('utc',now()) where g.id=p_group_id;
  perform set_config('gaga.trusted_rpc','on',true);
  update public.chats c set
    participants=array_remove(coalesce(c.participants,'{}'::text[]),p_user_id::text),
    admins=array_remove(coalesce(c.admins,'{}'::text[]),p_user_id::text),
    updated_at=timezone('utc',now()) where c.id=p_group_id::text;
  delete from public.chat_user_settings where chat_id=p_group_id::text and user_id=p_user_id;
  delete from public.chat_hidden_users where chat_id=p_group_id::text and user_id=p_user_id;
end $$;

create or replace function public.gaga_group_delete(p_group_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not gaga_private.session_active() then raise exception 'Sign in required' using errcode='42501'; end if;
  if not exists(select 1 from public.groups g where g.id=p_group_id and g.created_by=auth.uid())
    then raise exception 'Only the owner can delete this group' using errcode='42501'; end if;
  delete from public.chats c where c.id=p_group_id::text;
  delete from public.groups g where g.id=p_group_id;
end $$;

revoke all on function public.gaga_group_add_member(uuid,uuid) from public,anon;
revoke all on function public.gaga_group_remove_member(uuid,uuid) from public,anon;
revoke all on function public.gaga_group_delete(uuid) from public,anon;
grant execute on function public.gaga_group_add_member(uuid,uuid) to authenticated;
grant execute on function public.gaga_group_remove_member(uuid,uuid) to authenticated;
grant execute on function public.gaga_group_delete(uuid) to authenticated;
