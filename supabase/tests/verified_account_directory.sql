-- All enrollment/review fixtures are rolled back. No existing application is changed.
begin;
create temp table directory_test_users as
select distinct on (s.user_id) s.user_id uid,s.id sid from auth.sessions s
where (s.not_after is null or s.not_after>now())
  and exists(select 1 from public.users u where u.id=s.user_id)
  and not exists(select 1 from public.gaga_account_applications a where a.user_id=s.user_id)
  and not exists(select 1 from public.gaga_account_directory d where d.user_id=s.user_id)
order by s.user_id limit 2;
do $$ begin
  if (select count(*) from directory_test_users)<>2 then raise exception 'Need two unused active sessions'; end if;
  if has_function_privilege('authenticated','public.gaga_review_account_application(uuid,boolean,text)','EXECUTE')
     or has_function_privilege('anon','public.gaga_account_directory(text,text,integer,integer)','EXECUTE')
     or has_table_privilege('authenticated','public.gaga_account_directory','INSERT') then
    raise exception 'Directory approval privileges are unsafe';
  end if;
end $$;
grant select on directory_test_users to authenticated,service_role;
set local role authenticated;
do $$ declare a record; b record; begin
  select * into a from directory_test_users order by uid limit 1;
  select * into b from directory_test_users where uid<>a.uid;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a.uid,'session_id',a.sid,'role','authenticated')::text,true);
  perform public.gaga_request_account_verification('official','GaGa rollback organization','https://example.invalid');
  if exists(select 1 from public.gaga_account_directory('official','GaGa rollback',0,40)) then raise exception 'Unreviewed request published'; end if;
  begin
    update public.gaga_account_applications set status='approved' where user_id=a.uid;
    raise exception 'Self-approval allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.gaga_review_account_application(a.uid,true,'Forbidden self review');
    raise exception 'Owner can invoke review';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',b.uid,'session_id',b.sid,'role','authenticated')::text,true);
  if exists(select 1 from public.gaga_account_applications where user_id=a.uid) then raise exception 'Another owner can read request'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',b.uid,'session_id',gen_random_uuid(),'role','authenticated')::text,true);
  begin
    perform public.gaga_request_account_verification('service','Forbidden session','https://example.invalid');
    raise exception 'Inactive session submitted request';
  exception when sqlstate '28000' then null; end;
end $$;
reset role;
set local role service_role;
select public.gaga_review_account_application((select uid from directory_test_users order by uid limit 1),true,'Rollback-only ownership verification');
reset role;
set local role authenticated;
do $$ declare a record; begin
  select * into a from directory_test_users order by uid limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a.uid,'session_id',a.sid,'role','authenticated')::text,true);
  if (select count(*) from public.gaga_account_directory('official','GaGa rollback',0,40))<>1 then raise exception 'Approved organization unavailable'; end if;
  if exists(select 1 from public.gaga_account_directory('service','GaGa rollback',0,40)) then raise exception 'Category isolation failed'; end if;
  if exists(select 1 from public.gaga_account_directory('official','GaGa rollback',1,40)) then raise exception 'Directory pagination failed'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a.uid,'session_id',gen_random_uuid(),'role','authenticated')::text,true);
  if exists(select 1 from public.gaga_account_directory('official','GaGa rollback',0,40)) then raise exception 'Inactive session can read directory'; end if;
end $$;
reset role;
rollback;
select 'PASS: enrollment, private requests, self-approval denial, service-role review, directory categories, pagination, revoked sessions' as result;
