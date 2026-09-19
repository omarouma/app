-- ============================================================================
-- Server-authoritative referral application
-- ============================================================================
-- The client previously tried to increment the *referrer's* `referral_count`
-- directly, which RLS (`users_update_own`) already blocked (a user cannot update
-- another user's row), and `referral_count` is now frozen by the privilege
-- guard trigger. This RPC performs the whole flow server-side:
--   * resolves the referrer from the code
--   * rejects self-referral and repeat referrals
--   * sets users.referred_by for the caller
--   * increments the referrer's referral_count
--   * records a referrals row
-- ============================================================================

create or replace function public.apply_referral(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_prefix    text;
  v_referrer  uuid;
  v_existing  text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_code is null or p_code not like 'GAGA-%' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  v_prefix := lower(replace(p_code, 'GAGA-', ''));

  select id into v_referrer
  from public.users
  where lower(id::text) like v_prefix || '%'
  limit 1;

  if v_referrer is null then
    return jsonb_build_object('ok', false, 'reason', 'referrer_not_found');
  end if;
  if v_referrer = v_uid then
    return jsonb_build_object('ok', false, 'reason', 'self_referral');
  end if;

  select referred_by into v_existing from public.users where id = v_uid;
  if v_existing is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_referred');
  end if;

  update public.users set referred_by = v_referrer::text, updated_at = timezone('utc', now()) where id = v_uid;
  update public.users set referral_count = coalesce(referral_count, 0) + 1, updated_at = timezone('utc', now()) where id = v_referrer;

  insert into public.referrals (referrer_id, referred_id, referral_code, reward_coins, status, created_at)
  values (v_referrer, v_uid, p_code, 100, 'rewarded', timezone('utc', now()));

  return jsonb_build_object('ok', true, 'referrer_id', v_referrer);
end;
$$;

revoke all on function public.apply_referral(text) from public;
revoke all on function public.apply_referral(text) from anon;
grant execute on function public.apply_referral(text) to authenticated;

comment on function public.apply_referral(text) is
  'Server-authoritative referral application: resolves referrer, blocks self/repeat referrals, sets referred_by, increments referral_count, records a referrals row.';
