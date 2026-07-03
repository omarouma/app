const SW_PATH = '/sw.js';

export interface PushNotificationData {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
  data?: Record<string, any>;
}

class PushNotificationService {
  private swRegistration: ServiceWorkerRegistration | null = null;
  private permission: NotificationPermission = 'default';

  async init(): Promise<boolean> {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) {
      console.warn('[Push] Service workers or notifications not supported');
      return false;
    }

    try {
      this.swRegistration = await navigator.serviceWorker.register(SW_PATH, { scope: '/' });
      console.log('[Push] Service worker registered');
      this.permission = Notification.permission;
      return true;
    } catch (err) {
      console.error('[Push] Service worker registration failed:', err);
      return false;
    }
  }

  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') {
      this.permission = 'granted';
      return true;
    }
    if (Notification.permission === 'denied') {
      this.permission = 'denied';
      return false;
    }
    const result = await Notification.requestPermission();
    this.permission = result;
    return result === 'granted';
  }

  isSupported(): boolean {
    return 'serviceWorker' in navigator && 'Notification' in window && 'PushManager' in window;
  }

  canSend(): boolean {
    return this.permission === 'granted' && this.swRegistration !== null;
  }

  async sendNotification(data: PushNotificationData): Promise<void> {
    if (!this.canSend()) return;
    await this.swRegistration!.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/logo-192.png',
      badge: data.badge || '/logo-192.png',
      tag: data.tag || 'default',
      requireInteraction: data.requireInteraction ?? false,
      data: data.data || {},
      vibrate: [200, 100, 200],
      // @ts-ignore - vibrate is valid but not in standard TS NotificationOptions
    } as any);
  }

  // Subscribe to push notifications (for server-sent push)
  async subscribeToPush(): Promise<PushSubscription | null> {
    if (!this.swRegistration || !('PushManager' in window)) return null;
    try {
      const subscription = await this.swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(
          import.meta.env.VITE_VAPID_PUBLIC_KEY || ''
        ) as unknown as BufferSource,
      });
      console.log('[Push] Push subscription created');
      return subscription;
    } catch (err) {
      console.error('[Push] Push subscription failed:', err);
      return null;
    }
  }

  async unsubscribeFromPush(): Promise<boolean> {
    if (!this.swRegistration) return false;
    const subscription = await this.swRegistration.pushManager.getSubscription();
    if (!subscription) return true;
    await subscription.unsubscribe();
    return true;
  }

  // Helper to send notification from a message event
  async showMessageNotification(
    senderName: string,
    message: string,
    chatId: string,
    senderId: string
  ): Promise<void> {
    await this.sendNotification({
      title: senderName,
      body: message.length > 100 ? message.slice(0, 100) + '...' : message,
      tag: `msg_${chatId}`,
      data: { type: 'message', chatId, userId: senderId, senderName },
    });
  }

  async showCallNotification(
    callerName: string,
    callType: 'voice' | 'video',
    callId: string
  ): Promise<void> {
    await this.sendNotification({
      title: `Incoming ${callType} call`,
      body: `${callerName} is calling you`,
      tag: `call_${callId}`,
      requireInteraction: true,
      data: { type: 'call', callId, callType },
    });
  }

  async showFriendRequestNotification(senderName: string, senderId: string): Promise<void> {
    await this.sendNotification({
      title: 'New Friend Request',
      body: `${senderName} wants to be your friend`,
      tag: `friend_${senderId}`,
      data: { type: 'friend_request', userId: senderId },
    });
  }

  async showPostLikeNotification(likerName: string, postId: string): Promise<void> {
    await this.sendNotification({
      title: 'New Like',
      body: `${likerName} liked your post`,
      tag: `like_${postId}`,
      data: { type: 'timeline', postId },
    });
  }

  async showCommentNotification(commenterName: string, postId: string, comment: string): Promise<void> {
    await this.sendNotification({
      title: 'New Comment',
      body: `${commenterName}: ${comment.slice(0, 80)}${comment.length > 80 ? '...' : ''}`,
      tag: `comment_${postId}`,
      data: { type: 'timeline', postId },
    });
  }

  async showTipNotification(senderName: string, amount: number, currency: string): Promise<void> {
    await this.sendNotification({
      title: 'You received a tip!',
      body: `${senderName} sent you ${amount} ${currency}`,
      tag: 'tip',
      data: { type: 'wallet' },
    });
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}

export const pushNotificationService = new PushNotificationService();

export default PushNotificationService;
