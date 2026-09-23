/**
 * Central store-reset utility.
 *
 * Requirement: "never mix cached data between accounts".
 *
 * When a user signs out (or their session is revoked / account deleted), every
 * user-scoped Zustand store must be returned to its pristine initial state so
 * that a subsequent sign-in as a *different* account never sees the previous
 * account's chats, friends, groups, calls, notifications, wallet, premium
 * status or settings.
 *
 * The auth store itself is intentionally NOT reset here — the auth lifecycle
 * (`useAuthStore.init()` / `signOut()`) owns that and sets `user: null` on its
 * own. This utility only clears the *data* stores.
 *
 * All resets are best-effort and defensive: a failure in one store never
 * prevents the others from being cleared.
 */
import { useChatStore } from '@/store/useChatStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useGroupStore } from '@/store/useGroupStore';
import { useCallStore } from '@/store/useCallStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import { useWalletStore } from '@/store/useWalletStore';
import { usePremiumStore, PREMIUM_PLANS } from '@/store/usePremiumStore';
import { useUserSettings, defaultSettings } from '@/store/useSettingsStore';
import { EXCHANGE_RATES } from '@/store/useWalletStore';

/** Reset every user-scoped data store to its initial state. */
export function resetUserStores(): void {
  const safe = (fn: () => void) => {
    try {
      fn();
    } catch (err) {
      console.warn('[resetUserStores] store reset failed', err);
    }
  };

  // Chats / messages
  safe(() =>
    useChatStore.setState({
      chats: [],
      archivedChats: [],
      messages: {},
      loadingChats: true,
      hasMore: {},
      totalUnread: 0,
      pendingMessageIds: [],
      lastSendError: undefined,
    })
  );

  // Friends / requests / blocked
  safe(() =>
    useFriendStore.setState({
      friends: [],
      friendMap: new Map(),
      requests: [],
      sentRequests: [],
      blockedUsers: [],
      loading: { friends: true, sentRequests: false, blocked: false },
      loadingFriends: true,
      loadingSentRequests: false,
      loadingBlocked: false,
    })
  );

  // Groups
  safe(() =>
    useGroupStore.setState({
      groups: [],
      currentGroup: null,
      groupMessages: {},
      loading: true,
    })
  );

  // Calls
  safe(() =>
    useCallStore.setState({
      currentCall: null,
      incomingCall: null,
      connectedAt: null,
      history: [],
      loading: false,
      participants: [],
      callTimeoutId: null,
      lastCallError: undefined,
    })
  );

  // Notifications
  safe(() =>
    useNotificationStore.setState({
      notifications: [],
      unreadCount: 0,
      loading: true,
    })
  );

  // Wallet
  safe(() =>
    useWalletStore.setState({
      wallet: null,
      pinHash: null,
      pinLocked: false,
      loading: true,
      lastError: null,
      exchangeRates: [
        { from: 'GAGA', to: 'USD', rate: EXCHANGE_RATES.GAGA_USD, updatedAt: new Date().toISOString() },
      ],
    })
  );

  // Premium
  safe(() =>
    usePremiumStore.setState({
      currentTier: 'free',
      subscription: null,
      loading: false,
      error: null,
      referralCode: null,
      referralCount: 0,
      referralEarnings: 0,
      tipsSent: [],
      tipsReceived: [],
      activePlan: null,
      plans: PREMIUM_PLANS,
      isPremium: false,
    })
  );

  // Settings (persisted) — return to defaults so account B never inherits
  // account A's theme / privacy / notification preferences.
  safe(() => useUserSettings.setState({ settings: defaultSettings }));
}
