# Per-user external wallet tracking

## Implemented scope

The Wallet screen opens Connected wallets. Each authenticated user can save up to ten labeled public watch addresses with an explicit network: BNB Smart Chain, Ethereum, Bitcoin mainnet bech32/bech32m, or TON friendly address. No personal founder address, Binance UID or account credentials are embedded in the app. Saving an address does not prove ownership or create a wallet-signing session.

The new Supabase table is owner-private, with active-session SELECT/DELETE policies. Inserts go through an authenticated RPC choosing auth.uid(), normalizing EVM addresses and enforcing the cap under a per-user transaction lock. Duplicate network/address records replay the existing record. The refresh RPC enforces ownership, session validity and a 30-second per-address interval. No service-role key is used by the chain endpoint.

The authenticated chain-wallet function selects the stored address through that RPC; caller-controlled URLs, contracts, methods and addresses are never forwarded to providers. Fixed read-only calls pin chain IDs and a block height. Amounts are converted with BigInt and returned as exact decimal strings. Failures cannot become fake zero balances. Responses use private/no-store caching, timeouts, response byte limits and deny redirects.

## Live data coverage

- BNB Smart Chain: native BNB plus an explicit allowlist of Binance-Peg USDT, Binance-Peg USDC and Binance-Peg Bitcoin (BTCB), all with chain-specific contracts and 18 decimals. These are labeled bridged/pegged assets rather than native issuer USD or native Bitcoin.
- Ethereum: native ETH balance.
- Bitcoin: address validation, confirmed balance and up to 25 recent transaction references/statuses from mempool.space. Pending balance is not presented as confirmed. This is address history, not a complete wallet/xpub portfolio.
- TON: exact native Toncoin balance from TON Center mainnet, with friendly-address checksum and mainnet/basechain validation. Jettons (including any token named GRAM) are not inferred from wallet labels; history remains an explorer link. The keyless public provider has shared rate limits; failed/throttled reads surface as unavailable, never zero. Production scale requires provider capacity configuration.
- EVM full transaction history: explorer link only; no claim that an empty local list means no transactions.
- No USD valuation feed, exchange account balance, token discovery, trading, buy/sell or custodial deposits.

Balance checks disclose the watched address to the public provider. This is explained before the user chooses Check balance. Addresses are user-supplied, ownership unverified; QR/address views instruct the user to verify in the original wallet before using them for payment. Format validation is not proof of control.

## External wallet handoff

Prepare transfer supports native ETH/BNB/BTC only. Exact decimal input is converted to chain units; a separate review shows asset, network, recipient and amount. Opening a compatible external wallet uses ERC-681 or bitcoin URI syntax. The wallet must verify the sending account, destination, network, fees and total, and obtain authorization. No signing, broadcasting or success marking occurs inside GaGa. Installed-wallet compatibility, especially BNB ERC-681 handling, still needs physical-device qualification. Token transfers, WalletConnect session pairing, message-signature ownership verification and TON signing are deferred.

## Verification

Provider unit tests cover precise units, fixed origins/methods, chain/block pinning, wrong-chain rejection, upstream failure and Bitcoin history. Live SQL regressions use generated accounts/sessions inside a rollback: cross-owner read/delete/refresh denial, duplicate prevention, direct insertion denial, session revocation and owner removal. Android adds request contracts, account-bound authentication checks, transfer URI tests and review-before-handoff layout tests. CI results are tracked in the PR; signed release rollout is separate.

Sources checked 18 October 2026:
- https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/
- https://ethereum.org/developers/docs/apis/json-rpc/
- https://ethereum.publicnode.com/
- https://github.com/pancakeswap/token-list/blob/main/src/tokens/pancakeswap-extended.json
- https://mempool.space/docs/api/rest
- https://eips.ethereum.org/EIPS/eip-681
- https://bips.dev/321/
- https://docs.ton.org/foundations/addresses/formats
- https://toncenter.com/api/v2/
