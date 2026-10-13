# LIVE production schema findings — Supabase project `fcjgbbmfqdkucfpqjxae`

Probed read-only via the public anon key (`android-native/ci/backend-public.json`) using
PostgREST type oracles (a non-uuid literal on a uuid column raises `22P02`; `like` on a
non-text column raises `42883`).

## Column types (live)

| table | column | live type |
|---|---|---|
| wallets | id | uuid |
| wallets | user_id | uuid |
| wallets | coins | numeric |
| wallets | usd_balance | numeric |
| wallets | bdt_balance | numeric |
| wallets | transactions | jsonb |
| wallets | total_earned | **MISSING** |
| wallets | last_interest_claim | **MISSING** |
| wallet_transactions | id | uuid |
| wallet_transactions | user_id | uuid |
| wallet_transactions | related_user_id | uuid |
| wallet_transactions | type | text |
| wallet_transactions | amount | numeric |
| wallet_transactions | currency | text |
| wallet_transactions | description | text |
| wallet_transactions | metadata | jsonb |
| wallet_transactions | idempotency_key | **MISSING** |
| wallet_transactions | balance_after | **MISSING** |
| users | id | uuid |
| users | is_admin | boolean |
| users | is_premium | boolean |
| blocked_users | blocker_id / blocked_id | uuid |

## Tables that are MISSING in live (but referenced by repo migrations)

- `exchange_rates` (repo migration 20260820000400 creates it)
- `daily_challenges` (referenced by `claim_challenge_coins`)
- `wallet_feature_flags`, `wallet_topup_intents` (new)

## RPCs actually deployed (probed)

| rpc | live status | live signature (from PostgREST hint) |
|---|---|---|
| wallet_transfer | **EXISTS** | `(p_to_user_id, p_amount, p_currency, p_description)` |
| wallet_spend_coins | EXISTS | `(p_amount, p_description)` |
| wallet_convert | EXISTS | `(p_amount, p_from, p_to)` |
| claim_challenge_coins | EXISTS | `(p_challenge_id, p_amount)` |
| activate_premium | EXISTS | `(p_plan_id, p_currency)` |
| wallet_earn_coins / wallet_deposit / wallet_withdraw / admin_award_coins | MISSING | — |

## Consequences (why the repo migrations are NOT the source of truth)

1. **`wallet_transfer` uses `p_description`, not `p_note`.** The client
   (`SupabaseRestApi.transferCoins`) sends `p_description` — that is *correct* for the
   live DB. The repo migration file `20260820000100` declares `p_note`, i.e. the file is
   out of sync with production. **Do not rename the parameter.**
2. **`wallet_convert` uses `p_from` / `p_to`**, not `p_from_currency` / `p_to_currency`.
3. **All user-id columns are `uuid`** in live, so money RPCs must use `auth.uid()`
   (uuid) and must NOT cast to text.
4. `wallets.total_earned`, `exchange_rates` and `daily_challenges` do not exist, so any
   migration must create/guard them before use.
5. The RLS policy in the repo (`auth.uid()::text = user_id`) would be invalid against a
   uuid column; the live policy must be `auth.uid() = user_id`.
