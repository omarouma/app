-- Prevent client-side premium activation for fiat/card/mobile-payment currencies.
-- Until a trusted payment-gateway callback verifies settlement, the authenticated
-- RPC may activate a plan only by atomically debiting the server-owned coin balance.

create or replace function public.activate_premium(
  p_plan_id text,
  p_currency text default 'coins'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_days integer;
  v_price_coins integer;
  v_expires timestamptz;
  v_wallet public.wallets;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode='42501';
  end if;

  if lower(coalesce(p_currency,'')) <> 'coins' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'payment_verification_required',
      'currency', p_currency
    );
  end if;

  case p_plan_id
    when 'premium' then v_days := 30; v_price_coins := 500;
    when 'vip' then v_days := 30; v_price_coins := 1200;
    when 'creator' then v_days := 30; v_price_coins := 2500;
    else raise exception 'Unknown plan';
  end case;

  perform public.ensure_wallet();
  select * into v_wallet
    from public.wallets
   where user_id = v_uid
   for update;

  if not found then raise exception 'Wallet not found'; end if;

  if coalesce(v_wallet.coins,0) < v_price_coins then
    return jsonb_build_object(
      'ok', false,
      'reason', 'insufficient_coins',
      'required', v_price_coins
    );
  end if;

  update public.wallets
     set coins = coins - v_price_coins,
         updated_at = timezone('utc',now())
   where user_id = v_uid;

  insert into public.wallet_transactions(
    user_id,type,amount,currency,description,metadata,created_at
  )
  values(
    v_uid,'spend',v_price_coins,'coins','Premium subscription',
    jsonb_build_object('kind','premium','plan',p_plan_id),
    timezone('utc',now())
  );

  v_expires := timezone('utc',now()) + (v_days || ' days')::interval;

  update public.users
     set is_premium = true,
         premium_expires_at = v_expires,
         updated_at = timezone('utc',now())
   where id = v_uid;

  insert into public.subscriptions(
    user_id,plan_id,plan_name,status,amount,currency,duration,
    started_at,expires_at,auto_renew,created_at
  )
  values(
    v_uid,p_plan_id,p_plan_id,'active',v_price_coins,'coins',
    v_days || ' days',timezone('utc',now()),v_expires,true,timezone('utc',now())
  );

  return jsonb_build_object('ok',true,'plan',p_plan_id,'expires_at',v_expires);
end;
$$;
