import { useEffect, useRef } from 'react';
import { useNotificationStore } from '@/store/useNotificationStore';
import { useAuthStore } from '@/store/useAuthStore';
import { safePlay, vibrateNotification, playNotification } from '@/lib/sounds';
import { getActiveChatId } from '@/lib/activeChat';
import { safeGetJsonStorageItem } from '@/lib/safeStorage';


/**
 * Foreground notification bridge.
 * Listens to the notification store and shows native browser notifications
 * for new unread notifications while the app is in the foreground.
 * Sound is suppressed when the user is already viewing the relevant chat.
 */
export function useForegroundNotifications() {
  const user = useAuthStore((s) => s.user);
  const notifications = useNotificationStore((s) => s.notifications);
  const seenIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!user) return;

    const unreadNotifs = notifications.filter((n) => !n.read);
    const newNotifs = unreadNotifs.filter((n) => !seenIdsRef.current.has(n.id));

    // Mark all current unread as seen
    unreadNotifs.forEach((n) => seenIdsRef.current.add(n.id));

    if (newNotifs.length === 0) return;

    const newest = newNotifs[0];
    const activeChatId = getActiveChatId();
    const isInActiveChat =
      activeChatId !== null &&
      newest.data?.chatId !== undefined &&
      activeChatId === newest.data.chatId;

    if (document.visibilityState === 'visible') {
      // Mute-by-type (same key as NotificationsPage)
      const mutedTypes = safeGetJsonStorageItem<string[]>('gaga-muted-notif-types', []);

      const isMutedType = mutedTypes.includes(String(newest.type));

      // Suppress sound if tab is currently the notifications list page
      const isOnNotificationsPage = window.location.pathname.includes('/notifications');

      // Suppress sound if user is already reading this chat, or type is muted, or on notifications page
      if (!isOnNotificationsPage && !isMutedType && !isInActiveChat) {
        safePlay(playNotification, vibrateNotification);
      }
      return;
    }

    // Background: show native browser notification via service worker
    if ('serviceWorker' in navigator && Notification.permission === 'granted') {
      // Sanitize display strings — strip HTML tags and limit length
      const safeTitle = String(newest.title || 'GaGa Chat').replace(/<[^>]*>/g, '').slice(0, 100);
      const safeBody = String(newest.body || 'You have a new notification').replace(/<[^>]*>/g, '').slice(0, 200);
      const safeChatId = String(newest.data?.chatId || '').replace(/[^a-zA-Z0-9_-]/g, '');
      navigator.serviceWorker.ready
        .then((registration) => {
          registration.showNotification(safeTitle, {
            body: safeBody,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-72x72.png',
            tag: newest.id || 'gaga-notification',
            requireInteraction: false,
            data: {
              url: safeChatId ? `/chat/${safeChatId}` : '/',
              notificationId: newest.id,
            },
            actions: [
              { action: 'open', title: 'Open' },
              { action: 'dismiss', title: 'Dismiss' },
            ],
          } as NotificationOptions);
        })
        .catch(() => {});
    }

  }, [notifications, user]);
}
