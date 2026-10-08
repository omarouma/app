-- Distinguish *why* a call is refused so the client can show an actionable
-- sentence instead of the generic "You don't have permission to do that.".
--
-- `public.gaga_can_call` only returns a boolean, which conflated four very
-- different situations behind one 403: an expired auth session, a blocked
-- relationship, a callee who disabled calls, and a missing friendship (the
-- default `calls = FRIENDS` policy). The `create-call` Edge Function could not
-- tell them apart, so every refusal looked identical to the user.
--
-- `gaga_call_admission` returns a machine-readable reason that the Edge
-- Function maps to a specific HTTP status + message. It is additive and reuses
-- the existing privacy helpers, so it never changes who is allowed to call.

create or replace function gaga_private.call_admission(caller uuid, callee uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare policy jsonb;
begin
  if not gaga_private.session_active() then
    return 'SESSION_EXPIRED';
  end if;
  if caller is null or callee is null then
    return 'INVALID_CALL_REQUEST';
  end if;
  if caller = callee then
    return 'CANNOT_CALL_SELF';
  end if;
  if not exists (select 1 from public.users u where u.id = callee) then
    return 'USER_NOT_FOUND';
  end if;
  if gaga_private.blocked(caller, callee) then
    return 'BLOCKED';
  end if;
  policy := gaga_private.policy(callee);
  if not gaga_private.visible(callee, caller, policy->>'calls') then
    -- Default call audience is FRIENDS; surface the missing friendship
    -- explicitly so the caller knows what to do about it.
    if coalesce(policy->>'calls', 'FRIENDS') = 'FRIENDS' and not gaga_private.friends(callee, caller) then
      return 'NOT_FRIENDS';
    end if;
    return 'CALLS_DISABLED';
  end if;
  -- A callee who only accepts message requests also only accepts calls from
  -- friends or from a sender whose message request they already accepted.
  if policy->>'messages' = 'REQUESTS'
     and not gaga_private.friends(caller, callee)
     and not exists (select 1 from public.gaga_message_requests
                     where sender_id = caller and recipient_id = callee and status = 'accepted') then
    return 'NOT_FRIENDS';
  end if;
  return 'OK';
end $$;

create or replace function public.gaga_call_admission(callee uuid) returns text
language sql stable security invoker set search_path = '' as $$
  select gaga_private.call_admission(auth.uid(), callee)
$$;

revoke all on function gaga_private.call_admission(uuid, uuid) from public, anon;
grant execute on function gaga_private.call_admission(uuid, uuid) to authenticated, service_role;
revoke all on function public.gaga_call_admission(uuid) from public, anon;
grant execute on function public.gaga_call_admission(uuid) to authenticated, service_role;
