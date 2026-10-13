-- Functional + security test for 20261016000000_wallet_ledger_hardening.sql
-- Runs against the harness. Any failed assertion raises and aborts.

\set ON_ERROR_STOP on

-- Seed two users + wallets
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@gaga.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@gaga.test')
on conflict (id) do nothing;

-- public.users rows (the hardened wallet_transfer validates the recipient exists)
insert into public.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333')
on conflict (id) do nothing;

-- Third user (C) with a clean daily history, used for the limit tests.
insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'c@gaga.test')
on conflict (id) do nothing;
insert into public.wallets (id, user_id, coins, usd_balance, bdt_balance, transactions)
values
  ('33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 500, 0, 0, '[]'::jsonb)
on conflict (user_id) do nothing;

insert into public.wallets (id, user_id, coins, usd_balance, bdt_balance, transactions)
values
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 1000, 0, 0, '[]'::jsonb),
  ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 0, 0, 0, '[]'::jsonb)
on conflict (user_id) do nothing;

-- Helper: act as user A
create or replace function pg_temp.act_as(p_uid text, p_role text default 'authenticated')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid, false);
  perform set_config('request.jwt.claim.role', p_role, false);
end $$;

\echo '=== TEST 1: coins transfer moves balance + writes 2 ledger rows ==='
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select public.wallet_transfer(
  '22222222-2222-2222-2222-222222222222', 250, 'coins', 'lunch', 'idem-1') as transfer_ok;

do $$
declare a numeric; b numeric; n int;
begin
  select coins into a from public.wallets where user_id = '11111111-1111-1111-1111-111111111111';
  select coins into b from public.wallets where user_id = '22222222-2222-2222-2222-222222222222';
  if a <> 750 then raise exception 'FAIL T1: sender coins = % (expected 750)', a; end if;
  if b <> 250 then raise exception 'FAIL T1: receiver coins = % (expected 250)', b; end if;
  select count(*) into n from public.wallet_transactions where idempotency_key = 'idem-1';
  if n <> 1 then raise exception 'FAIL T1: expected 1 sender ledger row for idem-1, got %', n; end if;
  select count(*) into n from public.wallet_transactions where type = 'transfer_in';
  if n <> 1 then raise exception 'FAIL T1: expected 1 transfer_in row, got %', n; end if;
  raise notice 'PASS T1: balances 750/250, ledger rows written';
end $$;

\echo '=== TEST 2: idempotent replay does NOT move coins twice ==='
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select public.wallet_transfer(
  '22222222-2222-2222-2222-222222222222', 250, 'coins', 'lunch', 'idem-1') as replay_ok;

do $$
declare a numeric; b numeric;
begin
  select coins into a from public.wallets where user_id = '11111111-1111-1111-1111-111111111111';
  select coins into b from public.wallets where user_id = '22222222-2222-2222-2222-222222222222';
  if a <> 750 or b <> 250 then
    raise exception 'FAIL T2: replay changed balances -> sender %, receiver %', a, b;
  end if;
  raise notice 'PASS T2: replay was a no-op (750/250)';
end $$;

\echo '=== TEST 3: real-money (usd) transfer is blocked by feature flag ==='
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
do $$
begin
  begin
    perform public.wallet_transfer('22222222-2222-2222-2222-222222222222', 5, 'usd', 'x', 'idem-usd');
    raise exception 'FAIL T3: usd transfer was allowed while flag is off';
  exception when insufficient_privilege then
    raise notice 'PASS T3: usd transfer blocked (real_money_p2p_disabled)';
  end;
end $$;

\echo '=== TEST 4: insufficient balance is rejected ==='
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
do $$
begin
  begin
    perform public.wallet_transfer('22222222-2222-2222-2222-222222222222', 999999, 'coins', 'x', 'idem-big');
    raise exception 'FAIL T4: oversized transfer was allowed';
  exception when others then
    if position('Insufficient balance' in sqlerrm) > 0 then
      raise notice 'PASS T4: insufficient balance rejected';
    else
      raise;
    end if;
  end;
end $$;

\echo '=== TEST 5: self-transfer rejected ==='
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
do $$
begin
  begin
    perform public.wallet_transfer('11111111-1111-1111-1111-111111111111', 1, 'coins', 'x', 'idem-self');
    raise exception 'FAIL T5: self transfer allowed';
  exception when others then
    if position('Cannot transfer to yourself' in sqlerrm) > 0 then
      raise notice 'PASS T5: self transfer rejected';
    else raise; end if;
  end;
end $$;

\echo '=== TEST 6: wallet_spend_coins writes a ledger row ==='
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select public.wallet_spend_coins(100, 'Sticker pack') as spend_ok;
do $$
declare a numeric; n int;
begin
  select coins into a from public.wallets where user_id = '11111111-1111-1111-1111-111111111111';
  select count(*) into n from public.wallet_transactions where type = 'spend' and description = 'Sticker pack';
  if a <> 650 then raise exception 'FAIL T6: coins = % (expected 650)', a; end if;
  if n <> 1 then raise exception 'FAIL T6: spend ledger rows = % (expected 1)', n; end if;
  raise notice 'PASS T6: spend debited 100 and logged to ledger (balance 650)';
end $$;

\echo '=== TEST 7: wallet_convert is gated (coins->usd) ==='
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
do $$
begin
  begin
    perform public.wallet_convert(100, 'coins', 'usd');
    raise exception 'FAIL T7: convert to usd allowed while flag off';
  exception when insufficient_privilege then
    raise notice 'PASS T7: convert gated (real_money_p2p_disabled)';
  end;
end $$;

\echo '=== TEST 8: claim_challenge_coins writes ledger with deterministic idem key ==='
insert into public.daily_challenges (id, user_id, completed, claimed)
values ('ch-1', '11111111-1111-1111-1111-111111111111', true, false)
on conflict (id) do nothing;

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select public.claim_challenge_coins('ch-1', 50) as claim_ok;
do $$
declare a numeric; n int; c boolean;
begin
  select coins into a from public.wallets where user_id = '11111111-1111-1111-1111-111111111111';
  select count(*) into n from public.wallet_transactions where idempotency_key = 'challenge:ch-1';
  select claimed into c from public.daily_challenges where id = 'ch-1';
  if a <> 700 then raise exception 'FAIL T8: coins = % (expected 700)', a; end if;
  if n <> 1 then raise exception 'FAIL T8: challenge ledger rows = % (expected 1)', n; end if;
  if c is not true then raise exception 'FAIL T8: challenge not marked claimed'; end if;
  raise notice 'PASS T8: challenge credited 50, ledger + claimed flag set (balance 700)';
end $$;

\echo '=== TEST 9: top-up intent does NOT change balance until settlement ==='
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
create temp table _intent as
  select public.create_topup_intent(500, 'coins', 'bkash', 'topup-idem-1') as id;
do $$
declare a numeric; st text;
begin
  select coins into a from public.wallets where user_id = '22222222-2222-2222-2222-222222222222';
  select status into st from public.wallet_topup_intents where id = (select id from _intent);
  if a <> 250 then raise exception 'FAIL T9: balance changed before settlement -> %', a; end if;
  if st <> 'pending' then raise exception 'FAIL T9: intent status = % (expected pending)', st; end if;
  raise notice 'PASS T9: intent created pending, balance untouched (250)';
end $$;

\echo '=== TEST 10: settlement credits exactly once (service_role) ==='
select pg_temp.act_as('', 'service_role');
select public.credit_wallet_from_settlement((select id from _intent), 'PROVIDER-TXN-1') as settle_ok;
select public.credit_wallet_from_settlement((select id from _intent), 'PROVIDER-TXN-1') as settle_replay_ok;
do $$
declare a numeric; n int; st text;
begin
  select coins into a from public.wallets where user_id = '22222222-2222-2222-2222-222222222222';
  select count(*) into n from public.wallet_transactions where idempotency_key = 'topup:' || (select id::text from _intent);
  select status into st from public.wallet_topup_intents where id = (select id from _intent);
  if a <> 750 then raise exception 'FAIL T10: coins = % (expected 750)', a; end if;
  if n <> 1 then raise exception 'FAIL T10: topup ledger rows = % (expected 1, replay must not duplicate)', n; end if;
  if st <> 'settled' then raise exception 'FAIL T10: status = % (expected settled)', st; end if;
  raise notice 'PASS T10: credited 500 once, replay idempotent (balance 750)';
end $$;

\echo '=== TEST 11: authenticated client CANNOT execute credit_wallet_from_settlement ==='
select id from _intent \gset
select pg_temp.act_as('22222222-2222-2222-2222-222222222222', 'authenticated');
set role authenticated;
select test_helpers.expect_denied(
  format('select public.credit_wallet_from_settlement(%L::uuid, %L)', :'id', 'HACK'),
  'T11 client settlement credit');
reset role;

\echo '=== TEST 12: authenticated client CANNOT insert into the ledger directly ==='
select pg_temp.act_as('11111111-1111-1111-1111-111111111111', 'authenticated');
set role authenticated;
select test_helpers.expect_denied(
  'insert into public.wallet_transactions (user_id, type, amount, currency) values (''11111111-1111-1111-1111-111111111111'', ''adjust'', 999999, ''coins'')',
  'T12 direct ledger insert');
reset role;

\echo '=== TEST 13: authenticated client CANNOT update wallets directly ==='
select pg_temp.act_as('11111111-1111-1111-1111-111111111111', 'authenticated');
set role authenticated;
select test_helpers.expect_denied(
  'update public.wallets set coins = 999999 where user_id = ''11111111-1111-1111-1111-111111111111''',
  'T13 direct wallet update');
reset role;

\echo '=== TEST 14: ledger is append-only (no UPDATE/DELETE for client) ==='
select pg_temp.act_as('11111111-1111-1111-1111-111111111111', 'authenticated');
set role authenticated;
select test_helpers.expect_denied(
  'delete from public.wallet_transactions where user_id = ''11111111-1111-1111-1111-111111111111''',
  'T14 ledger delete');
reset role;

\echo '=== TEST 15: authenticated client CAN read its own ledger (select policy) ==='
select pg_temp.act_as('11111111-1111-1111-1111-111111111111', 'authenticated');
set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.wallet_transactions;
  if n < 1 then raise exception 'FAIL T15: owner could not read own ledger'; end if;
  raise notice 'PASS T15: owner read % ledger rows', n;
end $$;
reset role;

\echo '=== TEST 16: blocked counterparty is rejected ==='
insert into public.blocked_users (blocker_id, blocked_id)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111')
on conflict do nothing;
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
do $$
begin
  begin
    perform public.wallet_transfer('22222222-2222-2222-2222-222222222222', 1, 'coins', 'x', 'idem-blocked');
    raise exception 'FAIL T16: transfer to a blocked counterparty was allowed';
  exception when others then
    if position('recipient_unavailable' in sqlerrm) > 0 then
      raise notice 'PASS T16: blocked counterparty rejected';
    else raise; end if;
  end;
end $$;
delete from public.blocked_users
 where blocker_id = '22222222-2222-2222-2222-222222222222'
   and blocked_id = '11111111-1111-1111-1111-111111111111';

\echo '=== TEST 17: nonexistent recipient is rejected ==='
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
do $$
begin
  begin
    perform public.wallet_transfer('99999999-9999-9999-9999-999999999999', 1, 'coins', 'x', 'idem-ghost');
    raise exception 'FAIL T17: transfer to nonexistent recipient was allowed';
  exception when others then
    if position('recipient_not_found' in sqlerrm) > 0 then
      raise notice 'PASS T17: nonexistent recipient rejected';
    else raise; end if;
  end;
end $$;

\echo '=== TEST 18: per-transaction + daily velocity limits enforced ==='
-- temporarily lower the caps so the seeded balances can exercise them
update public.wallet_limits set value = 100 where key = 'transfer_max_per_tx_coins';
update public.wallet_limits set value = 150 where key = 'transfer_max_per_day_coins';
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
do $$
begin
  begin
    perform public.wallet_transfer('22222222-2222-2222-2222-222222222222', 200, 'coins', 'x', 'idem-limit-tx');
    raise exception 'FAIL T18a: per-transaction limit not enforced';
  exception when others then
    if position('transfer_limit_exceeded' in sqlerrm) > 0 then
      raise notice 'PASS T18a: per-transaction limit enforced';
    else raise; end if;
  end;
end $$;
select public.wallet_transfer('22222222-2222-2222-2222-222222222222', 100, 'coins', 'x', 'idem-limit-day-1') as first_ok;
do $$
begin
  begin
    perform public.wallet_transfer('22222222-2222-2222-2222-222222222222', 100, 'coins', 'x', 'idem-limit-day-2');
    raise exception 'FAIL T18b: daily velocity limit not enforced';
  exception when others then
    if position('daily_transfer_limit_exceeded' in sqlerrm) > 0 then
      raise notice 'PASS T18b: daily velocity limit enforced';
    else raise; end if;
  end;
end $$;
update public.wallet_limits set value = 1000000 where key = 'transfer_max_per_tx_coins';
update public.wallet_limits set value = 2000000 where key = 'transfer_max_per_day_coins';

\echo '=== FINAL LEDGER ==='
select user_id, type, amount, currency, idempotency_key, balance_after
  from public.wallet_transactions order by created_at, type;
\echo '=== FINAL BALANCES ==='
select user_id, coins, usd_balance, bdt_balance from public.wallets order by user_id;
