/* eslint-disable @typescript-eslint/no-explicit-any */
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

    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeToCollection(COLLECTIONS.NOTIFICATIONS, [
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
      ], (data) => {
        const notifications: AppNotification[] = (data || []).map((d: any) => ({
          id: d.id,
          userId: d.userId || '',
          type: d.type || 'message',
          title: sanitize(d.title),
          body: sanitize(d.body),
          read: d.read || false,
          data: d.data || {},
          timestamp: ((rawTs: any) => rawTs && typeof rawTs === 'object' && 'toDate' in rawTs ? rawTs.toDate() : rawTs ? new Date(rawTs as string | number | Date) : new Date())(d.createdAt ?? d.timestamp),
        }));
        set({
          notifications,
          unreadCount: notifications.filter((n) => !n.read).length,
          loading: false,
        });
      });
    } catch {
      set({ notifications: [], unreadCount: 0, loading: false });
    }

    return () => { if (unsub) unsub(); };
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
      const { notifications } = get();
      const unread = notifications.filter((n) => !n.read);
      if (unread.length === 0) return;
      await batchWrite(
        unread.map((n) => ({
          collection: COLLECTIONS.NOTIFICATIONS,
          docId: n.id,
          data: { read: true },
        }))
      );
      set((s) => ({
        notifications: s.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));
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
