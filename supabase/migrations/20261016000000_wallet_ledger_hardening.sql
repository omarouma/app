-- ============================================================================
-- Wallet ledger hardening (P0)
-- ============================================================================
-- Verified against BOTH the repo source (omarouma/app @ main) and the LIVE
-- Supabase project `fcjgbbmfqdkucfpqjxae` (probed read-only through PostgREST).
--
-- Problems this migration fixes:
--
--   1. `wallets.transactions` (jsonb) is the only "ledger" the client reads, and
--      the money RPCs append to it on a single row. It grows unbounded (lock
--      contention) and is not a real, queryable ledger.
--   2. `wallet_transactions` (the real table) exists in the live DB but only
--      `activate_premium` writes to it, and it has no CREATE TABLE migration.
--      Two competing "sources of truth" (split-brain).
--   3. `wallet_transfer` has no idempotency key: a network retry or double-tap
--      can move the same coins twice.
--   4. `wallet_transfer` / `wallet_convert` move real-money balances (usd / bdt)
--      with no regulatory gate.
--   5. There is no settlement-verified top-up path at all.
--   6. Several objects the money RPCs depend on are missing in live
--      (`exchange_rates`, `daily_challenges`, `wallets.total_earned`), so this
--      migration creates/guards them to be self-sufficient.
--
-- Live signatures that MUST be preserved for the shipped client:
--   wallet_transfer(p_to_user_id, p_amount, p_currency, p_description)
--   wallet_spend_coins(p_amount, p_description)
--   wallet_convert(p_amount, p_from, p_to)
--   claim_challenge_coins(p_challenge_id, p_amount)
-- All user-id columns are uuid in live, so auth.uid() is used without a cast.
--
-- After this migration:
--   * `wallet_transactions` is the single, append-only, auditable ledger.
--   * Every money RPC writes to it in the same transaction as the balance change.
--   * `wallet_transfer` is idempotent, double-spend-proof and deadlock-free.
--   * Real-money (usd / bdt) movement is OFF behind a feature flag.
--   * Top-ups require a verified provider settlement (service_role only).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Append-only ledger table
-- ---------------------------------------------------------------------------
create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  related_user_id uuid references auth.users(id) on delete set null,
  type text not null,
  amount numeric not null check (amount > 0),
  currency text not null default 'coins',
  description text,
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text,
  balance_after numeric,
  created_at timestamptz not null default timezone('utc', now())
);

-- The live table predates this migration; make sure every column exists.
alter table public.wallet_transactions add column if not exists related_user_id uuid;
alter table public.wallet_transactions add column if not exists idempotency_key text;
alter table public.wallet_transactions add column if not exists balance_after numeric;
alter table public.wallet_transactions add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Normalise any legacy CHECK constraint on `type` to a known superset, so the
-- new transfer / convert / challenge entries are accepted regardless of the
-- shape the live table happened to have.
do $$
declare c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.wallet_transactions'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ~* '\ytype\y'
  loop
    execute format('alter table public.wallet_transactions drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.wallet_transactions drop constraint if exists wallet_transactions_type_check;
alter table public.wallet_transactions
  add constraint wallet_transactions_type_check
  -- Preserve all transaction kinds already permitted by the LIVE ledger.
  -- Narrowing this constraint would reject existing transfer/reward entries and
  -- break deployed daily interest / withdraw RPCs on a restored database.
  check (type in (
    'earn','spend','transfer','transfer_in','transfer_out','receive',
    'reward','refund','topup','withdraw','convert','tip','split',
    'challenge','adjust','interest','checkin'
  ));

-- Idempotency: one entry per (user, key). NULL keys are allowed to repeat.
create unique index if not exists wallet_transactions_idem_idx
  on public.wallet_transactions (user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists wallet_transactions_user_created_idx
  on public.wallet_transactions (user_id, created_at desc);
create index if not exists wallet_transactions_related_user_idx
  on public.wallet_transactions (related_user_id);

-- Append-only RLS: a user may read their own entries; nobody may write from the
-- client. Only SECURITY DEFINER RPCs / service_role can append.
alter table public.wallet_transactions enable row level security;
drop policy if exists "wallet_tx_select_own" on public.wallet_transactions;
create policy "wallet_tx_select_own" on public.wallet_transactions
  for select to authenticated using (auth.uid() = user_id);

revoke all on public.wallet_transactions from anon, authenticated;
grant select on public.wallet_transactions to authenticated;
revoke truncate, references, trigger on public.wallet_transactions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Feature flags (real-money P2P is OFF until a regulator-approved rail)
-- ---------------------------------------------------------------------------
create table if not exists public.wallet_feature_flags (
  flag text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.wallet_feature_flags (flag, enabled)
values ('real_money_p2p', false)
on conflict (flag) do nothing;

-- Server-only: readable by SECURITY DEFINER functions, not by clients.
alter table public.wallet_feature_flags enable row level security;
revoke all on public.wallet_feature_flags from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Tunable limits (per-transaction cap + daily velocity cap)
-- ---------------------------------------------------------------------------
create table if not exists public.wallet_limits (
  key text primary key,
  value numeric not null,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.wallet_limits (key, value) values
  ('transfer_max_per_tx_coins', 1000000),
  ('transfer_max_per_day_coins', 2000000)
on conflict (key) do nothing;

alter table public.wallet_limits enable row level security;
revoke all on public.wallet_limits from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Objects the money RPCs depend on that are missing in live
-- ---------------------------------------------------------------------------
-- wallets.total_earned (used by earn / challenge / top-up paths)
alter table public.wallets add column if not exists total_earned numeric default 0;
alter table public.wallets add column if not exists last_interest_claim timestamptz;

-- exchange_rates (server-side conversion table; missing in live)
create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  from_currency text not null,
  to_currency text not null,
  rate numeric not null,
  updated_at timestamptz default timezone('utc', now()),
  unique (from_currency, to_currency)
);

insert into public.exchange_rates (from_currency, to_currency, rate) values
  ('coins', 'usd', 0.0071),
  ('usd', 'coins', 140.85),
  ('coins', 'bdt', 0.76),
  ('bdt', 'coins', 1.32)
on conflict (from_currency, to_currency) do update set rate = excluded.rate;

alter table public.exchange_rates enable row level security;
revoke all on public.exchange_rates from anon, authenticated;
grant select on public.exchange_rates to authenticated;

-- daily_challenges (missing in live; needed by claim_challenge_coins)
create table if not exists public.daily_challenges (
  id text primary key,
  user_id uuid not null,
  completed boolean not null default false,
  claimed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

-- ---------------------------------------------------------------------------
-- 5. wallet_transfer — idempotent, ledger-backed, real-money gated
-- ---------------------------------------------------------------------------
-- The live 4-argument signature (p_to_user_id, p_amount, p_currency,
-- p_description) is replaced by a 5-argument one that adds p_idempotency_key.
-- p_description is KEPT (the shipped client sends it). Drop the old signature
-- explicitly to avoid an ambiguous overload.
drop function if exists public.wallet_transfer(text, numeric, text, text);

create or replace function public.wallet_transfer(
  p_to_user_id text,
  p_amount numeric,
  p_currency text default 'coins',
  p_description text default '',
  p_idempotency_key text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_from_uid uuid := auth.uid();
  v_to_uid uuid;
  v_currency text := lower(coalesce(p_currency, 'coins'));
  v_sender_balance numeric;
  v_receiver_balance numeric;
  v_sender_after numeric;
  v_receiver_after numeric;
  v_existing int;
  v_real_money_enabled boolean;
  v_max_per_tx numeric;
  v_max_per_day numeric;
  v_daily_total numeric;
  v_row record;
begin
  if v_from_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_to_user_id is null or p_to_user_id = '' then
    raise exception 'Recipient required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;
  if v_currency not in ('coins', 'usd', 'bdt') then
    raise exception 'Unsupported currency: %', v_currency;
  end if;

  v_to_uid := p_to_user_id::uuid;

  if v_from_uid = v_to_uid then
    raise exception 'Cannot transfer to yourself';
  end if;

  -- Recipient must exist and must not be in a block relationship with sender.
  if to_regclass('public.users') is not null then
    if not exists (select 1 from public.users where id = v_to_uid) then
      raise exception 'recipient_not_found' using errcode = '22023';
    end if;
  end if;
  if to_regclass('public.blocked_users') is not null then
    if exists (select 1 from public.blocked_users
                where (blocker_id = v_from_uid and blocked_id = v_to_uid)
                   or (blocker_id = v_to_uid and blocked_id = v_from_uid)) then
      raise exception 'recipient_unavailable' using errcode = '42501';
    end if;
  end if;

  -- Real-money P2P stays disabled until the feature flag is switched on.
  if v_currency in ('usd', 'bdt') then
    select enabled into v_real_money_enabled
      from public.wallet_feature_flags where flag = 'real_money_p2p';
    if coalesce(v_real_money_enabled, false) is not true then
      raise exception 'real_money_p2p_disabled' using errcode = '42501';
    end if;
  end if;

  -- Ensure both wallets exist.
  insert into public.wallets (id, user_id, coins, usd_balance, bdt_balance, transactions)
  values (v_from_uid, v_from_uid, 0, 0, 0, '[]'::jsonb)
  on conflict (user_id) do nothing;
  insert into public.wallets (id, user_id, coins, usd_balance, bdt_balance, transactions)
  values (v_to_uid, v_to_uid, 0, 0, 0, '[]'::jsonb)
  on conflict (user_id) do nothing;

  -- Lock both wallet rows in a deterministic order (by user_id) so two users
  -- transferring to each other concurrently cannot deadlock.
  for v_row in
    select user_id, coins, usd_balance, bdt_balance
      from public.wallets
     where user_id in (v_from_uid, v_to_uid)
     order by user_id
       for update
  loop
    if v_row.user_id = v_from_uid then
      v_sender_balance := case when v_currency = 'coins' then v_row.coins
                               when v_currency = 'usd' then v_row.usd_balance
                               else v_row.bdt_balance end;
    else
      v_receiver_balance := case when v_currency = 'coins' then v_row.coins
                                 when v_currency = 'usd' then v_row.usd_balance
                                 else v_row.bdt_balance end;
    end if;
  end loop;

  -- Idempotency: checked AFTER the row lock so concurrent retries serialise and
  -- the second one observes the first one's committed ledger row.
  if p_idempotency_key is not null and p_idempotency_key <> '' then
    select count(*) into v_existing
      from public.wallet_transactions
     where user_id = v_from_uid
       and idempotency_key = p_idempotency_key;
    if v_existing > 0 then
      return true;
    end if;
  end if;

  if v_sender_balance is null or v_sender_balance < p_amount then
    raise exception 'Insufficient balance';
  end if;

  -- Limits / velocity (coins only; real money is gated off anyway).
  if v_currency = 'coins' then
    select value into v_max_per_tx from public.wallet_limits where key = 'transfer_max_per_tx_coins';
    if v_max_per_tx is not null and p_amount > v_max_per_tx then
      raise exception 'transfer_limit_exceeded' using errcode = '22023';
    end if;
    select value into v_max_per_day from public.wallet_limits where key = 'transfer_max_per_day_coins';
    if v_max_per_day is not null then
      select coalesce(sum(amount), 0) into v_daily_total
        from public.wallet_transactions
       where user_id = v_from_uid
         and type = 'transfer_out'
         and currency = 'coins'
         and created_at >= date_trunc('day', timezone('utc', now()));
      if v_daily_total + p_amount > v_max_per_day then
        raise exception 'daily_transfer_limit_exceeded' using errcode = '22023';
      end if;
    end if;
  end if;

  v_sender_after := v_sender_balance - p_amount;
  v_receiver_after := coalesce(v_receiver_balance, 0) + p_amount;

  if v_currency = 'coins' then
    update public.wallets set coins = coins - p_amount, updated_at = now() where user_id = v_from_uid;
    update public.wallets set coins = coins + p_amount, updated_at = now() where user_id = v_to_uid;
  elsif v_currency = 'usd' then
    update public.wallets set usd_balance = usd_balance - p_amount, updated_at = now() where user_id = v_from_uid;
    update public.wallets set usd_balance = usd_balance + p_amount, updated_at = now() where user_id = v_to_uid;
  else
    update public.wallets set bdt_balance = bdt_balance - p_amount, updated_at = now() where user_id = v_from_uid;
    update public.wallets set bdt_balance = bdt_balance + p_amount, updated_at = now() where user_id = v_to_uid;
  end if;

  -- Ledger: one debit row for the sender, one credit row for the receiver.
  insert into public.wallet_transactions
    (user_id, related_user_id, type, amount, currency, description, metadata, idempotency_key, balance_after)
  values
    (v_from_uid, v_to_uid, 'transfer_out', p_amount, v_currency,
     'Sent ' || p_amount || ' ' || v_currency || case when coalesce(p_description, '') = '' then '' else ': ' || p_description end,
     jsonb_build_object('direction', 'out', 'counterparty', v_to_uid, 'note', p_description),
     nullif(p_idempotency_key, ''), v_sender_after),
    (v_to_uid, v_from_uid, 'transfer_in', p_amount, v_currency,
     'Received ' || p_amount || ' ' || v_currency || case when coalesce(p_description, '') = '' then '' else ': ' || p_description end,
     jsonb_build_object('direction', 'in', 'counterparty', v_from_uid, 'note', p_description),
     null, v_receiver_after);

  return true;
end;
$$;

revoke execute on function public.wallet_transfer(text, numeric, text, text, text) from public;
grant execute on function public.wallet_transfer(text, numeric, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. wallet_spend_coins — now ledger-backed
-- ---------------------------------------------------------------------------
create or replace function public.wallet_spend_coins(
  p_amount numeric,
  p_description text default 'Spent coins'
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_balance numeric;
  v_after numeric;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;

  insert into public.wallets (id, user_id, coins, usd_balance, bdt_balance, transactions)
  values (v_uid, v_uid, 0, 0, 0, '[]'::jsonb)
  on conflict (user_id) do nothing;

  select coins into v_balance from public.wallets where user_id = v_uid for update;
  if v_balance is null or v_balance < p_amount then
    raise exception 'Insufficient balance';
  end if;
  v_after := v_balance - p_amount;

  update public.wallets set coins = coins - p_amount, updated_at = now() where user_id = v_uid;

  insert into public.wallet_transactions
    (user_id, type, amount, currency, description, metadata, balance_after)
  values
    (v_uid, 'spend', p_amount, 'coins', coalesce(p_description, 'Spent coins'),
     jsonb_build_object('kind', 'spend'), v_after);

  return true;
end;
$$;

revoke execute on function public.wallet_spend_coins(numeric, text) from public;
grant execute on function public.wallet_spend_coins(numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. wallet_convert — ledger-backed and real-money gated
-- ---------------------------------------------------------------------------
-- Live signature is (p_amount, p_from, p_to); keep it.
create or replace function public.wallet_convert(
  p_amount numeric,
  p_from text default 'coins',
  p_to text default 'usd'
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_from text := lower(coalesce(p_from, 'coins'));
  v_to text := lower(coalesce(p_to, 'usd'));
  v_from_balance numeric;
  v_to_balance numeric;
  v_converted numeric;
  v_server_rate numeric;
  v_after_from numeric;
  v_after_to numeric;
  v_real_money_enabled boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;
  if v_from not in ('coins', 'usd', 'bdt') or v_to not in ('coins', 'usd', 'bdt') then
    raise exception 'Unsupported currency';
  end if;
  if v_from = v_to then
    raise exception 'Cannot convert to same currency';
  end if;

  -- Converting into or out of a real-money balance is gated like P2P.
  if v_from in ('usd', 'bdt') or v_to in ('usd', 'bdt') then
    select enabled into v_real_money_enabled
      from public.wallet_feature_flags where flag = 'real_money_p2p';
    if coalesce(v_real_money_enabled, false) is not true then
      raise exception 'real_money_p2p_disabled' using errcode = '42501';
    end if;
  end if;

  select rate into v_server_rate
    from public.exchange_rates
   where from_currency = v_from and to_currency = v_to;

  if v_server_rate is null or v_server_rate <= 0 then
    raise exception 'Exchange rate not available for this currency pair';
  end if;

  insert into public.wallets (id, user_id, coins, usd_balance, bdt_balance, transactions)
  values (v_uid, v_uid, 0, 0, 0, '[]'::jsonb)
  on conflict (user_id) do nothing;

  select case when v_from = 'coins' then coins
              when v_from = 'usd' then usd_balance
              else bdt_balance end
    into v_from_balance
    from public.wallets where user_id = v_uid for update;

  if v_from_balance is null or v_from_balance < p_amount then
    raise exception 'Insufficient balance';
  end if;

  select case when v_to = 'coins' then coins
              when v_to = 'usd' then usd_balance
              else bdt_balance end
    into v_to_balance
    from public.wallets where user_id = v_uid;

  v_converted := round(p_amount * v_server_rate * 100) / 100;
  v_after_from := v_from_balance - p_amount;
  v_after_to := coalesce(v_to_balance, 0) + v_converted;

  if v_from = 'coins' then
    update public.wallets set coins = coins - p_amount, updated_at = now() where user_id = v_uid;
  elsif v_from = 'usd' then
    update public.wallets set usd_balance = usd_balance - p_amount, updated_at = now() where user_id = v_uid;
  else
    update public.wallets set bdt_balance = bdt_balance - p_amount, updated_at = now() where user_id = v_uid;
  end if;

  if v_to = 'coins' then
    update public.wallets set coins = coins + v_converted, updated_at = now() where user_id = v_uid;
  elsif v_to = 'usd' then
    update public.wallets set usd_balance = usd_balance + v_converted, updated_at = now() where user_id = v_uid;
  else
    update public.wallets set bdt_balance = bdt_balance + v_converted, updated_at = now() where user_id = v_uid;
  end if;

  insert into public.wallet_transactions
    (user_id, type, amount, currency, description, metadata, balance_after)
  values
    (v_uid, 'convert', p_amount, v_from,
     'Converted ' || p_amount || ' ' || v_from || ' to ' || v_converted || ' ' || v_to,
     jsonb_build_object('kind', 'convert', 'from', v_from, 'to', v_to, 'rate', v_server_rate),
     v_after_from),
    (v_uid, 'convert', v_converted, v_to,
     'Converted from ' || p_amount || ' ' || v_from,
     jsonb_build_object('kind', 'convert', 'from', v_from, 'to', v_to, 'rate', v_server_rate),
     v_after_to);

  return true;
end;
$$;

revoke execute on function public.wallet_convert(numeric, text, text) from public;
grant execute on function public.wallet_convert(numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. claim_challenge_coins — ledger-backed
-- ---------------------------------------------------------------------------
create or replace function public.claim_challenge_coins(
  p_challenge_id text,
  p_amount numeric
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_challenge_exists boolean;
  v_balance numeric;
  v_after numeric;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;

  select exists(
    select 1 from public.daily_challenges
     where id = p_challenge_id and user_id = v_uid and completed = true and claimed = false
  ) into v_challenge_exists;

  if not v_challenge_exists then
    raise exception 'Challenge not found or already claimed';
  end if;

  insert into public.wallets (id, user_id, coins, usd_balance, bdt_balance, transactions)
  values (v_uid, v_uid, 0, 0, 0, '[]'::jsonb)
  on conflict (user_id) do nothing;

  select coins into v_balance from public.wallets where user_id = v_uid for update;
  v_after := coalesce(v_balance, 0) + p_amount;

  update public.wallets
     set coins = coins + p_amount,
         total_earned = coalesce(total_earned, 0) + p_amount,
         updated_at = now()
   where user_id = v_uid;

  insert into public.wallet_transactions
    (user_id, type, amount, currency, description, metadata, idempotency_key, balance_after)
  values
    (v_uid, 'challenge', p_amount, 'coins', 'Challenge reward: ' || p_challenge_id,
     jsonb_build_object('kind', 'challenge', 'challenge_id', p_challenge_id),
     'challenge:' || p_challenge_id, v_after);

  update public.daily_challenges set claimed = true where id = p_challenge_id;

  return true;
end;
$$;

revoke execute on function public.claim_challenge_coins(text, numeric) from public;
grant execute on function public.claim_challenge_coins(text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. admin_award_coins — service_role only, ledger-backed
-- ---------------------------------------------------------------------------
create or replace function public.admin_award_coins(
  p_user_id text,
  p_amount numeric,
  p_reason text,
  p_source text default 'admin'
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_target uuid := p_user_id::uuid;
  v_balance numeric;
  v_after numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;
  if p_user_id is null or p_user_id = '' then
    raise exception 'User ID required';
  end if;

  insert into public.wallets (id, user_id, coins, usd_balance, bdt_balance, transactions)
  values (v_target, v_target, 0, 0, 0, '[]'::jsonb)
  on conflict (user_id) do nothing;

  select coins into v_balance from public.wallets where user_id = v_target for update;
  v_after := coalesce(v_balance, 0) + p_amount;

  update public.wallets
     set coins = coins + p_amount,
         total_earned = coalesce(total_earned, 0) + p_amount,
         updated_at = now()
   where user_id = v_target;

  insert into public.wallet_transactions
    (user_id, type, amount, currency, description, metadata, balance_after)
  values
    (v_target, 'earn', p_amount, 'coins', coalesce(p_reason, 'Admin award'),
     jsonb_build_object('kind', 'admin_award', 'source', p_source), v_after);

  return true;
end;
$$;

revoke execute on function public.admin_award_coins(text, numeric, text, text) from public, anon, authenticated;
grant execute on function public.admin_award_coins(text, numeric, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 10. Settlement-verified top-up (no client-side crediting, ever)
-- ---------------------------------------------------------------------------
create table if not exists public.wallet_topup_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null check (amount > 0),
  currency text not null default 'coins',
  provider text,
  provider_txn_id text,
  status text not null default 'pending' check (status in ('pending','settled','failed','refunded')),
  idempotency_key text not null,
  created_at timestamptz not null default timezone('utc', now()),
  settled_at timestamptz,
  unique (user_id, idempotency_key),
  unique (provider, provider_txn_id)
);

alter table public.wallet_topup_intents enable row level security;
drop policy if exists "wallet_topup_intents_select_own" on public.wallet_topup_intents;
create policy "wallet_topup_intents_select_own" on public.wallet_topup_intents
  for select to authenticated using (auth.uid() = user_id);

revoke all on public.wallet_topup_intents from anon, authenticated;
grant select on public.wallet_topup_intents to authenticated;

-- Step 1 (client): create a pending intent. No balance changes here.
create or replace function public.create_topup_intent(
  p_amount numeric,
  p_currency text default 'coins',
  p_provider text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_key text := coalesce(nullif(p_idempotency_key, ''), gen_random_uuid()::text);
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;

  insert into public.wallet_topup_intents (user_id, amount, currency, provider, status, idempotency_key)
  values (v_uid, p_amount, lower(coalesce(p_currency, 'coins')), p_provider, 'pending', v_key)
  on conflict (user_id, idempotency_key)
  do update set idempotency_key = excluded.idempotency_key
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_topup_intent(numeric, text, text, text) from public;
grant execute on function public.create_topup_intent(numeric, text, text, text) to authenticated;

-- Step 2 (provider webhook, service_role only): credit AFTER verified settlement.
-- The caller MUST have verified the provider signature and transaction id first.
create or replace function public.credit_wallet_from_settlement(
  p_intent_id uuid,
  p_provider_txn_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_intent public.wallet_topup_intents;
  v_balance numeric;
  v_after numeric;
begin
  -- Defence in depth: even if the grant were misconfigured, refuse client roles.
  if coalesce(current_setting('request.jwt.claim.role', true), '') in ('anon', 'authenticated') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  select * into v_intent
    from public.wallet_topup_intents
   where id = p_intent_id
   for update;

  if not found then
    raise exception 'Top-up intent not found';
  end if;
  if v_intent.status = 'settled' then
    return true; -- idempotent replay
  end if;
  if v_intent.status <> 'pending' then
    raise exception 'Intent is not pending';
  end if;

  insert into public.wallets (id, user_id, coins, usd_balance, bdt_balance, transactions)
  values (v_intent.user_id, v_intent.user_id, 0, 0, 0, '[]'::jsonb)
  on conflict (user_id) do nothing;

  select coins into v_balance from public.wallets where user_id = v_intent.user_id for update;
  v_after := coalesce(v_balance, 0) + v_intent.amount;

  update public.wallets
     set coins = coins + v_intent.amount,
         total_earned = coalesce(total_earned, 0) + v_intent.amount,
         updated_at = now()
   where user_id = v_intent.user_id;

  insert into public.wallet_transactions
    (user_id, type, amount, currency, description, metadata, idempotency_key, balance_after)
  values
    (v_intent.user_id, 'topup', v_intent.amount, v_intent.currency, 'Top-up settled',
     jsonb_build_object('provider', v_intent.provider, 'provider_txn_id', p_provider_txn_id, 'intent_id', p_intent_id),
     'topup:' || p_intent_id::text, v_after);

  update public.wallet_topup_intents
     set status = 'settled', provider_txn_id = p_provider_txn_id, settled_at = timezone('utc', now())
   where id = p_intent_id;

  return true;
end;
$$;

revoke execute on function public.credit_wallet_from_settlement(uuid, text) from public, anon, authenticated;
grant execute on function public.credit_wallet_from_settlement(uuid, text) to service_role;
