-- Integration test: every inserted row and queued pg_net request is rolled back.
begin;
do $$
declare
  c public.chats%rowtype;
  a uuid; b uuid;
  v_id uuid := gen_random_uuid();
  r jsonb;
begin
  select * into c from public.chats ch where cardinality(ch.participants)=2
    and exists(select 1 from public.users u where u.id::text=ch.participants[1])
    and exists(select 1 from public.users u where u.id::text=ch.participants[2])
    and not exists(select 1 from public.blocked_users bu where
      (bu.blocker_id::text=ch.participants[1] and bu.blocked_id::text=ch.participants[2]) or
      (bu.blocker_id::text=ch.participants[2] and bu.blocked_id::text=ch.participants[1]))
    and not exists(select 1 from public.call_history h where h.ended_at is null and
      (h.caller_id::text=any(ch.participants) or h.callee_id::text=any(ch.participants)) and
      ((h.status in ('ringing','calling','connecting') and coalesce(h.started_at,h.created_at)>now()-interval '2 minutes') or
       (h.status in ('connected','accepted','reconnecting') and coalesce(h.last_heartbeat_at,h.started_at,h.created_at)>now()-interval '12 hours')))
    limit 1;
  if c.id is null then raise exception 'No idle conversation available for rollback test'; end if;
  a:=c.participants[1]::uuid; b:=c.participants[2]::uuid;
  insert into public.call_history(chat_id,caller_id,callee_id,status,participant_ids,started_at)
    values(c.id,a,b,'ringing',array[a::text,b::text],now()-interval '1 day');
  r:=public.gaga_create_call(c.id,b,'voice',a,v_id);
  if r->>'call_id' is distinct from v_id::text then raise exception 'Expired ringing must not block: %',r; end if;
  if not exists(select 1 from public.call_signaling where call_id=v_id and room_id=r->>'room_id') then
    raise exception 'Missing atomic signaling';
  end if;
  r:=public.gaga_create_call(c.id,b,'voice',a,v_id);
  if r->>'replayed' is distinct from 'true' then raise exception 'Idempotency failed'; end if;
  r:=public.gaga_create_call(c.id,b,'voice',a,gen_random_uuid());
  if r->>'error' is distinct from 'BUSY' then raise exception 'Active call must block'; end if;
  if has_function_privilege('authenticated','public.gaga_create_call(text,uuid,text,uuid,uuid)','EXECUTE') or
     has_function_privilege('anon','public.gaga_create_call(text,uuid,text,uuid,uuid)','EXECUTE') then
    raise exception 'RPC privilege leak';
  end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  if public.gaga_touch_call(v_id) or public.gaga_finish_call(v_id,'ended',0) then
    raise exception 'Nonmember modified a call';
  end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  set local role authenticated;
  if not public.gaga_touch_call(v_id) then raise exception 'Participant heartbeat failed'; end if;
  if not public.gaga_finish_call(v_id,'rejected',7) then raise exception 'Participant finish failed'; end if;
  if public.gaga_finish_call(v_id,'ended',0) or public.gaga_touch_call(v_id) then raise exception 'Terminal state overwritten'; end if;
  if not exists(select 1 from public.call_history where id=v_id and status='declined' and duration=7 and ended_at is not null) then
    raise exception 'Terminal state mismatch';
  end if;
  reset role;
  r:=public.gaga_create_call(c.id,b,'voice',a,v_id);
  if r->>'error' is distinct from 'CALL_ALREADY_FINISHED' then raise exception 'Finished id reused'; end if;
end $$;
rollback;
select 'PASS: stale ringing, atomic signaling, idempotency, busy, RPC privileges, nonmember rejection, authenticated heartbeat, decline mapping, terminal immutability, completed request replay; all fixtures rolled back' as result;
