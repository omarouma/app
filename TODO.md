# TODO — Fix ERR_INSUFFICIENT_RESOURCES + TON Wallet Integration

## Part A — Fix resource exhaustion
- [x] 1. `src/lib/supabase.ts` — realtime reconnect tuning + shared client
- [x] 2. `src/hooks/usePresence.ts` — heartbeat 30s→45s, sweep 15s→45s
- [x] 3. `src/hooks/useGATracking.ts` — page_view debounce/guard
- [x] 4. `src/hooks/useFirebaseAnalytics.ts` — avoid double-tracking with GA4
- [x] 5. `src/store/useNotificationStore.ts` — shared-channel guard

## Part B — TON integration
- [x] 6. `src/config/env.ts` — add VITE_TON_API_KEY + VITE_TON_ENDPOINT
- [x] 7. `src/config/tonConfig.ts` (new) — endpoint/key config
- [x] 8. `src/services/tonService.ts` (new) — toncenter JSON-RPC client
- [x] 9. `src/pages/WalletPage.tsx` — TON Wallet card (balance + transactions, polled)

## Verification
- [x] Run `npx tsc -b` (zero errors)
- [x] Run `npm run build` (success; only a pre-existing Tailwind ease-class warning)
