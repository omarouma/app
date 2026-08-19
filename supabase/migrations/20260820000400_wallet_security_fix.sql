-- CRITICAL SECURITY FIX: Restrict wallet RPCs to prevent self-crediting abuse
-- This migration revokes public access to earning/deposit and creates admin-only functions.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. REVOKE PUBLIC ACCESS TO UNSAFE WALLET RPCs
-- ═══════════════════════════════════════════════════════════════════════════

-- Revoke public access to self-crediting functions
REVOKE EXECUTE ON FUNCTION public.wallet_earn_coins(NUMERIC, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.wallet_deposit(NUMERIC, TEXT, TEXT) FROM authenticated;

-- Users may only transfer their own coins to others (already has balance check)
-- wallet_withdraw, wallet_transfer, wallet_convert remain user-accessible with validation

-- PostgreSQL grants EXECUTE to PUBLIC by default. Revoke it explicitly for
-- every wallet function before granting only the intended roles below.
REVOKE EXECUTE ON FUNCTION public.wallet_earn_coins(NUMERIC, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.wallet_deposit(NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.wallet_withdraw(NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.wallet_transfer(TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.wallet_convert(NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.wallet_claim_daily_interest() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.wallet_spend_coins(
  p_amount NUMERIC,
  p_description TEXT DEFAULT 'Spent coins'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
  v_user_id TEXT := auth.uid()::text;
  v_tx JSONB;
BEGIN
  IF v_user_id IS NULL OR v_user_id = '' THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  v_tx := jsonb_build_object(
    'id', 'tx_' || gen_random_uuid()::text,
    'type', 'spend',
    'amount', p_amount,
    'currency', 'coins',
    'description', COALESCE(p_description, 'Spent coins'),
    'timestamp', now()::text,
    'status', 'completed'
  );

  UPDATE wallets
  SET coins = coins - p_amount,
      transactions = COALESCE(transactions, '[]'::jsonb) || v_tx,
      updated_at = now()
  WHERE user_id = v_user_id AND coins >= p_amount;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wallet_spend_coins(NUMERIC, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.wallet_spend_coins(NUMERIC, TEXT) FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. ADMIN-ONLY: Award coins for verified activities (challenges, referrals, etc.)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_award_coins(
  p_user_id TEXT,
  p_amount NUMERIC,
  p_reason TEXT,
  p_source TEXT DEFAULT 'admin'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
  v_tx JSONB;
  v_admin_id TEXT := auth.uid()::text;
  v_user_is_admin BOOLEAN;
BEGIN
  -- Verify caller is admin
  SELECT is_admin INTO v_user_is_admin FROM users WHERE id = v_admin_id;
  IF NOT v_user_is_admin THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  IF p_user_id IS NULL OR p_user_id = '' THEN
    RAISE EXCEPTION 'User ID required';
  END IF;

  -- Ensure wallet exists
  INSERT INTO wallets (id, user_id, coins, usd_balance, bdt_balance, transactions)
  VALUES (p_user_id, p_user_id, 0, 0, 0, '[]'::jsonb)
  ON CONFLICT (user_id) DO NOTHING;

  v_tx := jsonb_build_object(
    'id', 'tx_' || gen_random_uuid()::text,
    'type', 'award',
    'amount', p_amount,
    'currency', 'coins',
    'description', COALESCE(p_reason, 'Admin award'),
    'source', p_source,
    'admin_id', v_admin_id,
    'timestamp', now()::text,
    'status', 'completed'
  );

  UPDATE wallets
  SET coins = coins + p_amount,
      total_earned = COALESCE(total_earned, 0) + p_amount,
      transactions = COALESCE(transactions, '[]'::jsonb) || v_tx,
      updated_at = now()
  WHERE user_id = p_user_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_award_coins(TEXT, NUMERIC, TEXT, TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.admin_award_coins(TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. CHALLENGE/SYSTEM-VERIFIED: Award coins only when condition is met
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.claim_challenge_coins(
  p_challenge_id TEXT,
  p_amount NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
  v_user_id TEXT := auth.uid()::text;
  v_tx JSONB;
  v_challenge_exists BOOLEAN;
BEGIN
  IF v_user_id IS NULL OR v_user_id = '' THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify challenge exists and belongs to this user
  SELECT EXISTS(
    SELECT 1 FROM daily_challenges
    WHERE id = p_challenge_id AND user_id = v_user_id AND completed = true AND claimed = false
  ) INTO v_challenge_exists;

  IF NOT v_challenge_exists THEN
    RAISE EXCEPTION 'Challenge not found or already claimed';
  END IF;

  -- Ensure wallet exists
  INSERT INTO wallets (id, user_id, coins, usd_balance, bdt_balance, transactions)
  VALUES (v_user_id, v_user_id, 0, 0, 0, '[]'::jsonb)
  ON CONFLICT (user_id) DO NOTHING;

  v_tx := jsonb_build_object(
    'id', 'tx_' || gen_random_uuid()::text,
    'type', 'challenge',
    'amount', p_amount,
    'currency', 'coins',
    'description', 'Challenge reward: ' || p_challenge_id,
    'timestamp', now()::text,
    'status', 'completed'
  );

  UPDATE wallets
  SET coins = coins + p_amount,
      total_earned = COALESCE(total_earned, 0) + p_amount,
      transactions = COALESCE(transactions, '[]'::jsonb) || v_tx,
      updated_at = now()
  WHERE user_id = v_user_id;

  -- Mark challenge as claimed
  UPDATE daily_challenges SET claimed = true WHERE id = p_challenge_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_challenge_coins(TEXT, NUMERIC) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_challenge_coins(TEXT, NUMERIC) FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. FIX: wallet_convert must use server-side rates, not client-supplied
-- ═══════════════════════════════════════════════════════════════════════════

-- Server-side exchange rate configuration
CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate NUMERIC NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(from_currency, to_currency)
);

INSERT INTO exchange_rates (from_currency, to_currency, rate) VALUES
  ('coins', 'usd', 0.0071),
  ('usd', 'coins', 140.85),
  ('coins', 'bdt', 0.76),
  ('bdt', 'coins', 1.32)
ON CONFLICT (from_currency, to_currency) DO UPDATE SET rate = EXCLUDED.rate;

-- Updated wallet_convert: uses server rates, not client-supplied
CREATE OR REPLACE FUNCTION public.wallet_convert(
  p_amount NUMERIC,
  p_from_currency TEXT DEFAULT 'coins',
  p_to_currency TEXT DEFAULT 'usd'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
  v_user_id TEXT := auth.uid()::text;
  v_tx JSONB;
  v_from TEXT := LOWER(COALESCE(p_from_currency, 'coins'));
  v_to TEXT := LOWER(COALESCE(p_to_currency, 'usd'));
  v_from_balance NUMERIC;
  v_converted NUMERIC;
  v_server_rate NUMERIC;
BEGIN
  IF v_user_id IS NULL OR v_user_id = '' THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  IF v_from NOT IN ('coins', 'usd', 'bdt') OR v_to NOT IN ('coins', 'usd', 'bdt') THEN
    RAISE EXCEPTION 'Unsupported currency';
  END IF;
  IF v_from = v_to THEN
    RAISE EXCEPTION 'Cannot convert to same currency';
  END IF;

  -- IMPORTANT: Ignore client-supplied rate and use server-side rate only
  SELECT rate INTO v_server_rate
  FROM exchange_rates
  WHERE from_currency = v_from AND to_currency = v_to;

  IF v_server_rate IS NULL OR v_server_rate <= 0 THEN
    RAISE EXCEPTION 'Exchange rate not available for this currency pair';
  END IF;

  SELECT CASE
    WHEN v_from = 'coins' THEN coins
    WHEN v_from = 'usd' THEN usd_balance
    WHEN v_from = 'bdt' THEN bdt_balance
  END INTO v_from_balance
  FROM wallets WHERE user_id = v_user_id;

  IF v_from_balance IS NULL OR v_from_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  v_converted := ROUND(p_amount * v_server_rate * 100) / 100;

  v_tx := jsonb_build_object(
    'id', 'tx_' || gen_random_uuid()::text,
    'type', 'convert',
    'amount', p_amount,
    'currency', v_from,
    'description', 'Converted ' || p_amount || ' ' || v_from || ' to ' || v_converted || ' ' || v_to,
    'timestamp', now()::text,
    'status', 'completed'
  );

  -- Debit from source
  IF v_from = 'coins' THEN
    UPDATE wallets SET coins = coins - p_amount,
      transactions = COALESCE(transactions, '[]'::jsonb) || v_tx,
      updated_at = now()
    WHERE user_id = v_user_id;
  ELSIF v_from = 'usd' THEN
    UPDATE wallets SET usd_balance = usd_balance - p_amount,
      transactions = COALESCE(transactions, '[]'::jsonb) || v_tx,
      updated_at = now()
    WHERE user_id = v_user_id;
  ELSIF v_from = 'bdt' THEN
    UPDATE wallets SET bdt_balance = bdt_balance - p_amount,
      transactions = COALESCE(transactions, '[]'::jsonb) || v_tx,
      updated_at = now()
    WHERE user_id = v_user_id;
  END IF;

  -- Credit to destination
  IF v_to = 'coins' THEN
    UPDATE wallets SET coins = coins + v_converted,
      updated_at = now()
    WHERE user_id = v_user_id;
  ELSIF v_to = 'usd' THEN
    UPDATE wallets SET usd_balance = usd_balance + v_converted,
      updated_at = now()
    WHERE user_id = v_user_id;
  ELSIF v_to = 'bdt' THEN
    UPDATE wallets SET bdt_balance = bdt_balance + v_converted,
      updated_at = now()
    WHERE user_id = v_user_id;
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wallet_convert(NUMERIC, TEXT, TEXT) TO authenticated;
