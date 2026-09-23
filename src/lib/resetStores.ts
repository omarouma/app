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
import { clearQueue } from '@/lib/offlineQueue';
import { safeGetAllStorageKeys, safeRemoveStorageItem } from '@/lib/safeStorage';

/**
 * localStorage keys that hold *user content* (not device preferences) and must
 * therefore be wiped on sign-out so they never leak into the next account.
 * Device-level keys (PWA prompt dismissal, service-worker version, etc.) are
 * intentionally left untouched.
 */
const USER_SCOPED_KEY_PREFIXES = [
  'draft_',                 // per-chat composer drafts
  'chat_draft_',            // legacy per-chat drafts
  'gaga-message-queue',     // offline send queue
  'gaga-muted-notif-types', // per-user muted notification types
  'gaga-recent-searches',   // recent in-app searches
  'gaga_recent_gifs',       // recently used GIFs
  'gaga_scheduled_messages',// scheduled messages
  'emoji_recent',           // recently used emojis
];

/** Remove every user-scoped localStorage entry. Best-effort. */
function clearUserScopedStorage(): void {
  try {
    for (const key of safeGetAllStorageKeys()) {
      if (USER_SCOPED_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        safeRemoveStorageItem(key);
      }
    }
  } catch {
    /* best-effort */
  }
}

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

  // Offline message queue — drop any messages queued by the previous account so
  // they can never be flushed under the next account's session.
  safe(() => clearQueue());

  // User-scoped localStorage (drafts, recents, scheduled messages, muted types).
  safe(() => clearUserScopedStorage());
}
