import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import {
  COLLECTIONS,
  getDocById,
  setDocById,
  updateDocById,
  addDocToCollection,
  queryCollection,
  subscribeToDoc,
  serverTimestamp,
  increment,
} from '@/lib/firestore';
import { where, orderBy, limit } from '@/lib/firestore';
import type { PremiumPlan, PremiumSubscription, ReferralRecord, TipRecord } from '@/types';
import { toast } from 'sonner';

export type PremiumTier = 'free' | 'premium' | 'vip' | 'creator';

/**
 * Premium collection names — sourced from the backend adapter's COLLECTIONS map
 * so the correct table name is used for whichever backend is active
 * (Supabase uses snake_case `creator_subscriptions`; Firestore uses `creatorSubscriptions`).
 */
export const PREMIUM_COLLECTIONS = {
  SUBSCRIPTIONS: COLLECTIONS.SUBSCRIPTIONS,
  REFERRALS: COLLECTIONS.REFERRALS,
  TIPS: COLLECTIONS.TIPS,
  CREATOR_SUBS: COLLECTIONS.CREATOR_SUBSCRIPTIONS,
} as const;

export const PREMIUM_PLANS: PremiumPlan[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'Start chatting with the basics',
    price: 0,
    currency: 'USD',
    duration: 'monthly',
    features: [
      'Unlimited messaging',
      'Voice & video calls',
      'Basic stories & posts',
      '5 scheduled posts/month',
      'Standard support',
    ],
    badge: 'Free',
    color: '#8D8D8D',
  },
  {
    id: 'premium',
    name: 'Premium',
    description: 'Unlock the full experience',
    price: 1.99,
    currency: 'USD',
    duration: 'monthly',
    features: [
      'Everything in Free',
      'Verified badge',
      'Ad-free experience',
      '20 scheduled posts/month',
      'Priority support',
      'Custom themes',
      'Premium stickers',
      'Read receipt control',
    ],
    badge: 'Premium',
    color: '#00C300',
    popular: true,
  },
  {
    id: 'vip',
    name: 'VIP',
    description: 'For power users who want it all',
    price: 4.99,
    currency: 'USD',
    duration: 'monthly',
    features: [
      'Everything in Premium',
      'Unlimited scheduled posts',
      'Post analytics dashboard',
      'Ghost mode (hide views)',
      'Exclusive VIP badge',
      'Faster media uploads',
      'Group admin tools',
      'Early access to features',
    ],
    badge: 'VIP',
    color: '#7B61FF',
  },
  {
    id: 'creator',
    name: 'Creator',
    description: 'Monetize your content & grow',
    price: 9.99,
    currency: 'USD',
    duration: 'monthly',
    features: [
      'Everything in VIP',
      'Creator analytics dashboard',
      'Fan subscriptions enabled',
      'Tip / donation support',
      'Sponsored content tools',
      'Revenue sharing on ads',
      'Priority verification',
      'Dedicated account manager',
      'API access for bots',
    ],
    badge: 'Creator',
    color: '#FF9500',
  },
];

export const PLAN_PRICING_USD: Record<string, number> = {
  free: 0,
  premium: 1.99,
  vip: 4.99,
  creator: 9.99,
};

export const PLAN_PRICING_COINS: Record<string, number> = {
  free: 0,
  premium: 2500,
  vip: 6500,
  creator: 14000,
};

export const TIP_PRESETS = [10, 25, 50, 100, 250, 500];

export const REFERRAL_REWARD_COINS = 100;

export const REFERRAL_REWARD_PREMIUM_DAYS = 7;

interface PremiumStoreState {
  currentTier: PremiumTier;
  subscription: PremiumSubscription | null;
  loading: boolean;
  error: string | null;
  referralCode: string | null;
  referralCount: number;
  referralEarnings: number;
  tipsSent: TipRecord[];
  tipsReceived: TipRecord[];
  creatorSubscribers: number;
  creatorRevenue: number;
  activePlan: string | null;
  plans: PremiumPlan[];
  isPremium: boolean;
}

interface PremiumStoreActions {
  subscribeToPremium: (userId: string) => () => void;
  fetchPlans: () => Promise<void>;
  upgradePlan: (userId: string, planId: string, currency: 'BDT' | 'USD' | 'coins') => Promise<boolean>;
  cancelSubscription: (userId: string) => Promise<boolean>;
  generateReferralCode: (userId: string) => string;
  applyReferralCode: (userId: string, code: string, referredByName?: string) => Promise<boolean>;
  getReferralStats: (userId: string) => Promise<{ count: number; earnings: number }>;
  sendTip: (fromUserId: string, fromUserName: string, toUserId: string, toUserName: string, amount: number, currency: 'coins' | 'BDT' | 'USD', message?: string, contentId?: string, contentType?: 'post' | 'reel' | 'live' | 'story') => Promise<boolean>;
  fetchTips: (userId: string) => Promise<void>;
  getTierColor: (tier: PremiumTier) => string;
  getTierFeatures: (tier: PremiumTier) => string[];
  hasFeature: (tier: PremiumTier, feature: string) => boolean;
  isSubscribed: () => boolean;
  getExpiryDate: () => Date | null;
  getDaysRemaining: () => number;
}

export const usePremiumStore = create<PremiumStoreState & PremiumStoreActions>((set, get) => ({
  currentTier: 'free',
  subscription: null,
  loading: false,
  error: null,
  referralCode: null,
  referralCount: 0,
  referralEarnings: 0,
  tipsSent: [],
  tipsReceived: [],
  creatorSubscribers: 0,
  creatorRevenue: 0,
  activePlan: null,
  plans: PREMIUM_PLANS,
  isPremium: false,

  subscribeToPremium: (userId: string) => {
    if (!userId) {
      set({ subscription: null, currentTier: 'free', isPremium: false, loading: false });
      return () => { };
    }

    set({ loading: true });

    // Fetch user subscription status from users collection
    const fetchSub = async () => {
      try {
        const userDoc = await getDocById(COLLECTIONS.USERS, userId);
        if (userDoc) {
          const tier = (userDoc.premiumTier as PremiumTier) || 'free';
          const expiresAt = userDoc.premiumExpiresAt ? new Date(userDoc.premiumExpiresAt) : null;
          const now = new Date();
          const isActive = expiresAt ? expiresAt > now : tier === 'free';
          const effectiveTier = isActive ? tier : 'free';

          const subscription: PremiumSubscription | null = tier !== 'free' && userDoc.premiumStartedAt
            ? {
              id: `sub_${userId}`,
              userId,
              planId: tier,
              status: isActive ? 'active' : 'expired',
              startedAt: new Date(userDoc.premiumStartedAt),
              expiresAt: expiresAt || now,
              autoRenew: userDoc.autoRenew ?? false,
              price: userDoc.premiumPrice || 0,
              currency: userDoc.premiumCurrency || 'BDT',
              plan: PREMIUM_PLANS.find(p => p.id === tier),
            }
            : null;

          set({
            currentTier: effectiveTier,
            subscription,
            referralCode: userDoc.referralCode || null,
            referralCount: userDoc.referralCount || 0,
            activePlan: effectiveTier !== 'free' ? tier : null,
            isPremium: effectiveTier !== 'free',
            loading: false,
          });
        } else {
          set({ currentTier: 'free', subscription: null, isPremium: false, loading: false });
        }
      } catch (error) {
        console.error('fetchSub error:', error);
        set({ loading: false, error: 'Failed to load subscription' });
      }
    };

    fetchSub();

    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeToDoc(COLLECTIONS.USERS, userId, (data) => {
        if (!data) return;
        const tier = (data.premiumTier as PremiumTier) || 'free';
        const expiresAt = data.premiumExpiresAt ? new Date(data.premiumExpiresAt) : null;
        const now = new Date();
        const isActive = expiresAt ? expiresAt > now : tier === 'free';
        const effectiveTier = isActive ? tier : 'free';

        const subscription: PremiumSubscription | null = tier !== 'free' && data.premiumStartedAt
          ? {
            id: `sub_${userId}`,
            userId,
            planId: tier,
            status: isActive ? 'active' : 'expired',
            startedAt: new Date(data.premiumStartedAt),
            expiresAt: expiresAt || now,
            autoRenew: data.autoRenew ?? false,
            price: data.premiumPrice || 0,
            currency: data.premiumCurrency || 'BDT',
            plan: PREMIUM_PLANS.find(p => p.id === tier),
          }
          : null;

        set({
          currentTier: effectiveTier,
          subscription,
          referralCode: data.referralCode || null,
          referralCount: data.referralCount || 0,
          activePlan: effectiveTier !== 'free' ? tier : null,
        });
      });
    } catch {
      // ignore
    }

    return () => { if (unsub) unsub(); };
  },

  fetchPlans: async () => {
    set({ plans: PREMIUM_PLANS });
  },

  upgradePlan: async (userId, planId, currency) => {
    try {
      set({ loading: true, error: null });
      const plan = PREMIUM_PLANS.find(p => p.id === planId);
      if (!plan) {
        set({ loading: false, error: 'Plan not found' });
        return false;
      }

      const price = currency === 'USD' ? PLAN_PRICING_USD[planId] : currency === 'coins' ? PLAN_PRICING_COINS[planId] : plan.price;
      const now = new Date();
      const durationDays = plan.duration === 'monthly' ? 30 : plan.duration === 'quarterly' ? 90 : plan.duration === 'yearly' ? 365 : 36500;
      const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

      // Update user document with premium info
      await updateDocById(COLLECTIONS.USERS, userId, {
        premiumTier: planId,
        premiumStartedAt: now.toISOString(),
        premiumExpiresAt: expiresAt.toISOString(),
        premiumPrice: price,
        premiumCurrency: currency,
        autoRenew: true,
        isPremium: true,
        updatedAt: serverTimestamp(),
      });

      // Record subscription in subscriptions collection
      try {
        await setDocById(PREMIUM_COLLECTIONS.SUBSCRIPTIONS, `sub_${userId}_${uuidv4()}`, {
          userId,
          planId,
          status: 'active',
          startedAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          autoRenew: true,
          price,
          currency,
          createdAt: serverTimestamp(),
        });
      } catch {
        // non-critical
      }

      set({
        currentTier: planId as PremiumTier,
        activePlan: planId,
        subscription: {
          id: `sub_${userId}`,
          userId,
          planId,
          status: 'active',
          startedAt: now,
          expiresAt,
          autoRenew: true,
          price,
          currency,
          plan,
        },
        loading: false,
      });

      toast.success(`Upgraded to ${plan.name}!`);
      return true;
    } catch (error) {
      console.error('upgradePlan error:', error);
      set({ loading: false, error: 'Upgrade failed' });
      toast.error('Upgrade failed. Please try again.');
      return false;
    }
  },

  cancelSubscription: async (userId) => {
    try {
      set({ loading: true });
      await updateDocById(COLLECTIONS.USERS, userId, {
        premiumTier: 'free',
        autoRenew: false,
        isPremium: false,
        updatedAt: serverTimestamp(),
      });

      set({
        currentTier: 'free',
        activePlan: null,
        subscription: null,
        loading: false,
      });

      toast.success('Subscription cancelled');
      return true;
    } catch (error) {
      console.error('cancelSubscription error:', error);
      set({ loading: false, error: 'Cancellation failed' });
      toast.error('Cancellation failed');
      return false;
    }
  },

  generateReferralCode: (userId) => {
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    const code = `GAGA-${userId.slice(0, 6).toUpperCase()}-${randomPart}`;
    // Best-effort save to user doc
    try {
      updateDocById(COLLECTIONS.USERS, userId, { referralCode: code }).catch(() => { });
    } catch {
      // ignore
    }
    set({ referralCode: code });
    return code;
  },

  applyReferralCode: async (userId, code, _referredByName) => {
    try {
      if (!code || !code.startsWith('GAGA-')) {
        toast.error('Invalid referral code');
        return false;
      }
      // Extract referrer ID from code (GAGA-XXXXX...)
      const referrerIdPrefix = code.replace('GAGA-', '').toLowerCase();

      // Find referrer by matching referral code prefix against user IDs
      const users = await queryCollection(COLLECTIONS.USERS, []);
      const referrer = users.find((u: any) => u.id?.toLowerCase().startsWith(referrerIdPrefix));

      if (!referrer) {
        toast.error('Referrer not found');
        return false;
      }
      if (referrer.id === userId) {
        toast.error('Cannot refer yourself');
        return false;
      }

      // Record referral
      const referralRecord: Omit<ReferralRecord, 'id'> = {
        referrerId: referrer.id,
        referredId: userId,
        status: 'rewarded',
        rewardAmount: REFERRAL_REWARD_COINS,
        currency: 'coins',
        timestamp: new Date(),
      };

      await addDocToCollection(PREMIUM_COLLECTIONS.REFERRALS, {
        ...referralRecord,
        createdAt: serverTimestamp(),
      });

      // NOTE: Referral rewards are now awarded server-side via admin_award_coins.
      // This requires server-side verification that the referral is legitimate.
      // For now, referral rewards are disabled pending backend implementation.
      console.info('[usePremiumStore.redeemReferral] Referral rewards require server-side verification');

      // Update referrer count
      await updateDocById(COLLECTIONS.USERS, referrer.id, {
        referralCount: increment(1),
        updatedAt: serverTimestamp(),
      });

      // Update referred user
      await updateDocById(COLLECTIONS.USERS, userId, {
        referredBy: referrer.id,
        updatedAt: serverTimestamp(),
      });

      toast.success(`Referral applied! ${referrer.name || 'Your friend'} earned ${REFERRAL_REWARD_COINS} coins.`);
      return true;
    } catch (error) {
      console.error('applyReferralCode error:', error);
      toast.error('Failed to apply referral code');
      return false;
    }
  },

  getReferralStats: async (userId) => {
    try {
      const userDoc = await getDocById(COLLECTIONS.USERS, userId);
      const count = userDoc?.referralCount || 0;
      const earnings = count * REFERRAL_REWARD_COINS;
      set({ referralCount: count, referralEarnings: earnings });
      return { count, earnings };
    } catch {
      return { count: 0, earnings: 0 };
    }
  },

  sendTip: async (fromUserId, fromUserName, toUserId, toUserName, amount, currency, message = '', contentId, contentType) => {
    try {
      const { wallet, sendP2P } = (await import('@/store/useWalletStore')).useWalletStore.getState();

      // Check balance
      if (currency === 'coins' && (wallet?.coins || 0) < amount) {
        toast.error('Insufficient coins');
        return false;
      }

      // Execute P2P transfer
      const success = await sendP2P(fromUserId, toUserId, toUserName, amount, currency, message || 'Tip');
      if (!success) {
        toast.error('Tip failed');
        return false;
      }

      // Record tip
      const tipRecord: Omit<TipRecord, 'id'> = {
        fromUserId,
        toUserId,
        amount,
        currency,
        message,
        contentId,
        contentType,
        timestamp: new Date(),
        fromUserName,
        toUserName,
      };

      await addDocToCollection(PREMIUM_COLLECTIONS.TIPS, {
        ...tipRecord,
        createdAt: serverTimestamp(),
      });

      // Notify recipient
      try {
        await addDocToCollection(COLLECTIONS.NOTIFICATIONS, {
          userId: toUserId,
          type: 'tip',
          title: 'You received a tip!',
          body: `${fromUserName} sent you ${amount} ${currency}${message ? ': ' + message : ''}`,
          fromId: fromUserId,
          data: { userId: fromUserId, amount, currency },
          timestamp: serverTimestamp(),
          read: false,
        });
      } catch {
        // ignore notification errors
      }

      toast.success(`Sent ${amount} ${currency} to ${toUserName}!`);
      return true;
    } catch (error) {
      console.error('sendTip error:', error);
      toast.error('Failed to send tip');
      return false;
    }
  },

  fetchTips: async (userId) => {
    try {
      const [sent, received] = await Promise.all([
        queryCollection(PREMIUM_COLLECTIONS.TIPS, [
          where('fromUserId', '==', userId),
          orderBy('timestamp', 'desc'),
          limit(100),
        ]),
        queryCollection(PREMIUM_COLLECTIONS.TIPS, [
          where('toUserId', '==', userId),
          orderBy('timestamp', 'desc'),
          limit(100),
        ]),
      ]);

      set({ tipsSent: sent || [], tipsReceived: received || [] });
    } catch (error) {
      console.error('fetchTips error:', error);
    }
  },

  getTierColor: (tier) => {
    const plan = PREMIUM_PLANS.find(p => p.id === tier);
    return plan?.color || '#8D8D8D';
  },

  getTierFeatures: (tier) => {
    const plan = PREMIUM_PLANS.find(p => p.id === tier);
    return plan?.features || [];
  },

  hasFeature: (tier, feature) => {
    const plan = PREMIUM_PLANS.find(p => p.id === tier);
    if (!plan) return false;
    const f = feature.toLowerCase();
    return plan.features.some(feat => feat.toLowerCase().includes(f));
  },

  isSubscribed: () => {
    const { subscription } = get();
    if (!subscription) return false;
    return subscription.status === 'active' && new Date(subscription.expiresAt) > new Date();
  },

  getExpiryDate: () => {
    const { subscription } = get();
    return subscription?.expiresAt || null;
  },

  getDaysRemaining: () => {
    const { subscription } = get();
    if (!subscription?.expiresAt) return 0;
    const diff = new Date(subscription.expiresAt).getTime() - new Date().getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  },
}));
