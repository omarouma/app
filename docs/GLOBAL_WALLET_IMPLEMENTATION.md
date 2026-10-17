# Global wallet implementation

## Scope

BDT is excluded from the new wallet experience. The previous readiness audit is historical; the current product scope is global USD, USDT, USDC and GaGa Coins. Existing BDT database records are not deleted or converted.

## Implemented

- Compact Wallet header, green rounded balance card and asset list using the app theme, with system font scaling and scrollable content.
- Server-loaded coin balance and exact decimal USD record. No portfolio total inventing a coin/USD exchange value.
- USDT/USDC clearly show Not connected instead of fake zero balances or invented deposit addresses.
- Existing real coin send flow, Receive dialog copying the full account UUID (the short display code is not a routing identifier), history filters, dated ledger entries, transaction details and copyable references.
- Explicit per-asset availability descriptions. No connected provider is claimed.
- Protected wallet initialization via ensure_wallet; integer history filtered to coins so fractional currency rows cannot break the coin DTO or be mislabeled as coin transactions.
- Removed silent fallback to legacy JSON history and fabricated zero wallets. Load failures surface; failed refresh retains prior content with a visible warning.
- Account logout/switch clears wallet state and transaction dialogs. In-flight loads check account ownership and an account generation before publishing.

## Real-data boundaries

USD is read from wallets.usd_balance as an exact JSON numeric token, converted with BigDecimal and stored as a decimal string. It is a server record, not evidence of bank reserves or withdrawable funds. Existing API coin amounts remain integer; separate exact-unit asset ledger models are still required for fiat/crypto transactions.

This change does not create a custody account, issue GaGa tokens, place exchange orders, accept deposits or pay withdrawals. A global audience still needs a specified operating entity, permitted launch countries and provider coverage. Do not enable legacy real_money_p2p to simulate these services.

## Remaining provider-dependent implementation

Select the operating entity/jurisdiction and contracted fiat/custody/exchange providers. Supply sandbox credentials through server secrets. Obtain provider-supported country, network and asset capabilities. Implement eligibility/KYC, double-entry asset accounting, exact amount/fee quotes, persistent idempotency, signed callbacks, settlement/reversal and reconciliation before enabling financial buttons. Blockchain receive requires a provider-generated, network-specific address and any required memo; never reuse the GaGa account UUID as a crypto address. GaGa coin buying/selling needs a distinct approved product and liquidity arrangement.

## Verification

Eight local Firebase/release-policy tests pass after prepare.py. Added Ktor request contract tests plus repository regressions for new wallet initialization, exact USD precision, failed ledger loads, in-flight account switches and logout clearing. Android compilation, Kotlin tests and visual validation run in GitHub CI. No new financial backend activation or production rollout is included.
