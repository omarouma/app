-- Production-safe: private-chat/message fixtures and consume transitions all roll back.
begin;
create temp table vo_users as
with sessions as (
 select distinct on(s.user_id) s.user_id uid,s.id sid from auth.sessions s
 where (s.not_after is null or s.not_after>now())
 and exists(select 1 from public.users u where u.id=s.user_id) order by s.user_id
), pair as (
 select a.uid aid,a.sid asid,b.uid bid,b.sid bsid from sessions a join sessions b on a.uid<b.uid
 where gaga_private.message_allowed(a.uid,b.uid) order by a.uid,b.uid limit 1
)
select aid uid,asid sid from pair union all select bid,bsid from pair;
create temp table vo_ids as select gen_random_uuid() id,'view-once-test-'||gen_random_uuid()::text chat;
do $$ begin
  if (select count(*) from vo_users)<>2 then raise exception 'Need two active sessions'; end if;
  if has_function_privilege('anon','public.gaga_consume_view_once(uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.gaga_view_once_garbage()','EXECUTE')
     or has_table_privilege('authenticated','gaga_private.view_once_photos','SELECT') then
    raise exception 'Private media privileges unsafe';
  end if;
  if (select public from storage.buckets where id='gaga-view-once') is distinct from false then raise exception 'View-once bucket is not private'; end if;
end $$;
insert into public.chats(id,type,participants) select chat,'direct',(select array_agg(uid::text) from vo_users) from vo_ids;
grant select on vo_users,vo_ids to authenticated;
set local role authenticated;
do $$ declare a record; ids record; object text; begin
  select * into a from vo_users order by uid limit 1;
  select * into ids from vo_ids;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a.uid,'session_id',a.sid,'role','authenticated')::text,true);
  object:=public.gaga_reserve_view_once(ids.id,ids.chat,'image/jpeg');
  if object<>a.uid::text||'/'||ids.id::text then raise exception 'Object ownership invalid'; end if;
  if public.gaga_reserve_view_once(ids.id,ids.chat,'image/jpeg')<>object then raise exception 'Reservation retry changed identity'; end if;
  begin
    perform public.gaga_publish_view_once(ids.id);
    raise exception 'Unuploaded photo published';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.gaga_reserve_view_once(gen_random_uuid(),'unavailable-chat','image/jpeg');
    raise exception 'Non-member reservation permitted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Simulate publication for atomic consume tests without creating any storage objects.
update gaga_private.view_once_photos set published_at=now() where id=(select id from vo_ids);
insert into public.messages(id,local_id,chat_id,sender_id,type,content,media_url)
select i.id,i.id::text,i.chat,(select uid from vo_users order by uid limit 1),'image','View-once photo','gaga-view-once:'||i.id::text from vo_ids i;
set local role authenticated;
do $$ declare a record; b record; ids record; path text; begin
  select * into a from vo_users order by uid limit 1;
  select * into b from vo_users where uid<>a.uid;
  select * into ids from vo_ids;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a.uid,'session_id',a.sid,'role','authenticated')::text,true);
  begin
    perform public.gaga_consume_view_once(ids.id);
    raise exception 'Sender consumed recipient photo';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',b.uid,'session_id',gen_random_uuid(),'role','authenticated')::text,true);
  begin
    perform public.gaga_consume_view_once(ids.id);
    raise exception 'Revoked session consumed photo';
  exception when sqlstate '28000' then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',b.uid,'session_id',b.sid,'role','authenticated')::text,true);
  path:=public.gaga_consume_view_once(ids.id);
  if path<>a.uid::text||'/'||ids.id::text then raise exception 'Recipient consumed wrong object'; end if;
  begin
    perform public.gaga_consume_view_once(ids.id);
    raise exception 'Photo consumed twice';
  exception when insufficient_privilege then null; end;
  if not exists(select 1 from public.messages where id=ids.id and content='View-once photo opened') then raise exception 'Opened receipt not synchronized'; end if;
end $$;
reset role;
rollback;
select 'PASS: private bucket/ACL, ownership, retry identity, membership, incomplete upload, sender denial, revoked sessions, atomic single consumption, opened receipt' as result;
