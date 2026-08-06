import { tonEndpoint, tonApiKey, isTonConfigured } from '@/config/tonConfig';

/**
 * TON (The Open Network) service — a lightweight toncenter JSON-RPC client
 * using plain `fetch` (no extra dependencies). Toncenter has no push/WebSocket
 * API for balances, so balance/transactions are polled at a low frequency.
 */

export interface TonAccountInfo {
  address: string;
  /** Balance in TON (converted from nanotons). */
  balanceTon: number;
  /** Raw balance in nanotons. */
  balanceNano: string;
  status: string;
}

export interface TonTransaction {
  hash: string;
  /** Unix timestamp (seconds). */
  utime: number;
  /** TON value (converted). */
  valueTon: number;
  /** Raw nanotons. */
  valueNano: string;
  sender: string;
  recipient: string;
  success: boolean;
  /** Fee in TON. */
  feeTon: number;
  /** Human-readable message (comment) if present. */
  comment?: string;
}

// Deposit (receive) vs withdraw (send) heuristic for display.
export function isIncoming(tx: TonTransaction, address: string): boolean {
  if (!address) return true;
  const a = address.toLowerCase();
  return tx.recipient.toLowerCase() === a && tx.sender.toLowerCase() !== a;
}

let rpcId = 0;

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const apiKey = tonApiKey();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;

  const res = await fetch(tonEndpoint(), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++rpcId,
      method,
      params,
    }),
  });

  if (!res.ok) {
    throw new Error(`TON RPC error ${res.status}: ${res.statusText}`);
  }

  const json = await res.json();
  if (json?.error) {
    throw new Error(json.error.message || 'TON RPC error');
  }
  return json?.result as T;
}

/** Validate a TON friendly address (basic shape check). */
export function isValidTonAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  const a = address.trim();
  // Friendly addresses: 48 base64url chars, optionally "EQ", "UQ", "kQ", "0Q" prefixed.
  if (a.length !== 48) return false;
  return /^[A-Za-z0-9_-]+$/.test(a);
}

// Safe typed access to nested toncenter message fields (returned as `{}`).
function getMsgAddress(msg: unknown, key: 'source' | 'destination'): string {
  if (!msg || typeof msg !== 'object') return '';
  const addr = (msg as Record<string, unknown>)[key];
  if (!addr || typeof addr !== 'object') return '';
  const a = (addr as Record<string, unknown>).address;
  return typeof a === 'string' ? a : '';
}

function getMsgText(msg: unknown): string | undefined {
  if (!msg || typeof msg !== 'object') return undefined;
  const data = (msg as Record<string, unknown>).msg_data;
  if (!data || typeof data !== 'object') return undefined;
  const text = (data as Record<string, unknown>).text;
  if (typeof text !== 'string') return undefined;
  try { return atob(text); } catch { return undefined; }
}

/** Convert nanotons to TON. */
export function nanotonsToTon(nano: string | number): number {
  const n = typeof nano === 'number' ? nano : Number(nano || 0);
  if (!Number.isFinite(n)) return 0;
  return n / 1_000_000_000;
}

/** Format a TON amount with up to 9 decimals (trimming trailing zeros). */
export function formatTon(amount: number): string {
  if (!Number.isFinite(amount)) return '0';
  const fixed = amount.toFixed(9);
  return fixed.replace(/\.?0+$/, '');
}

/** Get account info + balance for a TON address. */
export async function getTonAccountInfo(address: string): Promise<TonAccountInfo> {
  const raw = await rpcCall<{ balance: string; status: string; address: string }>(
    'getAddressInformation',
    [{ address }],
  );
  const balanceNano = raw?.balance ?? '0';
  return {
    address: raw?.address ?? address,
    balanceTon: nanotonsToTon(balanceNano),
    balanceNano,
    status: raw?.status ?? 'unknown',
  };
}

/** Get recent transactions for a TON address. */
export async function getTonTransactions(
  address: string,
  limit = 10,
): Promise<TonTransaction[]> {
  const raw = await rpcCall<Array<Record<string, unknown>>>(
    'getTransactions',
    // params: [address, lt, hash, limit]
    [{ address }, null, null, limit],
  );

  if (!Array.isArray(raw)) return [];

  return raw.map((tx) => {
    const hash = (tx.hash as string) || '';
    const utime = Number(tx.utime || 0);
    const valueNano = String(tx.value || '0');
    const feeNano = String(tx.fee || '0');
    const inMsg = (tx.in_msg || {}) as Record<string, unknown>;
    const outMsgs = (tx.out_msgs || []) as Array<Record<string, unknown>>;

    // Determine sender/recipient + comment.
    let sender = getMsgAddress(inMsg, 'source');
    let recipient = getMsgAddress(inMsg, 'destination');
    let comment = getMsgText(inMsg);
    if (!sender && outMsgs.length > 0) {
      sender = getMsgAddress(outMsgs[0], 'source');
      recipient = getMsgAddress(outMsgs[0], 'destination');
      if (!comment) comment = getMsgText(outMsgs[0]);
    }

    return {
      hash,
      utime,
      valueTon: nanotonsToTon(valueNano),
      valueNano,
      sender,
      recipient,
      success: (tx.success as boolean) ?? true,
      feeTon: nanotonsToTon(feeNano),
      comment,
    };
  });
}

/** Fetch account info + transactions in one call (used by polling hook). */
export async function getTonWalletSnapshot(address: string, limit = 10) {
  if (!isTonConfigured()) {
    throw new Error('TON is not configured.');
  }
  const [account, txs] = await Promise.all([
    getTonAccountInfo(address),
    getTonTransactions(address, limit),
  ]);
  return { account, transactions: txs };
}

export default { getTonAccountInfo, getTonTransactions, getTonWalletSnapshot, isValidTonAddress, nanotonsToTon, formatTon, isIncoming };
