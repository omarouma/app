import { create } from 'zustand';
import {
  isFirestoreAvailable,
  COLLECTIONS,
  getDocById,
  setDocById,
  updateDocById,
  addDocToCollection,
  addDocToSubcollection,
  subscribeToDoc,
  serverTimestamp,
  runDbTransaction,
} from '@/lib/firestore';
import type { WalletData, WalletTransaction } from '@/types';

export type CurrencyCode = 'GAGA' | 'USD' | 'coins' | 'BDT'; // BDT kept for backward compatibility

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
  return `${amount}`;
}

export function getCurrencySymbol(currency: CurrencyCode): string {
  if (currency === 'GAGA') return 'G';
  if (currency === 'BDT') return '৳'; // BDT kept for backward compatibility
  if (currency === 'USD') return '$';
  return '';
}

const hasSecureCrypto = () => typeof crypto !== 'undefined' && !!crypto.subtle && typeof crypto.getRandomValues === 'function';
const readStoredValue = (key: string) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStoredValue = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
};
const isValidPositiveAmount = (amount: number) => Number.isFinite(amount) && amount > 0;

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
      return () => {};
    }
    if (!userId) {
      set({ wallet: null, loading: false, lastError: null });
      return () => {};
    }

    // subscribeToDoc fires immediately with the current state,
    // so a separate fetchWallet() call is redundant — removed.
    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeToDoc(COLLECTIONS.WALLETS, userId, async (data) => {
        if (data) {
          set({
            wallet: {
              coins: data.coins || 0,
              bdtBalance: data.bdtBalance || 0,
              usdBalance: data.usdBalance || data.bdtBalance || 0,
              transactions: data.transactions || [],
            },
            loading: false,
            lastError: null,
          });
        } else {
          // No wallet yet — create one with welcome bonus
          const welcomeTx: WalletTransaction = {
            id: `tx_${Date.now()}_welcome`,
            type: 'earn',
            amount: 50,
            currency: 'coins',
            description: 'Welcome bonus - 50 Gaga Coins',
            timestamp: new Date().toISOString(),
            status: 'completed',
          };
          try {
            await setDocById(COLLECTIONS.WALLETS, userId, {
              coins: 50,
              bdtBalance: 0,
              usdBalance: 0,
              transactions: [welcomeTx],
              totalEarned: 50,
              dailyStreak: 0,
              lastInterestClaim: null,
              createdAt: serverTimestamp(),
            });
          } catch {
        set({ lastError: 'Failed to initialize wallet.' });
      }
          set({
            wallet: { coins: 50, bdtBalance: 0, usdBalance: 0, transactions: [welcomeTx] },
            loading: false,
            lastError: null,
          });
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
      const existing = await getDocById(COLLECTIONS.WALLETS, userId);
      const tx: WalletTransaction = {
        id: `tx_${Date.now()}`,
        type: 'earn',
        amount,
        currency: 'coins',
        description,
        timestamp: new Date().toISOString(),
        status: 'completed',
      };
      if (existing) {
        await updateDocById(COLLECTIONS.WALLETS, userId, {
          coins: (existing.coins || 0) + amount,
          totalEarned: (existing.totalEarned || 0) + amount,
          transactions: [...(existing.transactions || []), tx],
        });
      } else {
        await setDocById(COLLECTIONS.WALLETS, userId, {
          coins: amount,
          bdtBalance: 0,
          usdBalance: 0,
          transactions: [tx],
          totalEarned: amount,
        });
      }
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
      const existing = await getDocById(COLLECTIONS.WALLETS, userId);
      const tx: WalletTransaction = {
        id: `tx_${Date.now()}_dep`,
        type: 'deposit',
        amount,
        currency: (currency === 'GAGA' ? 'coins' : currency) as 'coins' | 'USD' | 'BDT',
        description: `Deposit ${formatCurrency(amount, currency)} via ${method}`,
        timestamp: new Date().toISOString(),
        status: 'completed',
      };
      
      if (existing) {
        const update: Record<string, unknown> = {
          transactions: [...(existing.transactions || []), tx],
        };
        if (currency === 'GAGA') update.coins = (existing.coins || 0) + amount;
        else if (currency === 'USD') update.usdBalance = (existing.usdBalance || existing.bdtBalance || 0) + amount;
        await updateDocById(COLLECTIONS.WALLETS, userId, update);
      } else {
        const insert: Record<string, unknown> = {
          coins: currency === 'GAGA' ? amount : 0,
          bdtBalance: 0,
          usdBalance: currency === 'USD' ? amount : 0,
          transactions: [tx],
        };
        await setDocById(COLLECTIONS.WALLETS, userId, insert);
      }
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
      const existing = await getDocById(COLLECTIONS.WALLETS, userId);
      if (!existing) {
        set({ lastError: 'Wallet not found.' });
        return false;
      }
      
      const balanceKey = currency === 'GAGA' ? 'coins' : 'usdBalance';
      const current = (existing[balanceKey] as number) || 0;
      if (current < amount) {
        set({ lastError: 'Insufficient balance.' });
        return false;
      }

      const tx: WalletTransaction = {
        id: `tx_${Date.now()}_wd`,
        type: 'withdraw',
        amount,
        currency: (currency === 'GAGA' ? 'coins' : currency) as 'coins' | 'USD' | 'BDT',
        description: `Withdraw ${formatCurrency(amount, currency)} to ${method} (${account})`,
        timestamp: new Date().toISOString(),
        status: 'pending',
      };
      
      const update: Record<string, unknown> = {
        transactions: [...(existing.transactions || []), tx],
      };
      update[balanceKey] = current - amount;
      
      await updateDocById(COLLECTIONS.WALLETS, userId, update);
      set({ lastError: null });
      return true;
    } catch {
      set({ lastError: 'Withdrawal failed.' });
      return false;
    }
  },

  convert: async (userId, amount, from, to) => {
    if (!isFirestoreAvailable()) {
      console.warn('[WalletStore.convert] Firestore unavailable');
      return false;
    }
    try {
      const existing = await getDocById(COLLECTIONS.WALLETS, userId);
      if (!existing) {
        set({ lastError: 'Wallet not found.' });
        return false;
      }
      
      const fromKey = from === 'GAGA' ? 'coins' : 'usdBalance';
      const toKey = to === 'GAGA' ? 'coins' : 'usdBalance';
      const currentFrom = (existing[fromKey] as number) || 0;
      if (currentFrom < amount) {
        set({ lastError: 'Insufficient balance for conversion.' });
        return false;
      }
      
      const converted = convertCurrency(amount, from, to);
      
      const tx: WalletTransaction = {
        id: `tx_${Date.now()}_conv`,
        type: 'convert',
        amount,
        currency: from === 'GAGA' ? 'coins' : from,
        description: `Converted ${formatCurrency(amount, from)} to ${formatCurrency(converted, to)}`,
        timestamp: new Date().toISOString(),
        status: 'completed',
      };
      
      const update: Record<string, unknown> = {
        transactions: [...(existing.transactions || []), tx],
      };
      update[fromKey] = currentFrom - amount;
      update[toKey] = ((existing[toKey] as number) || 0) + converted;
      
      await updateDocById(COLLECTIONS.WALLETS, userId, update);
      set({ lastError: null });
      return true;
    } catch {
      set({ lastError: 'Currency conversion failed.' });
      return false;
    }
  },

  // P2P transfer via atomic transaction
  sendFromChat: async (fromUserId, fromUserName, chatId, toUserId, amount, currency, note = '') => {
    if (!isFirestoreAvailable()) {
      console.warn('[WalletStore.sendFromChat] Firestore unavailable');
      return false;
    }
    if (!isValidPositiveAmount(amount)) {
      set({ lastError: 'Invalid amount.' });
      return false;
    }
    try {
      let transferOk = false;
      await runDbTransaction(async () => {
        const senderWallet = await getDocById(COLLECTIONS.WALLETS, fromUserId);
        const balanceKey = currency === 'GAGA' ? 'coins' : 'usdBalance';
        const senderBalance = (senderWallet?.[balanceKey] as number) || 0;
        if (senderBalance < amount) throw new Error('Insufficient balance.');
        const receiverWallet = await getDocById(COLLECTIONS.WALLETS, toUserId);
        const tx: WalletTransaction = { id: `tx_${Date.now()}_send`, type: 'send', amount, currency: (currency === 'GAGA' ? 'coins' : currency) as 'coins' | 'BDT' | 'USD', description: `Sent ${formatCurrency(amount, currency)}${note ? ': ' + note : ''}`, timestamp: new Date().toISOString(), status: 'completed' };
        const receiverTx: WalletTransaction = { id: `tx_${Date.now()}_recv`, type: 'receive', amount, currency: (currency === 'GAGA' ? 'coins' : currency) as 'coins' | 'BDT' | 'USD', description: `Received ${formatCurrency(amount, currency)} from ${fromUserName}${note ? ': ' + note : ''}`, timestamp: new Date().toISOString(), status: 'completed' };
        await updateDocById(COLLECTIONS.WALLETS, fromUserId, { [balanceKey]: senderBalance - amount, transactions: [...(senderWallet?.transactions || []), tx] });
        await updateDocById(COLLECTIONS.WALLETS, toUserId, { [balanceKey]: ((receiverWallet?.[balanceKey] as number) || 0) + amount, transactions: [...(receiverWallet?.transactions || []), receiverTx] });
        transferOk = true;
      });
      if (!transferOk) return false;

      // Insert transfer message (best-effort)
      try {
        await addDocToSubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, {
          chatId,
          senderId: fromUserId,
          content: `Sent ${formatCurrency(amount, currency)}${note ? ': ' + note : ''}`,
          type: 'money_transfer',
          transferData: {
            amount,
            currency: (currency === 'GAGA' ? 'coins' : currency) as 'coins' | 'BDT' | 'USD',
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
    if (!isFirestoreAvailable()) {
      console.warn('[WalletStore.sendP2P] Firestore unavailable');
      return false;
    }
    try {
      let transferOk = false;
      await runDbTransaction(async () => {
        const senderWallet = await getDocById(COLLECTIONS.WALLETS, fromUserId);
        const receiverWallet = await getDocById(COLLECTIONS.WALLETS, toUserId);
        const balanceKey = currency === 'GAGA' ? 'coins' : 'usdBalance';
        const senderBalance = (senderWallet?.[balanceKey] as number) || 0;
        if (senderBalance < amount) throw new Error('Insufficient balance.');

        const tx: WalletTransaction = {
          id: `tx_${Date.now()}_send`,
          type: 'send',
          amount,
          currency: (currency === 'GAGA' ? 'coins' : currency) as 'coins' | 'BDT' | 'USD',
          description: `Sent ${formatCurrency(amount, currency)} to ${toUserName}${note ? ': ' + note : ''}`,
          timestamp: new Date().toISOString(),
          status: 'completed',
        };
        const receiverTx: WalletTransaction = {
          id: `tx_${Date.now()}_recv`,
          type: 'receive',
          amount,
          currency: (currency === 'GAGA' ? 'coins' : currency) as 'coins' | 'BDT' | 'USD',
          description: `Received ${formatCurrency(amount, currency)}${note ? ': ' + note : ''}`,
          timestamp: new Date().toISOString(),
          status: 'completed',
        };

        await updateDocById(COLLECTIONS.WALLETS, fromUserId, {
          [balanceKey]: senderBalance - amount,
          transactions: [...(senderWallet?.transactions || []), tx],
        });
        await updateDocById(COLLECTIONS.WALLETS, toUserId, {
          [balanceKey]: ((receiverWallet?.[balanceKey] as number) || 0) + amount,
          transactions: [...(receiverWallet?.transactions || []), receiverTx],
        });
        transferOk = true;
      });
      if (!transferOk) return false;
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
            currency: (currency === 'GAGA' ? 'coins' : currency) as 'coins' | 'BDT' | 'USD',
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

  // Split a bill with multiple friends
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
    if (!isFirestoreAvailable()) {
      console.warn('[WalletStore.claimDailyInterest] Firestore unavailable');
      return 0;
    }
    try {
      const wallet = await getDocById(COLLECTIONS.WALLETS, userId);
      if (!wallet) return 0;
      
      const lastClaim = wallet.lastInterestClaim ? new Date(wallet.lastInterestClaim) : null;
      const now = new Date();
      if (lastClaim && (now.getTime() - lastClaim.getTime()) < 20 * 60 * 60 * 1000) {
        return 0; // Must wait ~20 hours between claims
      }
      
      const coins = wallet.coins || 0;
      const tier = getStakingTier(coins);
      if (tier.apy === 0) return 0;
      
      // Daily interest = (balance * APY) / 365
      const dailyInterest = Math.round((coins * (tier.apy / 100) / 365) * 100) / 100;
      if (dailyInterest <= 0) return 0;
      
      const tx: WalletTransaction = {
        id: `tx_${Date.now()}_interest`,
        type: 'earn',
        amount: dailyInterest,
        currency: 'coins',
        description: `Daily staking reward (${tier.label} tier - ${tier.apy}% APY)`,
        timestamp: new Date().toISOString(),
        status: 'completed',
      };
      
      await updateDocById(COLLECTIONS.WALLETS, userId, {
        coins: coins + dailyInterest,
        transactions: [...(wallet.transactions || []), tx],
        lastInterestClaim: now.toISOString(),
        totalEarned: (wallet.totalEarned || 0) + dailyInterest,
      });
      
      set({ lastError: null });
      return dailyInterest;
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
      window.localStorage.removeItem(`gaga_wallet_pin_${userId}`);
    } catch {
      // ignore storage failures
    }
    set({ pinHash: null, pinLocked: false });
  },

  resetPin: (userId) => {
    try {
      window.localStorage.removeItem(`gaga_wallet_pin_${userId}`);
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
