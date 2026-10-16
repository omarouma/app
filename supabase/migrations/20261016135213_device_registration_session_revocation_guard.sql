-- Device registration must not restore a revoked install or accept a revoked session.
-- SECURITY DEFINER is retained only for atomic cross-account push-token rebinding.
create or replace function public.gaga_register_device(p_device_id text, p_push_token text, p_device_name text default null)
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_user uuid := (select auth.uid()); v_id uuid;
begin
  if v_user is null or not gaga_private.session_active() then
    raise exception 'Active session required' using errcode='28000';
  end if;
  if nullif(btrim(p_device_id),'') is null or length(p_device_id)>256 or
     nullif(btrim(p_push_token),'') is null or length(p_push_token)>4096 then
    raise exception 'Invalid device registration' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_push_token,724));
  update public.user_devices set push_token=null,updated_at=now()
    where push_token=p_push_token and (user_id<>v_user or device_id<>p_device_id);
  insert into public.user_devices(user_id,device_id,push_token,device_name,platform,last_seen_at,updated_at)
    values(v_user,p_device_id,p_push_token,left(coalesce(p_device_name,''),200),'android',now(),now())
    on conflict(user_id,device_id) do update set push_token=excluded.push_token,
      device_name=excluded.device_name,platform='android',last_seen_at=now(),updated_at=now()
    where public.user_devices.revoked_at is null
    returning id into v_id;
  if v_id is null then
    -- Raising also rolls back token rebinding above.
    raise exception 'Device registration revoked' using errcode='42501';
  end if;
  return v_id;
end $function$;
revoke all on function public.gaga_register_device(text,text,text) from public,anon;
grant execute on function public.gaga_register_device(text,text,text) to authenticated,service_role;
