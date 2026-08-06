import env from './env';

/**
 * TON (The Open Network) configuration.
 *
 * Reads optional env vars:
 *   - VITE_TON_API_KEY   — toncenter API key (optional; free tier works without it)
 *   - VITE_TON_ENDPOINT  — toncenter JSON-RPC endpoint (defaults to mainnet)
 */
export const TON_CONFIG = {
  API_KEY: env.VITE_TON_API_KEY || '',
  // Default to toncenter mainnet JSON-RPC endpoint.
  ENDPOINT: env.VITE_TON_ENDPOINT || 'https://toncenter.com/api/v2/jsonRPC',
  // Toncenter has no push/WebSocket API for balances — we poll lightly.
  POLL_INTERVAL_MS: 15_000,
};

export function isTonConfigured(): boolean {
  return TON_CONFIG.ENDPOINT.length > 0;
}

export function tonEndpoint(): string {
  return TON_CONFIG.ENDPOINT;
}

export function tonApiKey(): string | undefined {
  return TON_CONFIG.API_KEY || undefined;
}
