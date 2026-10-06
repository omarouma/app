-- Read/write checks run entirely inside a rollback; no test records are retained.
begin;
create temp table daily_test_users as
select distinct on (s.user_id) s.user_id uid,s.id sid from auth.sessions s
where s.not_after is null or s.not_after>now() order by s.user_id limit 2;
do $$ begin if (select count(*) from daily_test_users)<>2 then raise exception 'Need two active sessions for isolation test'; end if; end $$;
create temp table daily_test_ids as select gen_random_uuid() debt,gen_random_uuid() expense,gen_random_uuid() list,gen_random_uuid() item,gen_random_uuid() operation;
grant select on daily_test_users,daily_test_ids to authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',uid,'session_id',sid,'role','authenticated')::text,true) from daily_test_users order by uid limit 1;
set local role authenticated;
do $$
declare ids record; me uuid:=auth.uid(); other uuid; n int;
begin
 select * into ids from daily_test_ids;
 select uid into other from daily_test_users where uid<>me;
 insert into public.gaga_daily_records(id,owner_id,kind,title,amount_minor) values(ids.debt,me,'lent','GaGa rollback repayment test',10000);
 insert into public.gaga_daily_records(id,owner_id,kind,title,amount_minor) values(ids.expense,me,'expense','GaGa rollback expense test',3000);
 if (select count(*) from public.gaga_daily_records where id in(ids.debt,ids.expense))<>2 then raise exception 'Owner read failed'; end if;
 update public.gaga_daily_records set title='GaGa rollback edit test' where id=ids.expense;
 begin
   update public.gaga_daily_records set owner_id=other where id=ids.debt;
   raise exception 'Ownership reassignment allowed';
 exception when insufficient_privilege then null; end;
 begin
   update public.gaga_daily_records set paid_minor=9999 where id=ids.debt;
   raise exception 'Direct repayment modification allowed';
 exception when insufficient_privilege then null; end;
 perform public.gaga_daily_contribute(ids.debt,2000,ids.operation);
 perform public.gaga_daily_contribute(ids.debt,2000,ids.operation);
 if (select paid_minor from public.gaga_daily_records where id=ids.debt)<>2000 then raise exception 'Idempotent repayment failed'; end if;
 begin
   perform public.gaga_daily_contribute(ids.debt,9000,gen_random_uuid());
   raise exception 'Excess repayment allowed';
 exception when raise_exception then
   if sqlerrm='Excess repayment allowed' then raise; end if;
 end;
 begin
   update public.gaga_daily_records set currency='USD' where id=ids.debt;
   raise exception 'Currency change after repayment allowed';
 exception when raise_exception then
   if sqlerrm='Currency change after repayment allowed' then raise; end if;
 end;
 insert into public.gaga_shopping_lists(id,owner_id,title) values(ids.list,me,'GaGa rollback shared list');
 insert into public.gaga_shopping_items(id,list_id,name) values(ids.item,ids.list,'Test item');
 perform set_config('request.jwt.claims',(select jsonb_build_object('sub',uid,'session_id',sid,'role','authenticated')::text from daily_test_users where uid=other),true);
 if exists(select 1 from public.gaga_daily_records where id=ids.debt) then raise exception 'Other account can read private debt'; end if;
 if exists(select 1 from public.gaga_shopping_items where id=ids.item) then raise exception 'Uninvited account can read shopping list'; end if;
 begin
   insert into public.gaga_daily_records(id,owner_id,kind,title,amount_minor) values(gen_random_uuid(),me,'expense','Forbidden impersonation',100);
   raise exception 'Impersonated insert allowed';
 exception when insufficient_privilege then null; end;
 update public.gaga_daily_records set title='Forbidden update' where id=ids.debt;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Other account modified private record'; end if;
 delete from public.gaga_daily_records where id=ids.debt;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Other account deleted private record'; end if;
 begin
   perform public.gaga_daily_contribute(ids.debt,100,gen_random_uuid());
   raise exception 'Other account can repay private record';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',(select jsonb_build_object('sub',uid,'session_id',sid,'role','authenticated')::text from daily_test_users where uid=me),true);
 perform public.gaga_share_shopping_list(ids.list,other,false);
 perform set_config('request.jwt.claims',(select jsonb_build_object('sub',uid,'session_id',sid,'role','authenticated')::text from daily_test_users where uid=other),true);
 if not exists(select 1 from public.gaga_shopping_items where id=ids.item) then raise exception 'Invited member cannot read items'; end if;
 update public.gaga_shopping_items set purchased=true where id=ids.item;
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Invited member cannot purchase'; end if;
 begin
   perform public.gaga_share_shopping_list(ids.list,me,true);
   raise exception 'Member can change list membership';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',(select jsonb_build_object('sub',uid,'session_id',sid,'role','authenticated')::text from daily_test_users where uid=me),true);
 perform public.gaga_share_shopping_list(ids.list,other,true);
 perform set_config('request.jwt.claims',(select jsonb_build_object('sub',uid,'session_id',sid,'role','authenticated')::text from daily_test_users where uid=other),true);
 if exists(select 1 from public.gaga_shopping_items where id=ids.item) then raise exception 'Removed member still has access'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  if has_table_privilege('anon','public.gaga_daily_records','select') then raise exception 'Anonymous private records grant'; end if;
  if has_function_privilege('anon','public.gaga_daily_contribute(uuid,bigint,uuid)','execute') then raise exception 'Anonymous privileged function grant'; end if;
end $$;
reset role;
select 'PASS: private records isolation, idempotent repayments, bounds, sharing and removal' result;
rollback;
