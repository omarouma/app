/**
 * Notification tap router.
 *
 * Native notification taps (FCM push and local notifications) must open the
 * right screen — even when the app was **cold-started** by the tap, before
 * React Router has mounted. This module buffers a pending tap target until the
 * router registers its `navigate()` function, then flushes it.
 *
 * It also seeds the incoming-call state for call taps so the ring UI appears
 * immediately, even if the ZIM/Supabase signalling plane has not reconciled yet.
 *
 * No-op on web (web taps are handled by the service worker).
 */

import { navigateTo } from '@/lib/navigation';
import { useCallStore } from '@/store/useCallStore';
import type { CallRecord } from '@/types';

export interface NotificationTapData {
  type?: string;
  chatId?: string;
  callId?: string;
  callType?: string;
  callerId?: string;
  callerName?: string;
  userId?: string;
  senderName?: string;
  isGroup?: string | boolean;
  groupId?: string;
  [key: string]: unknown;
}

let routerReady = false;
let pending: NotificationTapData | null = null;

/** Called once the router's `navigate()` is registered (see App.tsx). */
export function markNotificationRouterReady(): void {
  routerReady = true;
  if (pending) {
    const data = pending;
    pending = null;
    handleNotificationTap(data);
  }
}

/** Seeds `incomingCall` from a call push so the ring UI shows on tap. */
function seedIncomingCall(data: NotificationTapData): void {
  try {
    const callId = String(data.callId || '');
    if (!callId) return;
    const store = useCallStore.getState();
    // Never clobber an active call.
    if (store.currentCall && store.currentCall.status !== 'ended') return;
    if (store.incomingCall?.id === callId) return;

    const callerId = String(data.callerId || '');
    const type: CallRecord['type'] =
      data.callType === 'video' || data.callType === 'group_video' ? 'video' : 'voice';

    const call: CallRecord = {
      id: callId,
      initiatorId: callerId,
      participantIds: [callerId].filter(Boolean),
      type,
      status: 'calling',
      timestamp: new Date(),
    };
    useCallStore.setState({ incomingCall: call });
  } catch {
    /* best-effort */
  }
}

/**
 * Routes a notification tap to the correct in-app destination.
 * Safe to call before the router is ready — the target is queued.
 */
export function handleNotificationTap(data: NotificationTapData | null | undefined): void {
  if (!data) return;
  if (!routerReady) {
    pending = data;
    return;
  }

  const type = String(data.type || '');
  switch (type) {
    case 'call': {
      seedIncomingCall(data);
      navigateTo('/calls');
      break;
    }
    case 'message': {
      const isGroup = data.isGroup === true || data.isGroup === 'true' || !!data.groupId;
      if (isGroup) {
        const groupId = String(data.groupId || data.chatId || '');
        if (groupId) navigateTo(`/group/${groupId}`);
        else navigateTo('/chats');
      } else {
        // Direct chats are addressed by the other participant's user id.
        const otherId = String(data.userId || data.chatId || '');
        if (otherId) navigateTo(`/chat/${otherId}`);
        else navigateTo('/chats');
      }
      break;
    }
    case 'friend_request':
      navigateTo('/contacts');
      break;
    case 'wallet':
      navigateTo('/wallet');
      break;
    default:
      navigateTo('/notifications');
  }
}
