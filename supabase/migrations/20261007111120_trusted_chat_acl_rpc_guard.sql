-- Direct client ACL changes stay blocked. Audited SECURITY DEFINER
-- membership RPCs explicitly opt in with gaga.trusted_rpc=on.
create or replace function public.prevent_client_chat_acl_changes()
returns trigger language plpgsql security definer set search_path='public' as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), 'authenticated') <> 'service_role'
     and auth.uid() is not null
     and coalesce(current_setting('gaga.trusted_rpc', true), 'off') <> 'on' then
    if new.id <> old.id
      or new.participants is distinct from old.participants
      or new.admins is distinct from old.admins
      or new.created_by is distinct from old.created_by
    then raise exception 'chat authorization fields cannot be changed by clients'; end if;
  end if;
  return new;
end $$;
