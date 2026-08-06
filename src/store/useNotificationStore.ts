import { create } from 'zustand';
import {
  COLLECTIONS,
  updateDocById,
  deleteDocById,
  subscribeToCollection,
  batchWrite,
  batchDelete,
} from '@/lib/firestore';
import type { AppNotification } from '@/types';
import { where, orderBy } from '@/lib/firestore';
import { withAutoReconnect } from '@/lib/reconnectStrategy';


type FirestoreTimestamp = { toDate: () => Date };
function isFirestoreTs(val: unknown): val is FirestoreTimestamp {
  return typeof val === 'object' && val !== null && 'toDate' in val;
}
type AppNotificationType = AppNotification['type'];
const validNotificationTypes: Set<string> = new Set([
  'message', 'call', 'reaction', 'mention', 'group_invite', 
  'friend_request', 'money_received', 'group_call', 'post_like', 
  'comment', 'friend_removed', 'blocked_interaction', 'story_view', 
  'live_start', 'follow', 'repost', 'tip', 'premium_expiry', 
  'achievement', 'streak', 'nearby_post', 'trending', 'tagged'
]);

interface NotificationStore {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  subscribe: (userId: string) => () => void;
  markRead: (notifId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteNotification: (notifId: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

const sanitize = (val: unknown): string =>
  String(val ?? '').replace(/[<>'"&]/g, (c) => ({ '<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;' }[c] ?? c));

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: true,

  subscribe: (userId: string) => {
    if (!userId) {
      set({ notifications: [], unreadCount: 0, loading: false });
return () => {};
    }

    set({ loading: true });

    const subscribeFn = (uid: string) =>
      subscribeToCollection(COLLECTIONS.NOTIFICATIONS, [
        where('userId', '==', uid),
        orderBy('timestamp', 'desc'),
      ], (data) => {
        const notifications: AppNotification[] = (data || []).map((d: Record<string, unknown>) => {
          const rawTs = d.createdAt ?? d.timestamp;
          let timestamp: Date;
          if (isFirestoreTs(rawTs)) {
            timestamp = rawTs.toDate();
          } else if (rawTs) {
            timestamp = new Date(rawTs as string | number | Date);
          } else {
            timestamp = new Date();
          }
          const rawType = d.type as string;
          const type: AppNotificationType = validNotificationTypes.has(rawType) 
            ? (rawType as AppNotificationType) 
            : 'message';
          const rawData = (d.data as Record<string, unknown>) || {};
          const safeData: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(rawData)) {
            safeData[sanitize(k)] = typeof v === 'string' ? sanitize(v) : v;
          }
          return {
            id: d.id as string,
            userId: (d.userId as string) || '',
            type,
            title: sanitize(d.title),
            body: sanitize(d.body),
            read: (d.read as boolean) || false,
            data: safeData,
            timestamp,
          };
        });
        const unreadCount = notifications.filter((n) => !n.read).length;

        set({
          notifications,
          unreadCount,
          loading: false,
        });
      });

    // Wrap with auto-reconnect so the notification stream stays live even after
    // transient network drops or realtime channel disconnects.
    const withReconnect = withAutoReconnect(subscribeFn, { maxRetries: 12 });
    const handle = withReconnect(userId);

    return () => { handle.unsubscribe(); };
  },

  markRead: async (notifId: string) => {
    try {
      await updateDocById(COLLECTIONS.NOTIFICATIONS, notifId, { read: true });
    } catch {
      return;
    }
  },

  markAllRead: async () => {
    try {
      const unread = get().notifications.filter((n) => !n.read);
      if (unread.length === 0) return;
      // Optimistic update first
      set((s) => ({
        notifications: s.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));
      await batchWrite(
        unread.map((n) => ({
          collection: COLLECTIONS.NOTIFICATIONS,
          docId: n.id,
          data: { read: true },
        }))
      );
    } catch {
      return;
    }
  },

  deleteNotification: async (notifId: string) => {
    try {
      await deleteDocById(COLLECTIONS.NOTIFICATIONS, notifId);
    } catch {
      return;
    }
  },

  clearAll: async () => {
    try {
      const { notifications } = get();
      if (notifications.length === 0) return;
      await batchDelete(
        notifications.map((n) => ({
          collection: COLLECTIONS.NOTIFICATIONS,
          docId: n.id,
        }))
      );
      set({ notifications: [], unreadCount: 0 });
    } catch {
      return;
    }
  },
}));
