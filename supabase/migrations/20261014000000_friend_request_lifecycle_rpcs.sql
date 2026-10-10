-- =============================================================================
-- Friend request lifecycle RPCs (atomic accept / decline / cancel).
-- =============================================================================
-- WHY THIS MIGRATION EXISTS
-- -------------------------
-- Accepting a friend request used to be three independent PostgREST calls from
-- the client:
--     1. PATCH friend_requests  -> status = 'accepted'
--     2. POST  friendships      -> (me, them)
--     3. POST  friendships      -> (them, me)
-- If the process was interrupted between (1) and (3) the two accounts could
-- disagree: the request was "accepted" but only one (or neither) friendship edge
-- existed, so the People screens showed different state on each device. There
-- was also no single place that enforced "only the recipient may accept".
--
-- These functions move the whole transition into ONE database transaction so
-- both accounts always observe consistent request + friendship state. They are:
--   * ATOMIC      - status change and both friendship edges commit together.
--   * IDEMPOTENT  - replaying accept/decline/cancel is a no-op, never a 409.
--   * AUTHORISED  - only the recipient may accept/decline, only the sender may
--                   cancel; blocked pairs are rejected.
--
-- The pre-existing `gaga_private.guard_friend_request()` trigger still runs and
-- keeps enforcing the legal status transitions (pending -> accepted|rejected by
-- the recipient, pending -> cancelled by the sender). These RPCs are
-- `security definer` so they can write the symmetric friendship edges even
-- though the client has no direct INSERT path once a request is accepted, while
-- still validating the caller through `auth.uid()`.
--
-- Idempotent: safe to run repeatedly and against the already-provisioned live
-- project.
-- =============================================================================

-- The guard trigger and the client both read `updated_at`; add it defensively.
alter table public.friend_requests add column if not exists updated_at timestamptz;

-- -----------------------------------------------------------------------------
-- gaga_accept_friend_request: recipient accepts. Creates both friendship edges.
-- -----------------------------------------------------------------------------
create or replace function public.gaga_accept_friend_request(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_req public.friend_requests%rowtype;
begin
  if v_uid is null then return jsonb_build_object('error','NOT_AUTHENTICATED'); end if;
  select * into v_req from public.friend_requests where id = p_request_id for update;
  if not found then return jsonb_build_object('error','REQUEST_NOT_FOUND'); end if;
  if v_req.to_user_id <> v_uid then return jsonb_build_object('error','NOT_RECIPIENT'); end if;
  if v_req.from_user_id = v_req.to_user_id then return jsonb_build_object('error','INVALID_REQUEST'); end if;
  if exists(select 1 from public.blocked_users where
       (blocker_id = v_req.from_user_id and blocked_id = v_req.to_user_id) or
       (blocker_id = v_req.to_user_id and blocked_id = v_req.from_user_id)) then
    return jsonb_build_object('error','BLOCKED');
  end if;
  if v_req.status = 'accepted' then
    null; -- idempotent replay
  elsif v_req.status <> 'pending' then
    return jsonb_build_object('error','REQUEST_NOT_PENDING','status',v_req.status);
  else
    update public.friend_requests set status = 'accepted', updated_at = now() where id = p_request_id;
  end if;
  insert into public.friendships(user_id, friend_id) values (v_req.from_user_id, v_req.to_user_id)
    on conflict (user_id, friend_id) do nothing;
  insert into public.friendships(user_id, friend_id) values (v_req.to_user_id, v_req.from_user_id)
    on conflict (user_id, friend_id) do nothing;
  return jsonb_build_object('status','accepted','request_id',p_request_id,'friend_id',v_req.from_user_id);
end $$;

-- -----------------------------------------------------------------------------
-- gaga_decline_friend_request: recipient declines. Terminal, no edges created.
-- -----------------------------------------------------------------------------
create or replace function public.gaga_decline_friend_request(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_req public.friend_requests%rowtype;
begin
  if v_uid is null then return jsonb_build_object('error','NOT_AUTHENTICATED'); end if;
  select * into v_req from public.friend_requests where id = p_request_id for update;
  if not found then return jsonb_build_object('error','REQUEST_NOT_FOUND'); end if;
  if v_req.to_user_id <> v_uid then return jsonb_build_object('error','NOT_RECIPIENT'); end if;
  if v_req.status = 'rejected' then
    null; -- idempotent replay
  elsif v_req.status <> 'pending' then
    return jsonb_build_object('error','REQUEST_NOT_PENDING','status',v_req.status);
  else
    update public.friend_requests set status = 'rejected', updated_at = now() where id = p_request_id;
  end if;
  return jsonb_build_object('status','rejected','request_id',p_request_id);
end $$;

-- -----------------------------------------------------------------------------
-- gaga_cancel_friend_request: sender withdraws a pending request.
-- -----------------------------------------------------------------------------
create or replace function public.gaga_cancel_friend_request(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_req public.friend_requests%rowtype;
begin
  if v_uid is null then return jsonb_build_object('error','NOT_AUTHENTICATED'); end if;
  select * into v_req from public.friend_requests where id = p_request_id for update;
  if not found then return jsonb_build_object('error','REQUEST_NOT_FOUND'); end if;
  if v_req.from_user_id <> v_uid then return jsonb_build_object('error','NOT_SENDER'); end if;
  if v_req.status = 'cancelled' then
    null; -- idempotent replay
  elsif v_req.status <> 'pending' then
    return jsonb_build_object('error','REQUEST_NOT_PENDING','status',v_req.status);
  else
    update public.friend_requests set status = 'cancelled', updated_at = now() where id = p_request_id;
  end if;
  return jsonb_build_object('status','cancelled','request_id',p_request_id);
end $$;

revoke all on function
  public.gaga_accept_friend_request(uuid),
  public.gaga_decline_friend_request(uuid),
  public.gaga_cancel_friend_request(uuid)
  from public, anon;
grant execute on function
  public.gaga_accept_friend_request(uuid),
  public.gaga_decline_friend_request(uuid),
  public.gaga_cancel_friend_request(uuid)
  to authenticated;

-- Refresh PostgREST's schema cache so the new signatures are immediately
-- callable over the Data API.
notify pgrst, 'reload schema';
