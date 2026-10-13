# Wallet ledger hardening — verification harness

This directory contains a **self-contained, reproducible** test harness for the
wallet security work delivered in
[`supabase/migrations/20261016000000_wallet_ledger_hardening.sql`](../../migrations/20261016000000_wallet_ledger_hardening.sql).

It exists because the wallet is the one part of GaGa where a UI bug is a *money*
bug. The harness proves, against a real PostgreSQL 15 engine, that the migration
actually enforces the invariants we promise — it does not rely on reading the SQL
and assuming it works.

## Why a custom harness (and not just the Supabase rollback tests)

The other files in `supabase/tests/` assume the full production schema already
exists and run inside `BEGIN/ROLLBACK`. The wallet migration, however, has to
*repair* a schema that has drifted: production is missing columns and whole
tables that the repo migrations never created. To test that repair honestly, the
harness first reconstructs the **LIVE** schema (as probed read-only through
PostgREST — see [`LIVE-SCHEMA-FINDINGS.md`](./LIVE-SCHEMA-FINDINGS.md)), then
applies the migration on top and asserts the result.

## What it models

`harness.sql` recreates the live-only reality the migration must cope with:

- `wallets.id` / `wallets.user_id` are **uuid** (not text);
- `wallet_transactions` already exists with **uuid** ids and **without**
  `idempotency_key` / `balance_after`, and carries a deliberately restrictive
  legacy `CHECK (type in ('earn','spend','topup'))`;
- `wallets.total_earned` / `wallets.last_interest_claim` **do not exist**;
- `exchange_rates` and `daily_challenges` **do not exist**;
- Supabase's default `GRANT ALL … TO anon, authenticated` is applied *before* the
  migration, and the production wallet `REVOKE`/RLS is applied, so the
  migration's own grants/revokes are exercised in the right order.

## What it asserts (18 tests)

| # | Invariant |
|---|-----------|
| T1 | a coin transfer moves the balance and writes **two** ledger rows |
| T2 | replaying with the same idempotency key is a no-op |
| T3 | real-money (`usd`) transfers are blocked while the flag is off |
| T4 | an over-balance transfer is rejected |
| T5 | self-transfers are rejected |
| T6 | `wallet_spend_coins` debits and logs to the ledger |
| T7 | `wallet_convert` is gated behind the real-money flag |
| T8 | `claim_challenge_coins` credits, logs, and is idempotent |
| T9 | a top-up **intent** is created `pending` and does not touch the balance |
| T10 | settlement crediting credits exactly once and replays idempotently |
| T11 | a client cannot call the settlement crediting function |
| T12 | a client cannot insert ledger rows directly |
| T13 | a client cannot update the wallet balance directly |
| T14 | the ledger is append-only (delete is denied) |
| T15 | an owner can read their own ledger |
| T16 | a transfer to a blocked counterparty is rejected |
| T17 | a transfer to a non-existent recipient is rejected |
| T18 | per-transaction and per-day velocity limits are enforced |

## Running it

```bash
# against a scratch PostgreSQL 15 cluster (default port 5432)
PGPORT=5433 ./run.sh
```

Every emitted line should read `PASS`. The script creates and drops the
`gaga_wallet_test` database; it never touches production.

## Design invariants this protects

- **The client can never move money.** Balance and history are written only by
  `SECURITY DEFINER` RPCs; direct `insert`/`update`/`delete` on the wallet and
  ledger are denied to `authenticated` (T12–T14).
- **The ledger is the source of truth.** History is an append-only
  `wallet_transactions` table, not the legacy `wallets.transactions` jsonb column
  (T1, T6, T8).
- **Retries are safe.** Idempotency keys make network timeouts and double-taps
  no-ops (T2, T8, T10).
- **Real money is off until it is legal and settled.** `usd`/`bdt` transfers and
  conversions are gated behind a server-only feature flag (T3, T7), and top-ups
  are credited only by a `service_role` settlement function (T9–T11).
- **Coins are reward points, not cash.** Nothing here lets a client convert the
  balance into withdrawable money.
