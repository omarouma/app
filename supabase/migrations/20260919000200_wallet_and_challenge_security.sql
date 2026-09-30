-- ============================================================================
-- SECURITY FIX: challenge reward minting + anon EXECUTE hardening
-- ----------------------------------------------------------------------------
-- 1. public.claim_challenge_coins(p_challenge_id uuid, p_amount integer) trusted a
--    CLIENT-SUPPLIED amount and credited it straight to the caller's wallet.
--    Any authenticated user could mint unlimited coins by calling the RPC with
--    an arbitrary p_amount. The reward MUST come from the server-side
--    daily_challenges.reward_coins row, and the challenge must be active and
--    within its validity window.
--
-- 2. Several SECURITY DEFINER wallet/account RPCs were EXECUTE-able by the
--    `anon` role. They all guard on auth.uid(), but granting anon EXECUTE is
--    unnecessary attack surface. Revoke it (defense in depth).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Server-authoritative challenge reward
-- ---------------------------------------------------------------------------
create or replace function public.claim_challenge_coins(
  p_challenge_id uuid,
  p_amount integer default null   -- kept for backward-compat; IGNORED
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_reward integer;
  v_active boolean;
  v_starts timestamptz;
  v_ends   timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_challenge_id is null then
    raise exception 'Invalid challenge';
  end if;

  -- Server-side reward + validity window. The client-supplied p_amount is
  -- deliberately ignored so it cannot be used to mint arbitrary coins.
  select reward_coins, is_active, starts_at, ends_at
    into v_reward, v_active, v_starts, v_ends
  from public.daily_challenges
  where id = p_challenge_id;

  if v_reward is null then
    raise exception 'Challenge not found';
  end if;
  if coalesce(v_active, false) is not true then
    raise exception 'Challenge is not active';
  end if;
  if v_starts is not null and now() < v_starts then
    raise exception 'Challenge has not started';
  end if;
  if v_ends is not null and now() > v_ends then
    raise exception 'Challenge has ended';
  end if;
  if v_reward <= 0 then
    raise exception 'Invalid reward';
  end if;

  -- Idempotency: only completed participations may claim, and only once.
  if not exists (
    select 1 from public.challenge_participations
    where user_id = auth.uid()
      and challenge_id = p_challenge_id
      and completed = true
  ) then
    raise exception 'Challenge not completed';
  end if;

  if exists (
    select 1 from public.wallet_transactions
    where user_id = auth.uid()
      and type = 'earn'
      and metadata->>'challenge_id' = p_challenge_id::text
  ) then
    return false; -- already claimed
  end if;

  perform public.ensure_wallet();

  update public.wallets
    set coins = coins + v_reward,
        updated_at = timezone('utc', now())
    where user_id = auth.uid();

  insert into public.wallet_transactions (user_id, type, amount, currency, description, metadata, created_at)
  values (
    auth.uid(), 'earn', v_reward, 'coins',
    'Challenge reward',
    jsonb_build_object('challenge_id', p_challenge_id::text, 'kind', 'challenge'),
    timezone('utc', now())
  );

  return true;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Revoke anon EXECUTE on auth-required SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
  fns text[] := array[
    'delete_user()',
    'delete_own_account()',
    'wallet_transfer(uuid,numeric,text,text)',
    'wallet_transfer(uuid,uuid,numeric,text,text)',
    'wallet_withdraw(numeric,text,text)',
    'wallet_withdraw(uuid,numeric,text,text)',
    'wallet_spend_coins(integer,text)',
    'wallet_spend_coins(uuid,numeric,text)',
    'wallet_convert(text,text,numeric)',
    'wallet_convert(uuid,numeric,text,text)',
    'wallet_claim_daily_interest()',
    'wallet_claim_daily_interest(uuid)',
    'wallet_claim_daily_checkin(uuid)',
    'claim_challenge_coins(uuid,integer)',
    'claim_challenge_coins(uuid,uuid)',
    'ensure_wallet()'
  ];
begin
  foreach fn in array fns loop
    begin
      -- Functions created without an explicit ACL inherit EXECUTE for PUBLIC,
      -- which includes anon. Revoke from PUBLIC and re-grant to authenticated.
      execute format('revoke execute on function public.%s from public', fn);
      execute format('grant execute on function public.%s to authenticated', fn);
    exception when others then
      -- function signature may not exist; ignore
      null;
    end;
  end loop;
end $$;
