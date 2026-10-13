-- Minimal Supabase-like harness to execute the wallet migration for real.
-- Emulates: roles, auth schema (uid/role), and the LIVE-DB-only objects that the
-- wallet migration depends on but that have no CREATE TABLE migration.
--
-- IMPORTANT: this models the LIVE production schema as probed read-only through
-- PostgREST (see LIVE-SCHEMA-FINDINGS.md), NOT the (stale) repo migrations:
--   * wallets.id / wallets.user_id are UUID
--   * wallet_transactions.user_id / related_user_id are UUID
--   * wallets.total_earned / last_interest_claim DO NOT EXIST yet
--   * wallet_transactions.idempotency_key / balance_after DO NOT EXIST yet
--   * exchange_rates and daily_challenges DO NOT EXIST yet
-- The migration under test must create/guard all of the missing pieces itself.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;

-- public.users (subset used by wallet RPCs) — live id is uuid
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  is_admin boolean not null default false,
  is_premium boolean not null default false,
  premium_expires_at timestamptz,
  updated_at timestamptz default now()
);

-- public.wallets (LIVE schema): id/user_id are UUID.
create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null,
  coins numeric not null default 0,
  usd_balance numeric not null default 0,
  bdt_balance numeric not null default 0,
  transactions jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- public.wallet_transactions (LIVE table): pre-existing, uuid ids, and WITHOUT
-- idempotency_key / balance_after. A restrictive legacy CHECK on `type` is added
-- on purpose so the migration's constraint-normalisation step is exercised.
create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  related_user_id uuid,
  type text not null,
  amount numeric not null,
  currency text not null default 'coins',
  description text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  constraint wallet_transactions_type_check check (type in ('earn','spend','topup'))
);

-- public.blocked_users (live columns are uuid)
create table if not exists public.blocked_users (
  blocker_id uuid not null,
  blocked_id uuid not null,
  created_at timestamptz default now(),
  primary key (blocker_id, blocked_id)
);

-- NOTE: exchange_rates and daily_challenges are intentionally NOT created here —
-- they are MISSING in live and the migration must create them.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  plan_id text,
  plan_name text,
  status text,
  amount numeric,
  currency text,
  duration text,
  started_at timestamptz,
  expires_at timestamptz,
  auto_renew boolean default true,
  created_at timestamptz default now()
);

-- ── Emulate Supabase default privileges ──────────────────────────────────────
-- Supabase grants ALL on public tables to anon/authenticated by default; RLS and
-- explicit REVOKEs in migrations then restrict them. This ordering matters: the
-- migration's REVOKEs must land *after* these grants to be meaningful.
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;

-- ── Emulate production wallet security (from 20260820000100) ─────────────────
alter table public.wallets enable row level security;
drop policy if exists "wallets_select_own" on public.wallets;
create policy "wallets_select_own" on public.wallets
  for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on public.wallets from anon, authenticated;

-- ── Test helper: assert a statement is denied for the current role ───────────
create schema if not exists test_helpers;
grant usage on schema test_helpers to authenticated;
create or replace function test_helpers.expect_denied(p_sql text, p_label text)
returns void language plpgsql security invoker as $$
begin
  begin
    execute p_sql;
    raise exception 'FAIL %: statement was allowed', p_label;
  exception when insufficient_privilege then
    raise notice 'PASS %: denied (insufficient_privilege)', p_label;
  end;
end $$;
grant execute on function test_helpers.expect_denied(text, text) to authenticated;
