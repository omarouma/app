import { create } from 'zustand';
import {
  isFirestoreAvailable,
  COLLECTIONS,
  getDocById,
  setDocById,
  addDocToCollection,
  addDocToSubcollection,
  subscribeToDoc,
  serverTimestamp,
  getDb,
} from '@/lib/firestore';
import type { WalletData, WalletTransaction } from '@/types';

export type CurrencyCode = 'GAGA' | 'USD' | 'coins' | 'BDT' | 'RMB' | 'INR'; // BDT kept for backward compatibility

export interface ExchangeRate {
  from: CurrencyCode;
  to: CurrencyCode;
  rate: number;
  updatedAt: string;
}

// Exchange rates (1 unit of `from` = `rate` units of `to`)
export const EXCHANGE_RATES: Record<string, number> = {
  'GAGA_USD': 0.0071,
  'USD_GAGA': 140.85,
};

// Gaga Coin staking tiers
export const STAKING_TIERS = [
  { minCoins: 0, apy: 0, label: 'None' },
  { minCoins: 100, apy: 2.5, label: 'Bronze' },
  { minCoins: 500, apy: 4.0, label: 'Silver' },
  { minCoins: 2000, apy: 6.5, label: 'Gold' },
  { minCoins: 10000, apy: 10.0, label: 'Platinum' },
];

export function getStakingTier(coins: number) {
  return [...STAKING_TIERS].reverse().find(t => coins >= t.minCoins) || STAKING_TIERS[0];
}

export function convertCurrency(amount: number, from: CurrencyCode, to: CurrencyCode): number {
  if (from === to) return amount;
  const key = `${from}_${to}`;
  const rate = EXCHANGE_RATES[key];
  if (!rate) return 0;
  return Math.round(amount * rate * 100) / 100;
}

export function formatCurrency(amount: number, currency: CurrencyCode): string {
  if (currency === 'GAGA') return `${amount.toLocaleString()} GAGA`;
  if (currency === 'BDT') return `৳${amount.toFixed(2)}`; // BDT kept for backward compatibility
  if (currency === 'USD') return `$${amount.toFixed(2)}`;
  if (currency === 'RMB') return `¥${amount.toFixed(2)}`;
  if (currency === 'INR') return `₹${amount.toFixed(2)}`;
  return `${amount}`;
}

export function getCurrencySymbol(currency: CurrencyCode): string {
  if (currency === 'GAGA') return 'G';
  if (currency === 'BDT') return '৳'; // BDT kept for backward compatibility
  if (currency === 'USD') return '$';
  if (currency === 'RMB') return '¥';
  if (currency === 'INR') return '₹';
  return '';
}

const hasSecureCrypto = () => typeof crypto !== 'undefined' && !!crypto.subtle && typeof crypto.getRandomValues === 'function';

export function normalizeWalletData(data: Record<string, unknown> | null | undefined): WalletData {
  if (!data) return { coins: 0, usdBalance: 0, bdtBalance: 0, transactions: [] };
  const coins = typeof data.coins === 'number' ? data.coins : Number(data.coins || 0);
  const usdBalance =
    typeof data.usdBalance === 'number'
      ? data.usdBalance
      : typeof data.usd_balance === 'number'
        ? data.usd_balance
        : typeof data.bdtBalance === 'number'
          ? data.bdtBalance
          : 0;
  const bdtBalance = typeof data.bdtBalance === 'number' ? data.bdtBalance : usdBalance;
  return {
    coins: Number.isFinite(coins) ? coins : 0,
    usdBalance: Number.isFinite(usdBalance) ? usdBalance : 0,
    bdtBalance: Number.isFinite(bdtBalance) ? bdtBalance : 0,
    transactions: Array.isArray(data.transactions) ? (data.transactions as WalletTransaction[]) : [],
  };
}

const readStoredValue = (key: string) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStoredValue = (key: string, value: string) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
};
const isValidPositiveAmount = (amount: number) => Number.isFinite(amount) && amount > 0;

// SECURITY: All wallet mutations MUST go through server-side RPC functions.
// The client never writes wallet balances directly — RLS on the wallets table
// only permits SELECT. This prevents users from setting their own balance.
async function callWalletRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const db = getDb();
  if (!db) throw new Error('Database not available');
  const { data, error } = await db.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

function normalizeCurrency(c: CurrencyCode): string {
  if (c === 'GAGA') return 'coins';
  return c.toLowerCase();
}

// PBKDF2 PIN hashing using Web Crypto API
async function hashPin(pin: string): Promise<string> {
  if (!hasSecureCrypto()) {
    return `legacy:${btoa(pin)}`;
  }
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(derived)));
  return `${saltB64}:${hashB64}`;
}

async function verifyPinHash(pin: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  if (!hasSecureCrypto()) {
    const [scheme, payload] = stored.split(':');
    return scheme === 'legacy' && payload === btoa(pin);
  }
  const [saltB64, hashB64] = stored.split(':');
  if (!saltB64 || !hashB64) return false;
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const derivedB64 = btoa(String.fromCharCode(...new Uint8Array(derived)));
  return derivedB64 === hashB64;
}

interface WalletStore {
  wallet: WalletData | null;
  pinHash: string | null;
  pinLocked: boolean;
  loading: boolean;
  lastError: string | null;
  exchangeRates: ExchangeRate[];

  // Subscription
  subscribeWallet: (userId: string) => () => void;

  // Core wallet ops
  earnCoins: (userId: string, amount: number, description: string) => Promise<void>;
  deposit: (userId: string, amount: number, currency: CurrencyCode, method: string) => Promise<void>;
  withdraw: (userId: string, amount: number, currency: CurrencyCode, method: string, account: string) => Promise<boolean>;

  // Currency conversion
  convert: (userId: string, amount: number, from: CurrencyCode, to: CurrencyCode) => Promise<boolean>;

  // P2P transfers
  sendFromChat: (fromUserId: string, fromUserName: string, chatId: string, toUserId: string, amount: number, currency: CurrencyCode, note?: string) => Promise<boolean>;
  sendP2P: (fromUserId: string, toUserId: string, toUserName: string, amount: number, currency: CurrencyCode, note?: string) => Promise<boolean>;
  requestMoney: (fromUserId: string, fromUserName: string, toUserId: string, amount: number, currency: CurrencyCode, note?: string) => Promise<boolean>;
  splitBill: (fromUserId: string, toUserIds: string[], totalAmount: number, currency: CurrencyCode, description: string) => Promise<boolean>;

  // Promo codes
  redeemCode: (userId: string, code: string, promoCodes: Record<string, { coins: number; label: string }>) => Promise<boolean>;

  // Staking / Interest
  claimDailyInterest: (userId: string) => Promise<number>;
  getDailyInterestAmount: (userId: string) => number;

  // Wallet security
  setWalletPin: (userId: string, pin: string) => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  clearWalletPin: (userId: string) => void;
  resetPin: (userId: string) => void;
  unlockWallet: () => void;
  lockWallet: () => void;
  hasPinSet: () => boolean;

  // Stats
  getTotalBalanceInGaga: () => number;
  getStakingAPY: () => number;
}

export const useWalletStore = create<WalletStore>((set, get) => ({
  wallet: null,
  pinHash: null,
  pinLocked: false,
  loading: true,
  lastError: null,
  exchangeRates: [
    { from: 'GAGA', to: 'USD', rate: EXCHANGE_RATES.GAGA_USD, updatedAt: new Date().toISOString() },
  ],

  subscribeWallet: (userId: string) => {
    if (!isFirestoreAvailable()) {
      console.warn('[WalletStore.subscribeWallet] Firestore unavailable');
      set({ wallet: null, loading: false, lastError: 'Firestore unavailable' });
      return () => { };
    }
    if (!userId) {
      set({ wallet: null, loading: false, lastError: null });
      return () => { };
    }

    // subscribeToDoc fires immediately with the current state,
    // so a separate fetchWallet() call is redundant — removed.
    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeToDoc(COLLECTIONS.WALLETS, userId, async (data) => {
        if (data) {
          set({
            wallet: normalizeWalletData(data as Record<string, unknown>),
            loading: false,
            lastError: null,
          });
        } else {
          // No wallet yet — create one with welcome bonus via server-side RPC.
          // Direct INSERT on wallets is blocked by RLS (SELECT-only).
          try {
            await callWalletRpc<boolean>('wallet_earn_coins', {
              p_amount: 50,
              p_description: 'Welcome bonus - 50 Gaga Coins',
            });
            set({ lastError: null });
          } catch {
            set({ lastError: 'Failed to initialize wallet.' });
          }
          // The realtime subscription will push the created wallet on next event;
          // optimistically show a zeroed wallet to avoid a flash.
          set({ wallet: { coins: 0, bdtBalance: 0, usdBalance: 0, transactions: [] }, loading: false });
        }

        // Load saved PIN hash
        const savedPinHash = readStoredValue(`gaga_wallet_pin_${userId}`);
        if (savedPinHash) set({ pinHash: savedPinHash, pinLocked: true });
      });
    } catch {
      set({ loading: false, lastError: 'Failed to load wallet data.' });
    }

    return () => { if (unsub) unsub(); };
  },

  earnCoins: async (userId, amount, description) => {
    if (!isFirestoreAvailable()) {
      console.warn('[WalletStore.earnCoins] Firestore unavailable');
      return;
    }
    if (!userId || !isValidPositiveAmount(amount)) {
      set({ lastError: 'Invalid amount.' });
      return;
    }
    try {
      // SECURITY: Route through server-side RPC — client cannot write balances directly.
      await callWalletRpc<boolean>('wallet_earn_coins', {
        p_amount: amount,
        p_description: description || 'Earned coins',
      });
      set({ lastError: null });
    } catch {
      set({ lastError: 'Failed to earn coins.' });
    }
  },

  deposit: async (userId, amount, currency, method) => {
    if (!isFirestoreAvailable()) {
      console.warn('[WalletStore.deposit] Firestore unavailable');
      return;
    }
    if (!userId || !isValidPositiveAmount(amount)) {
      set({ lastError: 'Invalid deposit amount.' });
      return;
    }
    try {
      // SECURITY: Route through server-side RPC — client cannot write balances directly.
      await callWalletRpc<boolean>('wallet_deposit', {
        p_amount: amount,
        p_currency: normalizeCurrency(currency),
        p_method: method || 'manual',
      });
      set({ lastError: null });
    } catch {
      set({ lastError: 'Deposit failed.' });
    }
  },

  withdraw: async (userId, amount, currency, method, account) => {
    if (!isFirestoreAvailable()) {
      console.warn('[WalletStore.withdraw] Firestore unavailable');
      return false;
    }
    if (!userId || !isValidPositiveAmount(amount)) {
      set({ lastError: 'Invalid withdrawal amount.' });
      return false;
    }
    try {
      // SECURITY: Route through server-side RPC — client cannot write balances directly.
      await callWalletRpc<boolean>('wallet_withdraw', {
        p_amount: amount,
        p_currency: normalizeCurrency(currency),
        p_method: method || 'manual',
        p_account: account || '',
      });
      set({ lastError: null });
      return true;
    } catch {
      set({ lastError: 'Withdrawal failed.' });
      return false;
    }
  },

  convert: async (userId, amount, from, to) => {
    void userId; // user is resolved server-side via auth.uid()
    if (!isFirestoreAvailable()) {
      console.warn('[WalletStore.convert] Firestore unavailable');
      return false;
    }
    if (!isValidPositiveAmount(amount)) {
      set({ lastError: 'Invalid conversion amount.' });
      return false;
    }
    try {
      // SECURITY: Route through server-side RPC — client cannot write balances directly.
      void convertCurrency; // rate is passed to the server
      const ok = await callWalletRpc<boolean>('wallet_convert', {
        p_amount: amount,
        p_from_currency: normalizeCurrency(from),
        p_to_currency: normalizeCurrency(to),
        p_rate: EXCHANGE_RATES[`${normalizeCurrency(from)}_${normalizeCurrency(to)}`] ??
               EXCHANGE_RATES[`${from}_${to}`] ?? 0,
      });
      if (!ok) {
        set({ lastError: 'Currency conversion failed.' });
        return false;
      }
      set({ lastError: null });
      return true;
    } catch {
      set({ lastError: 'Currency conversion failed.' });
      return false;
    }
  },

  // P2P transfer via atomics server-side RPC
  sendFromChat: async (fromUserId, fromUserName, chatId, toUserId, amount, currency, note = '') => {
    void fromUserName; // used in the chat message inserted below
    if (!isFirestoreAvailable()) {
      console.warn('[WalletStore.sendFromChat] Firestore unavailable');
      return false;
    }
    if (!isValidPositiveAmount(amount)) {
      set({ lastError: 'Invalid amount.' });
      return false;
    }
    try {
      // SECURITY: Route through server-side RPC — the server debits the sender
      // and credits the receiver atomically. The client never writes balances.
      const ok = await callWalletRpc<boolean>('wallet_transfer', {
        p_to_user_id: toUserId,
        p_amount: amount,
        p_currency: normalizeCurrency(currency),
        p_note: note || '',
      });
      if (!ok) {
        set({ lastError: 'Transfer failed.' });
        return false;
      }

      // Insert transfer message (best-effort)
      try {
        await addDocToSubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, {
          chatId,
          senderId: fromUserId,
          content: `Sent ${formatCurrency(amount, currency)}${note ? ': ' + note : ''}`,
          type: 'money_transfer',
          transferData: {
            amount,
            currency: (currency === 'GAGA' ? 'coins' : currency) as 'coins' | 'BDT' | 'USD' | 'RMB' | 'INR',
            fromUserId,
            toUserId,
            status: 'completed',
            note: note || '',
          },
          timestamp: serverTimestamp(),
          read: false,
        });
      } catch {
        // transfer message insert failed — non-fatal
      }

      set({ lastError: null });
      return true;
    } catch {
      set({ lastError: 'Transfer failed.' });
      return false;
    }
  },

  // Standalone P2P transfer (no chat required)
  sendP2P: async (fromUserId, toUserId, toUserName, amount, currency, note = '') => {
    void toUserName; // reserved for the notification body
    if (!isFirestoreAvailable()) {
      console.warn('[WalletStore.sendP2P] Firestore unavailable');
      return false;
    }
    try {
      // SECURITY: Route through server-side RPC — the server debits the sender
      // and credits the receiver atomically. The client never writes balances.
      const ok = await callWalletRpc<boolean>('wallet_transfer', {
        p_to_user_id: toUserId,
        p_amount: amount,
        p_currency: normalizeCurrency(currency),
        p_note: note || '',
      });
      if (!ok) {
        set({ lastError: 'Transfer failed.' });
        return false;
      }
      // Create a direct chat for the transfer message (best-effort)
      try {
        const participants = [fromUserId, toUserId].sort();
        const chatId = `dm_${participants.join('_')}`;
        const existingChat = await getDocById(COLLECTIONS.CHATS, chatId);
        if (!existingChat) {
          await setDocById(COLLECTIONS.CHATS, chatId, {
            type: 'direct',
            participants,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            unreadCount: 0,
          });
        }
        await addDocToSubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, {
          chatId,
          senderId: fromUserId,
          content: `Sent ${formatCurrency(amount, currency)}${note ? ': ' + note : ''}`,
          type: 'money_transfer',
          transferData: {
            amount,
            currency: (currency === 'GAGA' ? 'coins' : currency) as 'coins' | 'BDT' | 'USD' | 'RMB' | 'INR',
            fromUserId,
            toUserId,
            status: 'completed',
            note: note || '',
          },
          timestamp: serverTimestamp(),
          read: false,
        });
      } catch {
        // P2P transfer chat message insert failed — non-fatal
      }

      // Notify the recipient
      try {
        await addDocToCollection(COLLECTIONS.NOTIFICATIONS, {
          userId: toUserId,
          type: 'money_received',
          title: 'Money Received',
          body: `${formatCurrency(amount, currency)} received${note ? ': ' + note : ''}`,
          fromId: fromUserId,
          data: { userId: fromUserId },
          timestamp: serverTimestamp(),
          read: false,
        });
      } catch {
        // Notification insert failed — non-fatal
      }

      set({ lastError: null });
      return true;
    } catch {
      set({ lastError: 'Transfer failed.' });
      return false;
    }
  },

  // Request money from a friend
  requestMoney: async (fromUserId, fromUserName, toUserId, amount, currency, note = '') => {
    if (!isFirestoreAvailable()) {
      console.warn('[WalletStore.requestMoney] Firestore unavailable');
      return false;
    }
    try {
      // Send a notification to the requested user
      await addDocToCollection(COLLECTIONS.NOTIFICATIONS, {
        userId: toUserId,
        type: 'money_received',
        title: 'Money Request',
        body: `${fromUserName} requested ${formatCurrency(amount, currency)}${note ? ': ' + note : ''}`,
        fromId: fromUserId,
        data: { userId: fromUserId, requestType: 'money_request', amount, currency },
        timestamp: serverTimestamp(),
        read: false,
      });

      // Also create a message in the direct chat (best-effort)
      try {
        const participants = [fromUserId, toUserId].sort();
        const chatId = `dm_${participants.join('_')}`;
        const existingChat = await getDocById(COLLECTIONS.CHATS, chatId);
        if (!existingChat) {
          await setDocById(COLLECTIONS.CHATS, chatId, {
            type: 'direct',
            participants,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            unreadCount: 0,
          });
        }
        await addDocToSubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, {
          chatId,
          senderId: fromUserId,
          content: `Requested ${formatCurrency(amount, currency)}${note ? ': ' + note : ''}`,
          type: 'system',
          timestamp: serverTimestamp(),
          read: false,
        });
      } catch {
        // money request chat message insert failed — non-fatal
      }

      set({ lastError: null });
      return true;
    } catch {
      set({ lastError: 'Request failed.' });
      return false;
    }
  },

  // Split a bill with multiple friends — sends a notification + chat message
  // to each participant. Balances are NOT changed here; settlement happens
  // via P2P transfer (wallet_transfer RPC).
  splitBill: async (fromUserId, toUserIds, totalAmount, currency, description) => {
    if (!isFirestoreAvailable()) {
      console.warn('[WalletStore.splitBill] Firestore unavailable');
      return false;
    }
    try {
      if (toUserIds.length === 0) return false;

      const perPerson = Math.round((totalAmount / toUserIds.length) * 100) / 100;

      // Send notifications to all participants
      for (const toUserId of toUserIds) {
        if (toUserId === fromUserId) continue;
        try {
          await addDocToCollection(COLLECTIONS.NOTIFICATIONS, {
            userId: toUserId,
            type: 'money_received',
            title: 'Bill Split Request',
            body: `You owe ${formatCurrency(perPerson, currency)} for "${description}"`,
            fromId: fromUserId,
            data: { userId: fromUserId, requestType: 'split_bill', amount: perPerson, currency, description },
            timestamp: serverTimestamp(),
            read: false,
          });
        } catch {
          // split bill notification failed — non-fatal
        }

        // Create a message in the direct chat (best-effort)
        try {
          const participants = [fromUserId, toUserId].sort();
          const chatId = `dm_${participants.join('_')}`;
          const existingChat = await getDocById(COLLECTIONS.CHATS, chatId);
          if (!existingChat) {
            await setDocById(COLLECTIONS.CHATS, chatId, {
              type: 'direct',
              participants,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              unreadCount: 0,
            });
          }
          await addDocToSubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, {
            chatId,
            senderId: fromUserId,
            content: `Bill split: "${description}" — you owe ${formatCurrency(perPerson, currency)}`,
            type: 'system',
            timestamp: serverTimestamp(),
            read: false,
          });
        } catch {
          // split bill chat message insert failed — non-fatal
        }
      }

      set({ lastError: null });
      return true;
    } catch {
      set({ lastError: 'Split bill failed.' });
      return false;
    }
  },

  redeemCode: async (userId, code, promoCodes) => {
    if (!isFirestoreAvailable()) {
      console.warn('[WalletStore.redeemCode] Firestore unavailable');
      return false;
    }
    const promo = promoCodes[code.toUpperCase()];
    if (!promo) return false;
    await get().earnCoins(userId, promo.coins, `Redeemed ${code}: ${promo.label}`);
    return true;
  },

  claimDailyInterest: async (userId) => {
    void userId; // user is resolved server-side via auth.uid()
    if (!isFirestoreAvailable()) {
      console.warn('[WalletStore.claimDailyInterest] Firestore unavailable');
      return 0;
    }
    try {
      // SECURITY: Route through server-side RPC — the server enforces the
      // 20-hour cooldown and computes interest from the authoritative balance.
      const interest = await callWalletRpc<number>('wallet_claim_daily_interest', {});
      set({ lastError: null });
      return Number.isFinite(interest) ? interest : 0;
    } catch {
      set({ lastError: 'Failed to claim daily interest.' });
      return 0;
    }
  },

  getDailyInterestAmount: () => {
    const { wallet } = get();
    if (!wallet) return 0;
    // Use wallet coins from store; userId param kept for API compatibility
    const tier = getStakingTier(wallet.coins);
    const interest = Math.round((wallet.coins * (tier.apy / 100) / 365) * 100) / 100;
    return interest >= 0 ? interest : 0;
  },

  // Wallet Security
  setWalletPin: async (userId, pin) => {
    try {
      const hash = await hashPin(pin);
      writeStoredValue(`gaga_wallet_pin_${userId}`, hash);
      set({ pinHash: hash, pinLocked: true, lastError: null });
    } catch {
      set({ lastError: 'Failed to set PIN.' });
    }
  },

  verifyPin: async (pin) => {
    const { pinHash } = get();
    if (!pinHash) return false;
    try {
      return await verifyPinHash(pin, pinHash);
    } catch {
      return false;
    }
  },

  clearWalletPin: (userId) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(`gaga_wallet_pin_${userId}`);
      }
    } catch {
      // ignore storage failures
    }
    set({ pinHash: null, pinLocked: false });
  },

  resetPin: (userId) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(`gaga_wallet_pin_${userId}`);
      }
    } catch {
      // ignore storage failures
    }
    set({ pinHash: null, pinLocked: false });
  },

  unlockWallet: () => {
    set({ pinLocked: false });
  },

  lockWallet: () => {
    if (get().pinHash) {
      set({ pinLocked: true });
    }
  },

  hasPinSet: () => {
    return !!get().pinHash;
  },

  getTotalBalanceInGaga: () => {
    const { wallet } = get();
    if (!wallet) return 0;
    const usdInGaga = convertCurrency(wallet.usdBalance || 0, 'USD', 'GAGA');
    return (wallet.coins || 0) + usdInGaga;
  },

  getStakingAPY: () => {
    const { wallet } = get();
    if (!wallet) return 0;
    return getStakingTier(wallet.coins).apy;
  },
}));
