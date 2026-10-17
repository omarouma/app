-- Production-safe regression: all fixtures and device changes are rolled back.
begin;
create temp table device_guard_users as
select distinct on (s.user_id) s.user_id uid,s.id sid
from auth.sessions s where s.not_after is null or s.not_after>now()
order by s.user_id limit 2;
do $$ begin
 if (select count(*) from device_guard_users)<>2 then raise exception 'Need two active sessions'; end if;
end $$;
grant select on device_guard_users to authenticated;
set local role authenticated;
do $test$
declare a record; b record; d text:='guard-'||gen_random_uuid();
 t text:='guard-'||gen_random_uuid(); t2 text:='guard-'||gen_random_uuid();
 v uuid; v2 uuid;
begin
 select * into a from device_guard_users order by uid limit 1;
 select * into b from device_guard_users where uid<>a.uid;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a.uid,'session_id',a.sid,'role','authenticated')::text,true);
 v:=public.gaga_register_device(d,t,'Rollback device test');
 v2:=public.gaga_register_device(d,t2,'Rollback token rotation');
 if v<>v2 then raise exception 'Device upsert duplicated row'; end if;
 if not exists(select 1 from public.user_devices where id=v and push_token=t2 and revoked_at is null) then
   raise exception 'Token rotation failed';
 end if;
 -- Account switch transfers only the supplied installation token.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b.uid,'session_id',b.sid,'role','authenticated')::text,true);
 v2:=public.gaga_register_device(d,t2,'Rollback account switch');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a.uid,'session_id',a.sid,'role','authenticated')::text,true);
 if not exists(select 1 from public.user_devices where id=v and push_token is null) then
   raise exception 'Previous account retained installation token';
 end if;
 update public.user_devices set revoked_at=now() where id=v;
 begin
   perform public.gaga_register_device(d,t2,'Forbidden restore');
   raise exception 'Revoked device restored';
 exception when insufficient_privilege then null; end;
 if not exists(select 1 from public.user_devices where id=v and revoked_at is not null and push_token is null) then
   raise exception 'Revoked row changed';
 end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b.uid,'session_id',b.sid,'role','authenticated')::text,true);
 if not exists(select 1 from public.user_devices where id=v2 and push_token=t2) then
   raise exception 'Rejected restore cleared another account token';
 end if;
 -- A signed token with a nonexistent/revoked session must not register devices.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a.uid,'session_id',gen_random_uuid(),'role','authenticated')::text,true);
 begin
   perform public.gaga_register_device(d||'-inactive',t,'Forbidden session');
   raise exception 'Inactive session registered device';
 exception when sqlstate '28000' then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a.uid,'session_id',a.sid,'role','authenticated')::text,true);
 begin
   perform public.gaga_register_device('',t,'Invalid');
   raise exception 'Empty device accepted';
 exception when invalid_parameter_value then null; end;
end $test$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.gaga_register_device(text,text,text)','EXECUTE') then
   raise exception 'Anonymous device registration allowed';
 end if;
end $$;
select 'PASS: rotation, account switch, revoked device, inactive session, rejected-rebind rollback, anonymous ACL' as result;
rollback;
