-- ============================================================================
-- Server-authoritative follow / unfollow
-- ============================================================================
-- Problem
-- -------
-- The client implemented follow/unfollow by writing to BOTH the current user's
-- row (`following`) and the TARGET user's row (`followers`) directly:
--
--     updateDocById(USERS, currentUserId, { following: arrayUnion(userId) })
--     updateDocById(USERS, userId,        { followers: arrayUnion(currentUserId) })
--
-- The second write targets a row that is NOT owned by the caller. RLS policy
-- `users_update_own` (USING id = auth.uid()) silently rejects it, so the
-- target user's `followers` list never updates. The follower count is therefore
-- permanently wrong for everyone except the caller.
--
-- Fix
-- ---
-- Add SECURITY DEFINER RPCs `follow_user(p_target uuid)` / `unfollow_user(...)`
-- that update both sides atomically under the function owner's privileges,
-- while still enforcing auth.uid() as the actor. Also keeps the denormalised
-- `followers` / `following` counters in sync.
-- ============================================================================

create or replace function public.follow_user(p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_target is null or p_target = v_me then
    return jsonb_build_object('ok', false, 'reason', 'invalid_target');
  end if;
  if not exists (select 1 from public.users where id = p_target) then
    return jsonb_build_object('ok', false, 'reason', 'target_not_found');
  end if;

  -- Idempotent: only mutate when the relationship does not already exist.
  update public.users
     set following = (
           case when following is null or not (p_target = any(following))
                then array_append(coalesce(following, '{}'), p_target)
                else following end)
   where id = v_me;

  update public.users
     set followers = (
           case when followers is null or not (v_me = any(followers))
                then array_append(coalesce(followers, '{}'), v_me)
                else followers end)
   where id = p_target;

  -- Keep the denormalised follower counter consistent with the array.
  update public.users
     set friend_count = coalesce(array_length(followers, 1), 0)
   where id = p_target;

  return jsonb_build_object('ok', true, 'following', true);
end;
$$;

create or replace function public.unfollow_user(p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_target is null or p_target = v_me then
    return jsonb_build_object('ok', false, 'reason', 'invalid_target');
  end if;

  update public.users
     set following = array_remove(coalesce(following, '{}'), p_target)
   where id = v_me;

  update public.users
     set followers = array_remove(coalesce(followers, '{}'), v_me)
   where id = p_target;

  update public.users
     set friend_count = coalesce(array_length(followers, 1), 0)
   where id = p_target;

  return jsonb_build_object('ok', true, 'following', false);
end;
$$;

revoke all on function public.follow_user(uuid) from public;
revoke all on function public.follow_user(uuid) from anon;
grant execute on function public.follow_user(uuid) to authenticated;

revoke all on function public.unfollow_user(uuid) from public;
revoke all on function public.unfollow_user(uuid) from anon;
grant execute on function public.unfollow_user(uuid) to authenticated;

comment on function public.follow_user(uuid) is
  'Server-authoritative follow. Updates both the caller''s `following` and the target''s `followers` atomically (RLS would otherwise block the cross-user write).';
comment on function public.unfollow_user(uuid) is
  'Server-authoritative unfollow. Mirror of follow_user().';
