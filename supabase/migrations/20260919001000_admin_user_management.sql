-- ============================================================================
-- Server-authoritative admin user management
-- ============================================================================
-- Problem
-- -------
-- AdminPage performed moderation by writing directly to OTHER users' rows:
--
--     updateDocById(USERS, targetUser.id, { verified: true })
--     updateDocById(USERS, targetUser.id, { status: 'banned' })
--     updateDocById(USERS, targetUser.id, { isAdmin: true })
--
-- RLS policy `users_update_own` (USING id = auth.uid()) rejects every one of
-- these, so admin moderation silently no-ops. There is no admin UPDATE policy
-- on `users`.
--
-- Fix
-- ---
-- Add `admin_update_user(p_user_id uuid, p_status text, p_is_verified boolean,
-- p_is_admin boolean)` (SECURITY DEFINER) that:
--   * requires the caller to be an admin (public.is_admin()),
--   * whitelists the mutable fields,
--   * refuses to let an admin demote/ban themselves (lockout guard).
-- ============================================================================

create or replace function public.admin_update_user(
  p_user_id uuid,
  p_status text default null,
  p_is_verified boolean default null,
  p_is_admin boolean default null
)
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
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;
  if p_user_id is null or not exists (select 1 from public.users where id = p_user_id) then
    return jsonb_build_object('ok', false, 'reason', 'user_not_found');
  end if;

  -- Lockout guard: an admin may not ban or demote themselves.
  if p_user_id = v_me then
    if p_status in ('banned', 'suspended') then
      return jsonb_build_object('ok', false, 'reason', 'cannot_moderate_self');
    end if;
    if p_is_admin is not null and p_is_admin = false then
      return jsonb_build_object('ok', false, 'reason', 'cannot_demote_self');
    end if;
  end if;

  if p_status is not null and p_status not in ('active', 'suspended', 'banned') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_status');
  end if;

  update public.users
     set status      = coalesce(p_status, status),
         is_verified = coalesce(p_is_verified, is_verified),
         is_admin    = coalesce(p_is_admin, is_admin),
         updated_at  = now()
   where id = p_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_update_user(uuid, text, boolean, boolean) from public;
revoke all on function public.admin_update_user(uuid, text, boolean, boolean) from anon;
grant execute on function public.admin_update_user(uuid, text, boolean, boolean) to authenticated;

comment on function public.admin_update_user(uuid, text, boolean, boolean) is
  'Admin-only moderation of another user''s status / verification / admin flag. RLS blocks direct cross-user writes, so this runs as SECURITY DEFINER after an is_admin() check.';
