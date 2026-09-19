-- ============================================================================
-- Server-authoritative premium activation
-- ============================================================================
-- The client previously activated premium by writing `is_premium` /
-- `premium_expires_at` straight to public.users. Those columns are now frozen
-- by the privilege guard trigger, so activation must happen server-side.
--
-- public.activate_premium(p_plan_id text, p_currency text) returns jsonb:
--   * validates the plan id against a server-owned price table
--   * for currency = 'coins'  -> deducts the coin price from the wallet
--     (fails if the balance is insufficient) and grants premium
--   * for currency = 'usd'    -> grants premium and records the subscription.
--     NOTE: no payment gateway is wired yet; this is the single choke point
--     where a real charge/verification must be added before launch.
--   * writes users.is_premium / premium_expires_at and a subscriptions row
-- ============================================================================

create or replace function public.activate_premium(p_plan_id text, p_currency text default 'usd')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_days       integer;
  v_price_usd  numeric;
  v_price_coins integer;
  v_expires    timestamptz;
  v_wallet     public.wallets;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Server-owned plan catalogue.
  case p_plan_id
    when 'premium' then v_days := 30;  v_price_usd := 1.99;  v_price_coins := 500;
    when 'vip'     then v_days := 30;  v_price_usd := 4.99;  v_price_coins := 1200;
    when 'creator' then v_days := 30;  v_price_usd := 9.99;  v_price_coins := 2500;
    else
      raise exception 'Unknown plan';
  end case;

  if p_currency = 'coins' then
    perform public.ensure_wallet();
    select * into v_wallet from public.wallets where user_id = v_uid for update;
    if not found then
      raise exception 'Wallet not found';
    end if;
    if coalesce(v_wallet.coins, 0) < v_price_coins then
      return jsonb_build_object('ok', false, 'reason', 'insufficient_coins', 'required', v_price_coins);
    end if;
    update public.wallets
      set coins = coins - v_price_coins, updated_at = timezone('utc', now())
      where user_id = v_uid;
    insert into public.wallet_transactions (user_id, type, amount, currency, description, metadata, created_at)
    values (v_uid, 'spend', v_price_coins, 'coins', 'Premium subscription',
            jsonb_build_object('kind', 'premium', 'plan', p_plan_id), timezone('utc', now()));
  end if;

  v_expires := timezone('utc', now()) + (v_days || ' days')::interval;

  update public.users
    set is_premium = true,
        premium_expires_at = v_expires,
        updated_at = timezone('utc', now())
    where id = v_uid;

  insert into public.subscriptions (user_id, plan_id, plan_name, status, amount, currency, duration, started_at, expires_at, auto_renew, created_at)
  values (v_uid, p_plan_id, p_plan_id, 'active',
          case when p_currency = 'coins' then v_price_coins else v_price_usd end,
          p_currency, v_days || ' days', timezone('utc', now()), v_expires, true, timezone('utc', now()));

  return jsonb_build_object('ok', true, 'plan', p_plan_id, 'expires_at', v_expires);
end;
$$;

create or replace function public.cancel_premium()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  update public.users
    set is_premium = false, premium_expires_at = null, updated_at = timezone('utc', now())
    where id = v_uid;
  update public.subscriptions
    set status = 'cancelled', auto_renew = false
    where user_id = v_uid and status = 'active';
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.activate_premium(text, text) from public;
revoke all on function public.activate_premium(text, text) from anon;
grant execute on function public.activate_premium(text, text) to authenticated;

revoke all on function public.cancel_premium() from public;
revoke all on function public.cancel_premium() from anon;
grant execute on function public.cancel_premium() to authenticated;

comment on function public.activate_premium(text, text) is
  'Server-authoritative premium activation. Deducts coins for the coins path; grants is_premium/premium_expires_at and records a subscription. USD path is the choke point for a future payment gateway.';
