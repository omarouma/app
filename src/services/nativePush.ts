/**
 * Native FCM push registration (Android).
 *
 * The web build uses the Web Push API (VAPID) via `pushNotificationService`.
 * That API does NOT exist inside the Capacitor Android WebView, so on native we
 * must register with Firebase Cloud Messaging through the Capacitor
 * PushNotifications plugin and persist the resulting device token to
 * `users.push_subscription` so the `send-push` Edge Function can deliver
 * notifications (including incoming-call rings) while the app is terminated.
 *
 * This module is a no-op on the web.
 */
import { Capacitor } from '@capacitor/core';
import { getSupabaseSafe } from '@/lib/supabase';
import { handleNotificationTap, type NotificationTapData } from '@/lib/notificationRouter';

export interface NativePushRegistration {
  token: string;
  platform: 'android' | 'ios';
}

let listenersAttached = false;
let currentToken: string | null = null;
let pendingResolvers: Array<(reg: NativePushRegistration | null) => void> = [];

/** Whether we're running inside the native Capacitor shell. */
export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** The last FCM token obtained on this device, if any. */
export function getNativePushToken(): string | null {
  return currentToken;
}

/**
 * Persists the FCM device token to the user's row so the server can push to it.
 * The `push_subscription` column is a TEXT column; for native we store a small
 * JSON envelope so the server can distinguish FCM tokens from Web Push
 * subscriptions.
 */
async function persistToken(userId: string, token: string, platform: 'android' | 'ios'): Promise<void> {
  const supabase = getSupabaseSafe();
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from('users')
      .update({ push_subscription: JSON.stringify({ kind: 'fcm', platform, token }) })
      .eq('id', userId);
    if (error && error.code !== 'PGRST204') {
      // Non-critical: token persist skipped (column may not be migrated yet).
    }
  } catch (err) {
    // Non-critical: token persist failed.
    void err;
  }
}

/**
 * Attaches the FCM listeners **once**, as early as possible.
 *
 * This MUST run before (or independently of) sign-in: when the app is
 * cold-started by tapping a notification, the tap action is delivered to the
 * plugin before the user session is restored. If we only attached the listener
 * after login, cold-start taps would be lost. Capacitor buffers the action
 * until a listener is registered, so attaching early guarantees delivery.
 */
export async function initNativePushListeners(): Promise<void> {
  if (!isNativePlatform() || listenersAttached) return;

  let PushNotifications: typeof import('@capacitor/push-notifications').PushNotifications;
  try {
    ({ PushNotifications } = await import('@capacitor/push-notifications'));
  } catch (err) {
    console.warn('[NativePush] PushNotifications plugin unavailable:', err);
    return;
  }

  listenersAttached = true;

  try {
    await PushNotifications.addListener('registration', (token) => {
      currentToken = token.value;
      const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
      const reg: NativePushRegistration = { token: token.value, platform };
      const resolvers = pendingResolvers;
      pendingResolvers = [];
      resolvers.forEach((r) => r(reg));
      // Persist for the currently signed-in user (best-effort).
      const uid = userIdRef;
      if (uid) void persistToken(uid, token.value, platform);
    });

    await PushNotifications.addListener('registrationError', (err) => {
      console.warn('[NativePush] registration error:', err);
      const resolvers = pendingResolvers;
      pendingResolvers = [];
      resolvers.forEach((r) => r(null));
    });

    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      // Foreground delivery. Android does not auto-display FCM notification
      // messages while the app is in the foreground, so the in-app layer
      // (useMessageNotifications / useIncomingCallNotifications) handles the
      // sound + local notification. For calls we additionally seed the ring UI
      // so a foreground call push is never missed.
      const data = notification?.data as NotificationTapData | undefined;
      if (data?.type === 'call') {
        handleNotificationTap(data);
      }
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      // User tapped a notification — deep-link into the relevant screen.
      const data = action?.notification?.data as NotificationTapData | undefined;
      handleNotificationTap(data);
    });
  } catch (err) {
    console.warn('[NativePush] failed to attach listeners:', err);
    listenersAttached = false;
  }
}

/**
 * Registers for native push and resolves with the FCM token.
 *
 * @param userId The signed-in user's id (token is persisted to their row).
 * @param requestPermission When true, prompts the OS permission dialog.
 */
export async function registerNativePush(
  userId: string,
  requestPermission = true,
): Promise<NativePushRegistration | null> {
  if (!isNativePlatform() || !userId) return null;

  // Ensure the (early) listeners are attached before registering.
  await initNativePushListeners();

  let PushNotifications: typeof import('@capacitor/push-notifications').PushNotifications;
  try {
    ({ PushNotifications } = await import('@capacitor/push-notifications'));
  } catch (err) {
    console.warn('[NativePush] PushNotifications plugin unavailable:', err);
    return null;
  }

  // Permission
  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' && requestPermission) {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') {
      return null;
    }
  } catch (err) {
    console.warn('[NativePush] permission check failed:', err);
    return null;
  }

  // Register (idempotent — FCM returns the same token if already registered).
  const tokenPromise = new Promise<NativePushRegistration | null>((resolve) => {
    pendingResolvers.push(resolve);
    // Safety timeout so we never hang forever.
    setTimeout(() => {
      pendingResolvers = pendingResolvers.filter((r) => r !== resolve);
      resolve(currentToken ? { token: currentToken, platform: Capacitor.getPlatform() === 'ios' ? 'ios' : 'android' } : null);
    }, 10_000);
  });

  try {
    await PushNotifications.register();
  } catch (err) {
    console.warn('[NativePush] register() failed:', err);
    return null;
  }

  return tokenPromise;
}

/** Unregisters native push (called on sign-out). */
export async function unregisterNativePush(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.removeAllListeners();
    listenersAttached = false;
    currentToken = null;
  } catch { /* ignore */ }
}

// Tracks the latest user id so the (stable) registration listener can persist
// the token without re-attaching.
let userIdRef: string | null = null;

/** Updates the user id used when persisting the FCM token. */
export function setNativePushUser(userId: string | null): void {
  userIdRef = userId;
}
