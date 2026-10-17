# GaGa wallet and release review — 18 October 2026

## Verified scope

Reviewed main at 0bf4236ba8ee48a485fe2d94c815c3a2181b083b and live Supabase project fcjgbbmfqdkucfpqjxae. Latest reviewed release PRs #118–122 describe GaGa 2.8.12 (67). Their historic test results are not fresh device verification. Firebase public configuration matches the supplied oumagachat Android configuration, package gagachat.app. No Firebase administrative access or fresh delivery test was established in this review.

## Fix in this change

Wallet initialization incorrectly POSTed a client-supplied zero balance to /wallets. Live wallet RLS is SELECT-only for authenticated users, so a new user's wallet could not be initialized. The client now POSTs an empty object to the existing authenticated ensure_wallet RPC. The server chooses auth.uid(), initializes zero balances and leaves an existing wallet untouched. No RLS relaxation, live schema change, balance adjustment or feature-flag enablement is needed. A Ktor contract regression checks verb, endpoint, authorization, empty payload and response decoding.

## Live findings and outstanding work

- Supabase reports ACTIVE_HEALTHY. All 67 listed public tables have RLS enabled.
- real_money_p2p is false. Keep it false until a reviewed payment implementation and operational approvals exist.
- 11 tables have RLS without policies. Some are intentionally server-only; do not add permissive policies simply to clear lint notices.
- 70 authenticated SECURITY DEFINER RPCs are flagged for review. This is an exposure inventory, not proof of 70 authorization bugs. Review ownership, active-session checks and grants individually.
- pg_net extension placement and disabled leaked-password protection remain advisor warnings.
- Recent Postgres error entries include migration syntax errors. They are not proof that ordinary chat requests currently fail. Reconcile migration history before applying old files wholesale.
- Wallet transfers have separate legacy and current overloads. The legacy transfer lacks the newer recipient/block/velocity checks; consolidate only after checking deployed clients.
- Current idempotency replays do not validate that reused keys have identical payloads. Android creates a new key per invocation, so a manual retry after an uncertain response can be a second payment. Persist an operation identity across restart/retry and reject changed payloads.
- Numeric database amounts need explicit finite-value and precision validation. Android Long coin DTOs are unsuitable for fractional fiat/crypto amounts.
- Withdrawal RPCs debit balances and log a withdrawal; they do not execute an external payout. They must not be enabled as real withdrawals.
- Conversion uses database exchange_rates; this is not executable exchange liquidity or a provider quote.
- Top-up intent creation is not payment collection. A pending intent must never be presented as a successful purchase.
- Physical-device push/calling/OCR, Play internal-track installation and prior migration-history reconciliation remain release qualification work identified by #118.

## Real-money wallet implementation boundary

BDT first: contract with an appropriately licensed PSP/bank for the exact stored-value, P2P and payout services. A merchant payment gateway contract alone does not establish permission to issue a wallet. Confirm account ownership, KYC/AML, safeguarding, settlement, complaints, limits and permitted transaction types with the partner.

Build separate assets/accounts, immutable double-entry journals, balanced postings per asset, integer minor units or exact numeric strings, held/available balances, and durable operations. Operations need created/pending/authorized/settled/failed/reversed states. Provider callbacks require signature validation, replay protection, event uniqueness and independent amount/currency/order verification. Settle only once, reconcile provider and ledger totals daily, and reverse with compensating entries. A payout timeout remains pending until provider reconciliation; do not release the hold or issue another payout blindly.

Every send/buy/sell/withdraw review must show recipient, asset, network where applicable, amount, fees, total, quote expiry and explicit confirmation. Enforce server-side KYC tier, jurisdiction and velocity rules; add step-up authentication, device/session checks, transaction receipts and audited operator access. Test concurrent spend, duplicate/reordered callbacks, mismatched settlement, failed payout/reversal, revoked sessions and account switching before funding production.

USD is fiat. USDT and USDC are distinct crypto assets, with network-specific contracts, precision, fees and risks; they are not interchangeable USD balances. Never store user custody private keys in Android or public database tables. An eligible international implementation needs a contracted custody/exchange provider, permitted jurisdictions, supported networks, sanctions screening and deposit/withdrawal reconciliation before activation.

GaGa Coins currently represent internal database units, not an issued blockchain token, redeemable money or an exchange listing. Keep rewards separate from purchased units and fiat. Tradable/redeemable coins require a separate legal, economic, custody, liquidity and accounting design. Do not promise a peg, cash redemption or investment return.

## Bangladesh constraints checked

Bangladesh Bank FE Circular 24 (15 September 2022) prohibits obtaining virtual assets in/from/to Bangladesh and facilitating their exchange/transfer/trading. BRPD Circular Letter 40 reinforces bank restrictions. Therefore this review does not enable USDT/USDC trading or tradable GaGa Coins for Bangladesh. Any international route needs a jurisdiction-specific assessment and licensed provider acceptance; a foreign billing address does not resolve this.

Sources:
- https://www.bb.org.bd/mediaroom/circulars/fepd/sep152022fepd24e.pdf
- https://www.bb.org.bd/mediaroom/circulars/brpd/oct122022brpdl40.pdf
- https://www.bb.org.bd/en/index.php/financialactivity/paysystems

## Validation

Live ensure_wallet definition checked: active-session guard, auth.uid() ownership, INSERT ON CONFLICT DO NOTHING. Anonymous call rejection verified without inserting fixtures. Eight Python Firebase/release/update-policy tests pass after the standard configuration preparation step. New Kotlin regression and Android compilation require GitHub CI; no local Gradle/Android SDK is installed. No new APK, production rollout or real financial activation is claimed by this change.
