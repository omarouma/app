-- =============================================================================
-- Call lifecycle RPCs (atomic call creation + bounded busy checks).
-- =============================================================================
-- These functions power outbound calling. The `create-call` Edge Function
-- authenticates the caller and then calls `gaga_create_call`, which performs
-- the busy check and inserts the `call_history` row atomically so two
-- concurrent requests can never both ring the same user.
--
-- WHY THIS MIGRATION EXISTS
-- -------------------------
-- The functions below were originally shipped as an out-of-band "repair"
-- script (`supabase/repairs/call_lifecycle.sql`) and applied directly to the
-- live project, but they were never captured as a migration. A fresh database
-- provisioned from `supabase/migrations/*` was therefore missing
-- `gaga_create_call` and every outbound call failed with a PostgREST
-- `404 PGRST202` ("function not found"). This migration makes the backend
-- reproducible: applying the migration chain now yields the exact schema the
-- live project runs.
--
-- Idempotent: safe to run repeatedly and against the already-provisioned live
-- project (it replaces the identical definitions in place).
-- =============================================================================

-- The heartbeat column the busy check reads. Added defensively because the
-- original repair script added it the same way.
alter table public.call_history add column if not exists last_heartbeat_at timestamptz;

-- -----------------------------------------------------------------------------
-- gaga_create_call: atomic, idempotent call creation.
--   * Locks both participants in a stable order so concurrent invites cannot
--     both pass the busy check.
--   * Validates chat membership, block state and user existence.
--   * Replays an existing request id instead of creating a duplicate ring.
--   * Returns {call_id, room_id, status, caller_id, callee_id, call_type,
--     replayed} on success, or {error, message?} on failure.
-- -----------------------------------------------------------------------------
create or replace function public.gaga_create_call(
  p_chat_id text, p_callee_id uuid, p_type text, p_caller_id uuid,
  p_request_id uuid default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_chat public.chats%rowtype;
  v_existing public.call_history%rowtype;
  v_id uuid := coalesce(p_request_id, gen_random_uuid());
  v_room text;
  v_now timestamptz := now();
begin
  if p_caller_id is null or p_callee_id is null or p_caller_id = p_callee_id
     or p_type is null or p_type not in ('voice','video') or nullif(btrim(p_chat_id),'') is null then
    return jsonb_build_object('error','INVALID_CALL_REQUEST');
  end if;
  -- Both users are locked in a stable order. Concurrent requests cannot both
  -- pass the busy check and create overlapping calls.
  perform pg_advisory_xact_lock(hashtextextended(least(p_caller_id::text,p_callee_id::text), 723));
  perform pg_advisory_xact_lock(hashtextextended(greatest(p_caller_id::text,p_callee_id::text), 723));
  select * into v_chat from public.chats where id = p_chat_id;
  if not found then return jsonb_build_object('error','CHAT_NOT_FOUND'); end if;
  if not (p_caller_id::text = any(coalesce(v_chat.participants,'{}'::text[]))) or
     not (p_callee_id::text = any(coalesce(v_chat.participants,'{}'::text[]))) then
    return jsonb_build_object('error','NOT_CHAT_MEMBERS');
  end if;
  if exists(select 1 from public.blocked_users where
    (blocker_id=p_caller_id and blocked_id=p_callee_id) or
    (blocker_id=p_callee_id and blocked_id=p_caller_id)) then
    return jsonb_build_object('error','BLOCKED');
  end if;
  if not exists(select 1 from public.users where id=p_callee_id) or
     not exists(select 1 from public.users where id=p_caller_id) then
    return jsonb_build_object('error','USER_NOT_FOUND');
  end if;
  select * into v_existing from public.call_history where id=v_id;
  if found then
    if v_existing.caller_id<>p_caller_id or v_existing.callee_id<>p_callee_id or
       v_existing.chat_id is distinct from p_chat_id or v_existing.type<>p_type then
      return jsonb_build_object('error','INVALID_REQUEST_ID');
    end if;
    if v_existing.ended_at is not null or v_existing.status not in ('calling','ringing','connecting','connected','accepted','reconnecting') then
      return jsonb_build_object('error','CALL_ALREADY_FINISHED');
    end if;
    return jsonb_build_object('call_id',v_existing.id,'room_id',v_existing.room_id,
      'status',v_existing.status,'caller_id',p_caller_id,'callee_id',p_callee_id,
      'call_type',p_type,'replayed',true);
  end if;
  if exists(select 1 from public.call_history h where h.ended_at is null
    and (h.caller_id in (p_caller_id,p_callee_id) or h.callee_id in (p_caller_id,p_callee_id))
    and (
      (h.status in ('calling','ringing','connecting') and coalesce(h.started_at,h.created_at)>v_now-interval '2 minutes') or
      (h.status in ('connected','reconnecting','accepted') and
        ((h.last_heartbeat_at is not null and h.last_heartbeat_at>v_now-interval '2 minutes') or
         (h.last_heartbeat_at is null and coalesce(h.started_at,h.created_at)>v_now-interval '12 hours')))
    )) then return jsonb_build_object('error','BUSY','message','BUSY'); end if;
  v_room := 'gaga_call_' || replace(v_id::text,'-','');
  insert into public.call_history(id,chat_id,caller_id,callee_id,type,status,participant_ids,room_id,started_at)
    values(v_id,p_chat_id,p_caller_id,p_callee_id,p_type,'ringing',array[p_caller_id::text,p_callee_id::text],v_room,v_now);
  insert into public.call_signaling(call_id,caller_id,callee_id,caller_ice,callee_ice,room_id)
    values(v_id,p_caller_id,p_callee_id,'[]'::jsonb,'[]'::jsonb,v_room);
  return jsonb_build_object('call_id',v_id,'room_id',v_room,'status','ringing',
    'caller_id',p_caller_id,'callee_id',p_callee_id,'call_type',p_type,'replayed',false);
end $$;
revoke all on function public.gaga_create_call(text,uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.gaga_create_call(text,uuid,text,uuid,uuid) to service_role;

-- -----------------------------------------------------------------------------
-- gaga_touch_call: marks a call connected and refreshes its heartbeat. Callable
-- by either participant only.
-- -----------------------------------------------------------------------------
create or replace function public.gaga_touch_call(p_call_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.call_history set status='connected',last_heartbeat_at=now()
  where id=p_call_id and ended_at is null and
    (caller_id=(select auth.uid()) or callee_id=(select auth.uid())) and
    status in ('calling','ringing','connecting','connected','accepted','reconnecting');
  return found;
end $$;
revoke all on function public.gaga_touch_call(uuid) from public,anon;
grant execute on function public.gaga_touch_call(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- gaga_finish_call: terminal transition. Only a participant may end the call,
-- and only from a non-terminal state. Duration is clamped to [0, 86400]s.
-- -----------------------------------------------------------------------------
create or replace function public.gaga_finish_call(p_call_id uuid,p_status text,p_duration_seconds integer default 0)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_status text := case when p_status='rejected' then 'declined' else p_status end;
begin
  if v_status is null or v_status not in ('ended','declined','missed','cancelled','timeout','busy','failed') then
    raise exception 'Invalid terminal call status' using errcode='22023';
  end if;
  update public.call_history set status=v_status,ended_at=now(),
    duration=greatest(0,least(coalesce(p_duration_seconds,0),86400))
  where id=p_call_id and ended_at is null and
    (caller_id=(select auth.uid()) or callee_id=(select auth.uid()));
  return found;
end $$;
revoke all on function public.gaga_finish_call(uuid,text,integer) from public,anon;
grant execute on function public.gaga_finish_call(uuid,text,integer) to authenticated;

-- Refresh PostgREST's schema cache so the new signatures are immediately
-- callable over the Data API.
notify pgrst, 'reload schema';
