export interface PromoCode {
  coins: number;
  label: string;
  description?: string;
  expiresAt?: string;
  maxUses?: number;
}

export const PROMO_CODES: Record<string, PromoCode> = {
  GAGA100: { coins: 100, label: 'Welcome Bonus', description: 'New user welcome reward' },
  REFER20: { coins: 20, label: 'Referral Reward', description: 'Refer a friend bonus' },
  BONUS50: { coins: 50, label: 'Extra Bonus', description: 'Limited-time extra bonus' },
  GAGA500: { coins: 500, label: 'Mega Bonus', description: 'Premium mega reward' },
};

export const DEPOSIT_METHODS = [
  { id: 'visa', label: 'Visa / Mastercard', icon: 'card', min: 10, max: 10000 },
  { id: 'bkash', label: 'bKash', icon: 'phone', min: 100, max: 50000, currency: 'BDT' },
  { id: 'nagad', label: 'Nagad', icon: 'phone', min: 100, max: 50000, currency: 'BDT' },
  { id: 'upi', label: 'UPI', icon: 'smartphone', min: 100, max: 100000, currency: 'INR' },
  { id: 'wechat', label: 'WeChat Pay', icon: 'message-circle', min: 10, max: 50000, currency: 'RMB' },
  { id: 'alipay', label: 'Alipay', icon: 'zap', min: 10, max: 50000, currency: 'RMB' },
] as const;

export type DepositMethodId = (typeof DEPOSIT_METHODS)[number]['id'];

export const WALLET_PIN_LENGTH = 6;

export const DEFAULT_WALLET: Readonly<{ coins: 0; usdBalance: 0; bdtBalance: 0; transactions: [] }> = {
  coins: 0,
  usdBalance: 0,
  bdtBalance: 0,
  transactions: [],
};
