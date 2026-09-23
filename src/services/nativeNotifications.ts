/**
 * Native local-notification service (Android/iOS via Capacitor).
 *
 * The web build shows notifications through a Service Worker
 * (`pushNotificationService`). That API does **not** exist inside the Capacitor
 * WebView, so on native we display notifications through the
 * `@capacitor/local-notifications` plugin instead. This is what makes message
 * and incoming-call alerts actually appear — and respond to taps — while the
 * app is backgrounded or the screen is off.
 *
 * Everything here is a no-op on web.
 */

import { isNative } from '@/lib/platform';
import { handleNotificationTap, type NotificationTapData } from '@/lib/notificationRouter';

export const CHANNEL_MESSAGES = 'gaga_messages';
export const CHANNEL_CALLS = 'gaga_calls';

const SMALL_ICON = 'ic_stat_gaga';
const BRAND_COLOR = '#00C300';

let permissionGranted = false;
let listenersAttached = false;
let nextId = 1000;

type LocalNotificationsModule = typeof import('@capacitor/local-notifications');

async function loadPlugin(): Promise<LocalNotificationsModule | null> {
  if (!isNative()) return null;
  try {
    return await import('@capacitor/local-notifications');
  } catch {
    return null;
  }
}

/** Whether the native notification layer is available on this platform. */
export function isNativeNotificationsSupported(): boolean {
  return isNative();
}

/** Whether we may post a native notification right now. */
export function canShowNativeNotification(): boolean {
  return isNative() && permissionGranted;
}

/**
 * Initialises the native notification layer: requests permission, creates the
 * Android notification channels, and attaches the tap listener.
 *
 * @param requestPermission When true, prompts the OS permission dialog.
 * @returns whether notifications are permitted.
 */
export async function initNativeNotifications(requestPermission = true): Promise<boolean> {
  if (!isNative()) return false;
  const mod = await loadPlugin();
  if (!mod) return false;
  const { LocalNotifications } = mod;

  // ── Permission ──────────────────────────────────────────────────────────
  try {
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted' && requestPermission) {
      perm = await LocalNotifications.requestPermissions();
    }
    permissionGranted = perm.display === 'granted';
  } catch {
    permissionGranted = false;
  }

  // ── Channels (Android 8+) ───────────────────────────────────────────────
  // Importance 5 = HIGH → heads-up banner + sound. Calls use the max so the
  // ring is as prominent as a phone call; messages use 4 (HIGH) so they still
  // pop as a heads-up but are less intrusive.
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_MESSAGES,
      name: 'Messages',
      description: 'New message alerts',
      importance: 4,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: BRAND_COLOR,
    });
    await LocalNotifications.createChannel({
      id: CHANNEL_CALLS,
      name: 'Calls',
      description: 'Incoming call alerts',
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: BRAND_COLOR,
    });
  } catch {
    /* channels are Android-only — ignore on iOS */
  }

  // ── Tap listener ────────────────────────────────────────────────────────
  if (!listenersAttached) {
    listenersAttached = true;
    try {
      await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        const data = action?.notification?.extra as NotificationTapData | undefined;
        handleNotificationTap(data);
      });
    } catch {
      /* ignore */
    }
  }

  return permissionGranted;
}

/** Shows a native notification for a new message. */
export async function showNativeMessageNotification(opts: {
  title: string;
  body: string;
  chatId: string;
  senderId?: string;
  senderName?: string;
  isGroup?: boolean;
}): Promise<void> {
  if (!canShowNativeNotification()) return;
  const mod = await loadPlugin();
  if (!mod) return;
  const { LocalNotifications } = mod;
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: nextId++,
          title: opts.title,
          body: opts.body,
          channelId: CHANNEL_MESSAGES,
          smallIcon: SMALL_ICON,
          iconColor: BRAND_COLOR,
          group: 'gaga_messages',
          autoCancel: true,
          extra: {
            type: 'message',
            chatId: opts.chatId,
            userId: opts.senderId,
            senderName: opts.senderName,
            isGroup: opts.isGroup ? 'true' : 'false',
          } satisfies NotificationTapData,
        },
      ],
    });
  } catch {
    /* best-effort */
  }
}

/** Shows a native notification for an incoming call (high priority, ongoing). */
export async function showNativeCallNotification(opts: {
  callerName: string;
  callType: 'voice' | 'video';
  callId: string;
  callerId?: string;
}): Promise<void> {
  if (!canShowNativeNotification()) return;
  const mod = await loadPlugin();
  if (!mod) return;
  const { LocalNotifications } = mod;
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: nextId++,
          title: `Incoming ${opts.callType} call`,
          body: `${opts.callerName} is calling you`,
          channelId: CHANNEL_CALLS,
          smallIcon: SMALL_ICON,
          iconColor: BRAND_COLOR,
          ongoing: true,
          autoCancel: false,
          extra: {
            type: 'call',
            callId: opts.callId,
            callType: opts.callType,
            callerId: opts.callerId,
            callerName: opts.callerName,
          } satisfies NotificationTapData,
        },
      ],
    });
  } catch {
    /* best-effort */
  }
}

/** Shows a generic native notification (e.g. missed call). */
export async function showNativeNotification(opts: {
  title: string;
  body: string;
  channelId?: string;
  data?: NotificationTapData;
}): Promise<void> {
  if (!canShowNativeNotification()) return;
  const mod = await loadPlugin();
  if (!mod) return;
  const { LocalNotifications } = mod;
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: nextId++,
          title: opts.title,
          body: opts.body,
          channelId: opts.channelId || CHANNEL_MESSAGES,
          smallIcon: SMALL_ICON,
          iconColor: BRAND_COLOR,
          autoCancel: true,
          extra: opts.data ?? {},
        },
      ],
    });
  } catch {
    /* best-effort */
  }
}

/** Cancels every pending/delivered native notification. */
export async function cancelAllNativeNotifications(): Promise<void> {
  if (!isNative()) return;
  const mod = await loadPlugin();
  if (!mod) return;
  const { LocalNotifications } = mod;
  try {
    const [pending, delivered] = await Promise.all([
      LocalNotifications.getPending(),
      LocalNotifications.getDeliveredNotifications(),
    ]);
    const ids = new Set<number>();
    for (const n of pending?.notifications ?? []) ids.add(n.id);
    for (const n of delivered?.notifications ?? []) ids.add(n.id);
    if (ids.size > 0) {
      await LocalNotifications.cancel({
        notifications: Array.from(ids).map((id) => ({ id })),
      });
    }
  } catch {
    /* ignore */
  }
}
