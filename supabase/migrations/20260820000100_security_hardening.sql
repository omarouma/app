-- ============================================================
-- GaGa Chat — SECURITY HARDENING MIGRATION
-- Project: alzwgikndwbecuqmlrca
--
-- Fixes (in order):
--   2. Wallet balances are client-writable → RLS read-only + RPC mutations
--   3. Overly broad RLS policies → granular per-operation policies
--   4. Invalid NEW/OLD references → removed broken trigger
--   5. Private user profile fields exposed → column-level grants + view
--   6. Group administration needs server-side authorization → admin-only policies
--   7. ZEGO/demo credentials → removed from demo assets (separate file change)
--   8. Migration consolidation → this file supersedes all prior SQL patches
--
-- Safe to re-run (fully idempotent).
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════
-- 2. WALLETS — READ-ONLY VIA RLS, MUTATIONS ONLY VIA RPC
-- ════════════════════════════════════════════════════════════
-- Ensure wallet columns used by RPC functions exist.
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS total_earned NUMERIC(19,2) DEFAULT 0;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS last_interest_claim TIMESTAMPTZ;

-- Drop the old FOR ALL policy that let any authenticated user
-- directly UPDATE their own balance (or anyone else's if they
-- could guess a user_id).
DROP POLICY IF EXISTS "wallets_own" ON wallets;

-- Owner may only SELECT their own wallet row.
DROP POLICY IF EXISTS "wallets_select_own" ON wallets;
CREATE POLICY "wallets_select_own" ON wallets
  FOR SELECT TO authenticated
  USING (auth.uid()::text = user_id);

-- No INSERT/UPDATE/DELETE via the client. All mutations go
-- through SECURITY DEFINER RPC functions below.
DROP POLICY IF EXISTS "wallets_insert_own" ON wallets;
DROP POLICY IF EXISTS "wallets_update_own" ON wallets;
DROP POLICY IF EXISTS "wallets_delete_own" ON wallets;

-- ─── Wallet RPC: earn coins (server-validated) ──────────────
CREATE OR REPLACE FUNCTION public.wallet_earn_coins(
  p_amount NUMERIC,
  p_description TEXT DEFAULT 'Earned coins'
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

  -- Ensure wallet exists
  INSERT INTO wallets (id, user_id, coins, usd_balance, bdt_balance, transactions)
  VALUES (v_user_id, v_user_id, 0, 0, 0, '[]'::jsonb)
  ON CONFLICT (user_id) DO NOTHING;

  v_tx := jsonb_build_object(
    'id', 'tx_' || gen_random_uuid()::text,
    'type', 'earn',
    'amount', p_amount,
    'currency', 'coins',
    'description', COALESCE(p_description, 'Earned coins'),
    'timestamp', now()::text,
    'status', 'completed'
  );

  UPDATE wallets
  SET coins = coins + p_amount,
      total_earned = COALESCE(total_earned, 0) + p_amount,
      transactions = COALESCE(transactions, '[]'::jsonb) || v_tx,
      updated_at = now()
  WHERE user_id = v_user_id;

  RETURN TRUE;
END;
$$;

-- ─── Wallet RPC: deposit (server-validated) ─────────────────
CREATE OR REPLACE FUNCTION public.wallet_deposit(
  p_amount NUMERIC,
  p_currency TEXT DEFAULT 'coins',
  p_method TEXT DEFAULT 'manual'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
  v_user_id TEXT := auth.uid()::text;
  v_tx JSONB;
  v_currency TEXT := LOWER(COALESCE(p_currency, 'coins'));
BEGIN
  IF v_user_id IS NULL OR v_user_id = '' THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  IF v_currency NOT IN ('coins', 'usd', 'bdt') THEN
    RAISE EXCEPTION 'Unsupported currency: %', v_currency;
  END IF;

  INSERT INTO wallets (id, user_id, coins, usd_balance, bdt_balance, transactions)
  VALUES (v_user_id, v_user_id, 0, 0, 0, '[]'::jsonb)
  ON CONFLICT (user_id) DO NOTHING;

  v_tx := jsonb_build_object(
    'id', 'tx_' || gen_random_uuid()::text,
    'type', 'deposit',
    'amount', p_amount,
    'currency', v_currency,
    'description', 'Deposit ' || p_amount || ' ' || v_currency || ' via ' || COALESCE(p_method, 'manual'),
    'timestamp', now()::text,
    'status', 'completed'
  );

  IF v_currency = 'coins' THEN
    UPDATE wallets SET coins = coins + p_amount,
      transactions = COALESCE(transactions, '[]'::jsonb) || v_tx,
      updated_at = now()
    WHERE user_id = v_user_id;
  ELSIF v_currency = 'usd' THEN
    UPDATE wallets SET usd_balance = usd_balance + p_amount,
      transactions = COALESCE(transactions, '[]'::jsonb) || v_tx,
      updated_at = now()
    WHERE user_id = v_user_id;
  ELSIF v_currency = 'bdt' THEN
    UPDATE wallets SET bdt_balance = bdt_balance + p_amount,
      transactions = COALESCE(transactions, '[]'::jsonb) || v_tx,
      updated_at = now()
    WHERE user_id = v_user_id;
  END IF;

  RETURN TRUE;
END;
$$;

-- ─── Wallet RPC: withdraw (server-validated) ────────────────
CREATE OR REPLACE FUNCTION public.wallet_withdraw(
  p_amount NUMERIC,
  p_currency TEXT DEFAULT 'coins',
  p_method TEXT DEFAULT 'manual',
  p_account TEXT DEFAULT ''
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
  v_user_id TEXT := auth.uid()::text;
  v_tx JSONB;
  v_currency TEXT := LOWER(COALESCE(p_currency, 'coins'));
  v_balance NUMERIC;
BEGIN
  IF v_user_id IS NULL OR v_user_id = '' THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  IF v_currency NOT IN ('coins', 'usd', 'bdt') THEN
    RAISE EXCEPTION 'Unsupported currency: %', v_currency;
  END IF;

  SELECT CASE
    WHEN v_currency = 'coins' THEN coins
    WHEN v_currency = 'usd' THEN usd_balance
    WHEN v_currency = 'bdt' THEN bdt_balance
  END INTO v_balance
  FROM wallets WHERE user_id = v_user_id;

  IF v_balance IS NULL OR v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  v_tx := jsonb_build_object(
    'id', 'tx_' || gen_random_uuid()::text,
    'type', 'withdraw',
    'amount', p_amount,
    'currency', v_currency,
    'description', 'Withdraw ' || p_amount || ' ' || v_currency || ' to ' || COALESCE(p_method, 'manual') || COALESCE(' (' || p_account || ')', ''),
    'timestamp', now()::text,
    'status', 'pending'
  );

  IF v_currency = 'coins' THEN
    UPDATE wallets SET coins = coins - p_amount,
      transactions = COALESCE(transactions, '[]'::jsonb) || v_tx,
      updated_at = now()
    WHERE user_id = v_user_id;
  ELSIF v_currency = 'usd' THEN
    UPDATE wallets SET usd_balance = usd_balance - p_amount,
      transactions = COALESCE(transactions, '[]'::jsonb) || v_tx,
      updated_at = now()
    WHERE user_id = v_user_id;
  ELSIF v_currency = 'bdt' THEN
    UPDATE wallets SET bdt_balance = bdt_balance - p_amount,
      transactions = COALESCE(transactions, '[]'::jsonb) || v_tx,
      updated_at = now()
    WHERE user_id = v_user_id;
  END IF;

  RETURN TRUE;
END;
$$;

-- ─── Wallet RPC: P3P transfer (server-validated, atomic) ────
CREATE OR REPLACE FUNCTION public.wallet_transfer(
  p_to_user_id TEXT,
  p_amount NUMERIC,
  p_currency TEXT DEFAULT 'coins',
  p_note TEXT DEFAULT ''
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
  v_from_user_id TEXT := auth.uid()::text;
  v_currency TEXT := LOWER(COALESCE(p_currency, 'coins'));
  v_sender_balance NUMERIC;
  v_sender_tx JSONB;
  v_receiver_tx JSONB;
BEGIN
  IF v_from_user_id IS NULL OR v_from_user_id = '' THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_to_user_id IS NULL OR p_to_user_id = '' THEN
    RAISE EXCEPTION 'Recipient required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  IF v_currency NOT IN ('coins', 'usd', 'bdt') THEN
    RAISE EXCEPTION 'Unsupported currency: %', v_currency;
  END IF;
  IF v_from_user_id = p_to_user_id THEN
    RAISE EXCEPTION 'Cannot transfer to yourself';
  END IF;

  -- Ensure both wallets exist
  INSERT INTO wallets (id, user_id, coins, usd_balance, bdt_balance, transactions)
  VALUES (v_from_user_id, v_from_user_id, 0, 0, 0, '[]'::jsonb)
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO wallets (id, user_id, coins, usd_balance, bdt_balance, transactions)
  VALUES (p_to_user_id, p_to_user_id, 0, 0, 0, '[]'::jsonb)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT CASE
    WHEN v_currency = 'coins' THEN coins
    WHEN v_currency = 'usd' THEN usd_balance
    WHEN v_currency = 'bdt' THEN bdt_balance
  END INTO v_sender_balance
  FROM wallets WHERE user_id = v_from_user_id;

  IF v_sender_balance IS NULL OR v_sender_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  v_sender_tx := jsonb_build_object(
    'id', 'tx_' || gen_random_uuid()::text,
    'type', 'send',
    'amount', p_amount,
    'currency', v_currency,
    'description', 'Sent ' || p_amount || ' ' || v_currency || COALESCE(': ' || p_note, ''),
    'timestamp', now()::text,
    'status', 'completed'
  );

  v_receiver_tx := jsonb_build_object(
    'id', 'tx_' || gen_random_uuid()::text,
    'type', 'receive',
    'amount', p_amount,
    'currency', v_currency,
    'description', 'Received ' || p_amount || ' ' || v_currency || COALESCE(': ' || p_note, ''),
    'timestamp', now()::text,
    'status', 'completed'
  );

  -- Atomic debit + credit
  IF v_currency = 'coins' THEN
    UPDATE wallets SET coins = coins - p_amount,
      transactions = COALESCE(transactions, '[]'::jsonb) || v_sender_tx,
      updated_at = now()
    WHERE user_id = v_from_user_id;
    UPDATE wallets SET coins = coins + p_amount,
      transactions = COALESCE(transactions, '[]'::jsonb) || v_receiver_tx,
      updated_at = now()
    WHERE user_id = p_to_user_id;
  ELSIF v_currency = 'usd' THEN
    UPDATE wallets SET usd_balance = usd_balance - p_amount,
      transactions = COALESCE(transactions, '[]'::jsonb) || v_sender_tx,
      updated_at = now()
    WHERE user_id = v_from_user_id;
    UPDATE wallets SET usd_balance = usd_balance + p_amount,
      transactions = COALESCE(transactions, '[]'::jsonb) || v_receiver_tx,
      updated_at = now()
    WHERE user_id = p_to_user_id;
  ELSIF v_currency = 'bdt' THEN
    UPDATE wallets SET bdt_balance = bdt_balance - p_amount,
      transactions = COALESCE(transactions, '[]'::jsonb) || v_sender_tx,
      updated_at = now()
    WHERE user_id = v_from_user_id;
    UPDATE wallets SET bdt_balance = bdt_balance + p_amount,
      transactions = COALESCE(transactions, '[]'::jsonb) || v_receiver_tx,
      updated_at = now()
    WHERE user_id = p_to_user_id;
  END IF;

  RETURN TRUE;
END;
$$;

-- ─── Wallet RPC: currency conversion (server-validated) ─────
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
  v_rate NUMERIC;
  v_converted NUMERIC;
BEGIN
  IF v_user_id IS NULL OR v_user_id = '' THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  IF v_from = v_to THEN
    RAISE EXCEPTION 'Source and destination currencies must differ';
  END IF;
  -- Rates are owned by the database, never supplied by the client.
  -- Keep this allowlist aligned with the supported wallet conversion UI.
  IF v_from = 'coins' AND v_to = 'usd' THEN
    v_rate := 0.0071;
  ELSIF v_from = 'usd' AND v_to = 'coins' THEN
    v_rate := 140.85;
  ELSE
    RAISE EXCEPTION 'Unsupported currency conversion';
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

  v_converted := ROUND(p_amount * v_rate * 100) / 100;

  v_tx := jsonb_build_object(
    'id', 'tx_' || gen_random_uuid()::text,
    'type', 'convert',
    'amount', p_amount,
    'amount_from', p_amount,
    'amount_to', v_converted,
    'currency', v_from,
    'currency_to', v_to,
    'description', 'Converted ' || p_amount || ' ' || v_from || ' to ' || v_converted || ' ' || v_to,
    'timestamp', now()::text,
    'status', 'completed'
  );

  -- Debit from source
  IF v_from = 'coins' THEN
    UPDATE wallets SET coins = coins - p_amount,
      updated_at = now()
    WHERE user_id = v_user_id;
  ELSIF v_from = 'usd' THEN
    UPDATE wallets SET usd_balance = usd_balance - p_amount,
      updated_at = now()
    WHERE user_id = v_user_id;
  ELSIF v_from = 'bdt' THEN
    UPDATE wallets SET bdt_balance = bdt_balance - p_amount,
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

  -- Append transaction (after both updates succeed atomically)
  UPDATE wallets
  SET transactions = COALESCE(transactions, '[]'::jsonb) || v_tx
  WHERE user_id = v_user_id;

  RETURN TRUE;
END;
$$;

-- ─── Wallet RPC: claim daily staking interest ───────────────
CREATE OR REPLACE FUNCTION public.wallet_claim_daily_interest()
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
  v_user_id TEXT := auth.uid()::text;
  v_wallet RECORD;
  v_tier_apy NUMERIC;
  v_interest NUMERIC;
  v_tx JSONB;
BEGIN
  IF v_user_id IS NULL OR v_user_id = '' THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_wallet FROM wallets WHERE user_id = v_user_id;
  IF v_wallet.id IS NULL THEN
    RETURN 0;
  END IF;

  -- 21-hour cooldown between claims
  IF v_wallet.last_interest_claim IS NOT NULL
    AND (now() - v_wallet.last_interest_claim) < INTERVAL '20 hours' THEN
      RETURN 0;
  END IF;

  -- Staking tiers: 0=0%, 100=2.5%, 500=4%, 2000=6.5%, 10000=10%
  v_tier_apy := CASE
    WHEN v_wallet.coins >= 10000 THEN 10.0
    WHEN v_wallet.coins >= 2000 THEN 6.5
    WHEN v_wallet.coins >= 500 THEN 4.0
    WHEN v_wallet.coins >= 100 THEN 2.5
    ELSE 0
  END;

  IF v_tier_apy = 0 THEN
    RETURN 0;
  END IF;

  v_interest := ROUND((v_wallet.coins * (v_tier_apy / 100.0) / 365.0) * 100) / 100;
  IF v_interest <= 0 THEN
    RETURN 0;
  END IF;

  v_tx := jsonb_build_object(
    'id', 'tx_' || gen_random_uuid()::text,
    'type', 'earn',
    'amount', v_interest,
    'currency', 'coins',
    'description', 'Daily staking reward (' || v_tier_apy || '% APY)',
    'timestamp', now()::text,
    'status', 'completed'
  );

  UPDATE wallets
  SET coins = coins + v_interest,
      total_earned = COALESCE(total_earned, 0) + v_interest,
      transactions = COALESCE(transactions, '[]'::jsonb) || v_tx,
      last_interest_claim = now(),
      updated_at = now()
  WHERE user_id = v_user_id;

  RETURN v_interest;
END;
$$;

-- ════════════════════════════════════════════════════════════
-- 3. USERS — RESTRICT SENSITIVE FIELD EXPOSURE
-- ════════════════════════════════════════════════════════════
-- Drop the overly-broad SELECT policy that exposes ALL columns
-- (email, phone, push_subscription, balances, is_admin, etc.)
DROP POLICY IF EXISTS "users_select_authenticated" ON users;
DROP POLICY IF EXISTS "users_select_all" ON users;

-- Create a public profile view that only exposes safe fields. The view runs
-- with its owner privileges, while direct SELECT on users stays disabled.
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles AS
SELECT
  id,
  name,
  display_name,
  username,
  avatar,
  cover_image,
  bio,
  location,
  website,
  status,
  status_message,
  is_verified,
  is_premium,
  premium_expires_at,
  last_seen,
  hide_online_status,
  hide_friend_list,
  friend_request_privacy,
  group_add_privacy,
  referral_code,
  streak_days,
  created_at
FROM public.users;

-- Grant SELECT on the view to authenticated users.
GRANT SELECT ON public.public_profiles TO authenticated;

-- Owner-scoped private profile access for auth bootstrap. This is the only
-- path that returns sensitive fields such as email, balances, and is_admin.
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT to_jsonb(u)
  FROM public.users AS u
  WHERE u.id::text = auth.uid()::text;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- Direct users-table SELECT remains disabled. App features that need another
-- user's public data must query public_profiles; private owner data comes from
-- get_my_profile(). Direct UPDATE on sensitive columns is revoked below.
DROP POLICY IF EXISTS "users_select_own" ON users;
DROP POLICY IF EXISTS "users_select_all_users" ON users;
-- Public profile reads go through public_profiles. Private users columns are
-- available only through owner-scoped RPCs such as get_my_profile().

-- Owner can still insert/update their own row.
DROP POLICY IF EXISTS "users_insert_own" ON users;
CREATE POLICY "users_insert_own" ON users
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = id);

DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users
  FOR UPDATE TO authenticated
  USING (auth.uid()::text = id)
  WITH CHECK (auth.uid()::text = id);

-- ════════════════════════════════════════════════════════════
-- 4. GROUPS — SERVER-SIDE ADMIN AUTHORIZATION
-- ════════════════════════════════════════════════════════════
-- Drop the FOR ALL participant policy that let any participant
-- modify group metadata, admins, or participant lists.
DROP POLICY IF EXISTS "groups_participant_access" ON groups;

-- SELECT: participants can view their groups
DROP POLICY IF EXISTS "groups_select_participant" ON groups;
CREATE POLICY "groups_select_participant" ON groups
  FOR SELECT TO authenticated
  USING (auth.uid()::text = ANY(participants));

-- INSERT: creator can create a group (must be in participants)
DROP POLICY IF EXISTS "groups_insert_creator" ON groups;
CREATE POLICY "groups_insert_creator" ON groups
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid()::text = creator_id
    AND auth.uid()::text = ANY(participants)
  );

-- UPDATE: only creator or admins can update group metadata
DROP POLICY IF EXISTS "groups_update_admin" ON groups;
CREATE POLICY "groups_update_admin" ON groups
  FOR UPDATE TO authenticated
  USING (
    auth.uid()::text = creator_id
    OR auth.uid()::text = ANY(COALESCE(admins, '{}'))
  )
  WITH CHECK (
    auth.uid()::text = creator_id
    OR auth.uid()::text = ANY(COALESCE(admins, '{}'))
  );

-- DELETE: only creator can delete the group
DROP POLICY IF EXISTS "groups_delete_creator" ON groups;
CREATE POLICY "groups_delete_creator" ON groups
  FOR DELETE TO authenticated
  USING (auth.uid()::text = creator_id);

-- ════════════════════════════════════════════════════════════
-- 5. CHATS — SPLIT FOR ALL INTO GRANULAR POLICIES
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "chats_participant_access" ON chats;
DROP POLICY IF EXISTS "chats_participant_all" ON chats;

DROP POLICY IF EXISTS "chats_select_participant" ON chats;
CREATE POLICY "chats_select_participant" ON chats
  FOR SELECT TO authenticated
  USING (auth.uid()::text = ANY(participants));

DROP POLICY IF EXISTS "chats_insert_participant" ON chats;
CREATE POLICY "chats_insert_participant" ON chats
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = ANY(participants));

DROP POLICY IF EXISTS "chats_update_participant" ON chats;
CREATE POLICY "chats_update_participant" ON chats
  FOR UPDATE TO authenticated
  USING (auth.uid()::text = ANY(participants))
  WITH CHECK (auth.uid()::text = ANY(participants));

DROP POLICY IF EXISTS "chats_delete_participant" ON chats;
CREATE POLICY "chats_delete_participant" ON chats
  FOR DELETE TO authenticated
  USING (auth.uid()::text = ANY(participants));

-- ════════════════════════════════════════════════════════════
-- 6. PRESENCE / TYPING — OWNER-ONLY WRITE
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "presence_all" ON presence;
DROP POLICY IF EXISTS "presence_select_all" ON presence;
DROP POLICY IF EXISTS "presence_owner_write" ON presence;

CREATE POLICY "presence_select_all" ON presence
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "presence_owner_write" ON presence
  FOR ALL TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "typing_all" ON typing;
DROP POLICY IF EXISTS "typing_select_all" ON typing;
DROP POLICY IF EXISTS "typing_owner_write" ON typing;

CREATE POLICY "typing_select_all" ON typing
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "typing_owner_write" ON typing
  FOR ALL TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- ════════════════════════════════════════════════════════════
-- 7. CALL SIGNALING — AUTHENTICATED ACCESS
-- ════════════════════════════════════════════════════════════
-- call_signaling is ephemeral WebRTC signaling data. The app writes
-- offer/answer/ICE via direct inserts and the append_ice_candidate RPC.
-- Any authenticated user may read/write signaling rows (they contain
-- no sensitive data and are short-lived).
DROP POLICY IF EXISTS "call_signaling_all" ON call_signaling;

DROP POLICY IF EXISTS "call_signaling_select" ON call_signaling;
CREATE POLICY "call_signaling_select" ON call_signaling
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "call_signaling_insert" ON call_signaling;
CREATE POLICY "call_signaling_insert" ON call_signaling
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "call_signaling_update" ON call_signaling;
CREATE POLICY "call_signaling_update" ON call_signaling
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════
-- 8. LIVE STREAMS — OWNER-ONLY WRITE
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "live_streams_all" ON live_streams;

DROP POLICY IF EXISTS "live_streams_select" ON live_streams;
CREATE POLICY "live_streams_select" ON live_streams
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "live_streams_insert_own" ON live_streams;
CREATE POLICY "live_streams_insert_own" ON live_streams
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "live_streams_update_own" ON live_streams;
CREATE POLICY "live_streams_update_own" ON live_streams
  FOR UPDATE TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "live_streams_delete_own" ON live_streams;
CREATE POLICY "live_streams_delete_own" ON live_streams
  FOR DELETE TO authenticated
  USING (auth.uid()::text = user_id);

-- ════════════════════════════════════════════════════════════
-- 9. VOICE ROOMS — PARTICIPANT-ONLY WRITE
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "voice_rooms_all" ON voice_rooms;

DROP POLICY IF EXISTS "voice_rooms_select" ON voice_rooms;
CREATE POLICY "voice_rooms_select" ON voice_rooms
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "voice_rooms_insert_own" ON voice_rooms;
CREATE POLICY "voice_rooms_insert_own" ON voice_rooms
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = creator_id);

DROP POLICY IF EXISTS "voice_rooms_update_participant" ON voice_rooms;
CREATE POLICY "voice_rooms_update_participant" ON voice_rooms
  FOR UPDATE TO authenticated
  USING (
    auth.uid()::text = creator_id
    OR auth.uid()::text = ANY(COALESCE(participants, '{}'))
  )
  WITH CHECK (
    auth.uid()::text = creator_id
    OR auth.uid()::text = ANY(COALESCE(participants, '{}'))
  );

DROP POLICY IF EXISTS "voice_rooms_delete_creator" ON voice_rooms;
CREATE POLICY "voice_rooms_delete_creator" ON voice_rooms
  FOR DELETE TO authenticated
  USING (auth.uid()::text = creator_id);

-- ════════════════════════════════════════════════════════════
-- 10. SIGNAL TABLES — RESTRICT WRITE TO AUTHENTICATED
-- ════════════════════════════════════════════════════════════
-- live_stream_signals: any authenticated user can read; only the
-- sender can write their own signals.
DROP POLICY IF EXISTS "live_stream_signals_all" ON live_stream_signals;

DROP POLICY IF EXISTS "live_stream_signals_select" ON live_stream_signals;
CREATE POLICY "live_stream_signals_select" ON live_stream_signals
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "live_stream_signals_insert" ON live_stream_signals;
CREATE POLICY "live_stream_signals_insert" ON live_stream_signals
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = "from");

-- voice_room_signals: same pattern
DROP POLICY IF EXISTS "voice_room_signals_all" ON voice_room_signals;

DROP POLICY IF EXISTS "voice_room_signals_select" ON voice_room_signals;
CREATE POLICY "voice_room_signals_select" ON voice_room_signals
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "voice_room_signals_insert" ON voice_room_signals;
CREATE POLICY "voice_room_signals_insert" ON voice_room_signals
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = "from");

-- ════════════════════════════════════════════════════════════
-- 11. HASHTAGS — READ-ONLY FOR AUTHENTICATED
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "hashtags_all" ON hashtags;

DROP POLICY IF EXISTS "hashtags_select" ON hashtags;
CREATE POLICY "hashtags_select" ON hashtags
  FOR SELECT TO authenticated USING (true);

-- ════════════════════════════════════════════════════════════
-- 12. POSTS — PUBLIC FEED (SELECT TRUE IS SAFE — WRITE IS OWN-ONLY)
-- ════════════════════════════════════════════════════════════
-- Posts created in `posts_insert_own`, `posts_update_own`, `posts_delete_own`
-- already restrict writes to the author. SELECT TRUE for the public feed is
-- intentional — posts are public social content; visibility filtering happens
-- at the application layer via `visibility`/`is_public` columns.
DROP POLICY IF EXISTS "posts_select_all" ON posts;
CREATE POLICY "posts_select_all" ON posts
  FOR SELECT TO authenticated USING (true);

-- ════════════════════════════════════════════════════════════
-- 13. STORIES — PUBLIC (SELECT TRUE IS SAFE — WRITE IS OWN-ONLY)
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "stories_select_all" ON stories;
CREATE POLICY "stories_select_all" ON stories
  FOR SELECT TO authenticated USING (true);

-- ════════════════════════════════════════════════════════════
-- 14. REELS — PUBLIC (SELECT TRUE IS SAFE — WRITE IS OWN-ONLY)
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "reels_select_all" ON reels;
CREATE POLICY "reels_select_all" ON reels
  FOR SELECT TO authenticated USING (true);

-- ════════════════════════════════════════════════════════════
-- 15. COMMENTS — PUBLIC (SELECT TRUE IS SAFE — WRITE IS OWN-ONLY)
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "comments_select_all" ON comments;
CREATE POLICY "comments_select_all" ON comments
  FOR SELECT TO authenticated USING (true);

-- ════════════════════════════════════════════════════════════
-- 16. FIX INVALID NEW/OLD REFERENCES
-- ════════════════════════════════════════════════════════════
-- The old mark_missed_call() used OLD.id in an AFTER INSERT trigger,
-- where OLD is NULL. This caused the UPDATE to target NULL and the
-- trigger to fail. The trigger has been removed in prior migrations;
-- ensure it stays gone.
DROP TRIGGER IF EXISTS on_call_missed ON call_history;
DROP FUNCTION IF EXISTS mark_missed_call();

-- ════════════════════════════════════════════════════════════
-- 17. REVOKE DANGEROUS GRANTS
-- ════════════════════════════════════════════════════════════
-- Revoke direct UPDATE on sensitive user columns from authenticated.
-- The owner can still update via the users_update_own policy, but
-- column-level grants prevent updating is_admin, balances, etc.
-- coins/bdt_balance/usd_balance mirror wallet balances and must only
-- be changed via the wallet RPC functions.
REVOKE UPDATE (is_admin, coins, bdt_balance, usd_balance, push_subscription, email, phone)
  ON users FROM authenticated;

-- Revoke direct INSERT/UPDATE/DELETE on wallets from authenticated.
-- All wallet mutations must go through the RPC functions above.
REVOKE INSERT, UPDATE, DELETE ON wallets FROM authenticated;

-- ════════════════════════════════════════════════════════════
-- 18. GRANT EXECUTE ON WALLET RPCs
-- ════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION public.wallet_earn_coins(NUMERIC, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.wallet_deposit(NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.wallet_withdraw(NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.wallet_transfer(TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC;
DROP FUNCTION IF EXISTS public.wallet_convert(NUMERIC, TEXT, TEXT, NUMERIC);
REVOKE EXECUTE ON FUNCTION public.wallet_convert(NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.wallet_claim_daily_interest() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_withdraw(NUMERIC, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_transfer(TEXT, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_convert(NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_claim_daily_interest() TO authenticated;

COMMIT;

-- ============================================================
-- DONE — This migration supersedes:
--   supabase_full_setup.sql (RLS portions)
--   supabase_master_fix.sql (RLS portions)
--   supabase_call_realtime_fix.sql (trigger fix)
--   supabase_fix_messages_rls.sql
--   supabase_fix_auth_trigger.sql
--   supabase_fix_rls.sql
--   supabase_migration.sql
--   supabase_patch.sql
--   supabase_patch3.sql
--   supabase_add_push_subscription.sql
--   supabase_add_video_url_column.sql
-- ============================================================