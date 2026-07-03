import { useEffect, useRef } from 'react';
import { useNotificationStore } from '@/store/useNotificationStore';
import { useAuthStore } from '@/store/useAuthStore';

/**
 * Foreground notification bridge.
 * Listens to the notification store and shows native browser notifications
 * for new unread notifications while the app is in the foreground.
 */
export function useForegroundNotifications() {
  const user = useAuthStore((s) => s.user);
  const notifications = useNotificationStore((s) => s.notifications);
  const lastCountRef = useRef(0);

  useEffect(() => {
    if (!user) return;

    const currentUnread = notifications.filter((n) => !n.read);
    const previousUnread = lastCountRef.current;
    lastCountRef.current = currentUnread.length;

    // Only show notification if unread count increased
    if (currentUnread.length <= previousUnread) return;

    // Get the newest unread notification
    const newest = currentUnread[0];
    if (!newest) return;

    // Skip if the app tab is focused (user is already looking at the app)
    if (document.visibilityState === 'visible') {
      // Optionally play a sound or show a toast here
      return;
    }

    // Show native browser notification via service worker
    if ('serviceWorker' in navigator && Notification.permission === 'granted') {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(newest.title || 'GaGa Chat', {
          body: newest.body || 'You have a new notification',
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-72x72.png',
          tag: newest.id || 'gaga-notification',
          requireInteraction: false,
          data: {
            url: newest.data?.chatId ? `/chat/${newest.data.chatId}` : '/',
            notificationId: newest.id,
            ...newest.data,
          },
          actions: [
            { action: 'open', title: 'Open' },
            { action: 'dismiss', title: 'Dismiss' },
          ],
        } as NotificationOptions);
      }).catch(() => {});
    }
  }, [notifications, user]);
}
