-- ============================================================================
-- Server-authoritative daily challenges
-- ============================================================================
-- The client previously awarded challenge coins by writing `coins` straight to
-- public.users. That is now blocked by the privilege guard trigger, and it was
-- never safe anyway (a user could mint arbitrary coins). This migration makes
-- the reward path server-authoritative:
--
--   1. Seeds the canonical challenge definitions into public.daily_challenges
--      (stable ids, one row per challenge_type) so rewards are server-owned.
--   2. Adds public.claim_daily_challenge(p_challenge_type text) which:
--        * looks up the reward from daily_challenges (ignores any client amount)
--        * enforces one claim per user / per challenge_type / per UTC day
--        * credits public.wallets.coins and records a wallet_transaction
-- ============================================================================

-- 1. Seed challenge definitions (idempotent on challenge_type).
insert into public.daily_challenges (id, title, description, challenge_type, reward_coins, difficulty, is_active, starts_at, created_at)
values
  ('11111111-0000-4000-8000-000000000001', 'Social Butterfly', 'Send 10 messages today',            'chat',       50, 'easy',   true, now(), now()),
  ('11111111-0000-4000-8000-000000000002', 'Content Creator',  'Share 1 post on the timeline',      'post',       75, 'easy',   true, now(), now()),
  ('11111111-0000-4000-8000-000000000003', 'Reel Star',        'Watch 5 reels',                     'reel',       40, 'easy',   true, now(), now()),
  ('11111111-0000-4000-8000-000000000004', 'Voice Connect',    'Make a voice or video call',        'call',       60, 'easy',   true, now(), now()),
  ('11111111-0000-4000-8000-000000000005', 'Network Builder',  'Add 1 new friend',                  'friend',     80, 'medium', true, now(), now()),
  ('11111111-0000-4000-8000-000000000006', 'Storyteller',      'Add a story',                       'story',      50, 'easy',   true, now(), now()),
  ('11111111-0000-4000-8000-000000000007', 'Engager',          'React to 10 posts or reels',        'react',      30, 'easy',   true, now(), now()),
  ('11111111-0000-4000-8000-000000000008', 'Talk Show',        'Join a voice room for 5 minutes',   'voice_room', 70, 'medium', true, now(), now())
on conflict (id) do update
  set title = excluded.title,
      description = excluded.description,
      challenge_type = excluded.challenge_type,
      reward_coins = excluded.reward_coins,
      difficulty = excluded.difficulty,
      is_active = excluded.is_active;

-- 2. Server-authoritative claim function.
create or replace function public.claim_daily_challenge(p_challenge_type text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_reward integer;
  v_today  date := (timezone('utc', now()))::date;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_challenge_type is null or length(trim(p_challenge_type)) = 0 then
    raise exception 'Invalid challenge type';
  end if;

  -- Reward is owned by the server; any client-supplied amount is ignored.
  select reward_coins into v_reward
  from public.daily_challenges
  where challenge_type = p_challenge_type
    and coalesce(is_active, false) = true
  order by created_at desc
  limit 1;

  if v_reward is null then
    raise exception 'Unknown or inactive challenge';
  end if;
  if v_reward <= 0 then
    raise exception 'Invalid reward';
  end if;

  -- One claim per user / challenge_type / UTC day.
  if exists (
    select 1 from public.wallet_transactions
    where user_id = v_uid
      and type = 'earn'
      and metadata->>'kind' = 'daily_challenge'
      and metadata->>'challenge_type' = p_challenge_type
      and (timezone('utc', created_at))::date = v_today
  ) then
    return jsonb_build_object('claimed', false, 'reason', 'already_claimed', 'coins', 0);
  end if;

  perform public.ensure_wallet();

  update public.wallets
    set coins = coins + v_reward,
        updated_at = timezone('utc', now())
    where user_id = v_uid;

  insert into public.wallet_transactions (user_id, type, amount, currency, description, metadata, created_at)
  values (
    v_uid, 'earn', v_reward, 'coins', 'Daily challenge reward',
    jsonb_build_object('kind', 'daily_challenge', 'challenge_type', p_challenge_type),
    timezone('utc', now())
  );

  return jsonb_build_object('claimed', true, 'coins', v_reward);
end;
$$;

-- Lock down execution: authenticated users only.
revoke all on function public.claim_daily_challenge(text) from public;
revoke all on function public.claim_daily_challenge(text) from anon;
grant execute on function public.claim_daily_challenge(text) to authenticated;

comment on function public.claim_daily_challenge(text) is
  'Server-authoritative daily challenge reward. Looks up the reward from daily_challenges, enforces one claim per user/type/UTC-day, and credits wallets.coins.';
