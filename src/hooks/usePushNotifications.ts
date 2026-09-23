import { useEffect, useCallback } from 'react';
import { pushNotificationService } from '@/services/pushNotificationService';
import {
  registerNativePush,
  unregisterNativePush,
  setNativePushUser,
  isNativePlatform,
  initNativePushListeners,
} from '@/services/nativePush';
import { initNativeNotifications } from '@/services/nativeNotifications';
import { useAuthStore } from '@/store/useAuthStore';
import { getSupabaseSafe } from '@/lib/supabase';

async function savePushSubscription(userId: string, sub: PushSubscription) {
  const supabase = getSupabaseSafe();
  if (!supabase) return;
  try {
    // push_subscription column may not exist on older schemas — ignore column errors
    const { error } = await supabase
      .from('users')
      .update({ push_subscription: JSON.stringify(sub) })
      .eq('id', userId);

    if (error) {
      // Non-critical error - push notifications will still work, just won't be saved to DB
    }
  } catch (err) {
    // Silently ignore - push notifications are non-critical
    void err;
  }
}

export function usePushNotifications() {
  const user = useAuthStore((s) => s.user);

  const init = useCallback(async () => {
    await pushNotificationService.init();
  }, []);

  // ── Native: attach FCM listeners + init local notifications ASAP ──────────
  // This runs on mount, *before* sign-in completes, so a cold-start tap on a
  // notification is captured (Capacitor buffers the action until a listener is
  // attached). It also creates the Android notification channels so message and
  // call alerts display with the right importance.
  useEffect(() => {
    if (!isNativePlatform()) return;
    void initNativePushListeners();
    void initNativeNotifications(false);
  }, []);

  useEffect(() => {
    if (!user?.id) {
      // Sign-out: drop the native push registration.
      setNativePushUser(null);
      void unregisterNativePush();
      return;
    }

    // ── Native (Android/iOS) path: FCM via Capacitor PushNotifications ──
    if (isNativePlatform()) {
      setNativePushUser(user.id);
      void initNativeNotifications(true).then(() => registerNativePush(user.id, true));
      return;
    }

    // ── Web path: Web Push (VAPID) ──
    init().then(async () => {
      if (Notification.permission !== 'granted') return;
      const sub = await pushNotificationService.subscribeToPush();
      if (sub) await savePushSubscription(user.id, sub);
    }).catch(() => { });
  }, [user?.id, init]);

  const requestPermission = useCallback(async () => {
    // Native: prompt via the OS dialog through the plugin.
    if (isNativePlatform() && user?.id) {
      await initNativeNotifications(true);
      const reg = await registerNativePush(user.id, true);
      return !!reg;
    }
    const granted = await pushNotificationService.requestPermission();
    if (granted && user?.id) {
      const sub = await pushNotificationService.subscribeToPush();
      if (sub) await savePushSubscription(user.id, sub);
    }
    return granted;
  }, [user]);


  return {
    requestPermission,
    isSupported: isNativePlatform() || pushNotificationService.isSupported(),
    canSend: isNativePlatform() || pushNotificationService.canSend(),
  };
}

export default usePushNotifications;
