import { useEffect, useCallback } from 'react';
import { pushNotificationService } from '@/services/pushNotificationService';
import { useAuthStore } from '@/store/useAuthStore';
import { getSupabaseSafe } from '@/lib/supabase';

/**
 * Stable per-browser device identifier. Persisted in localStorage so the same
 * browser always maps to the same `user_devices` row (upsert on user_id+device_id).
 */
function getDeviceId(): string {
  const KEY = 'gaga-device-id';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function detectPlatform(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/windows/i.test(ua)) return 'windows';
  if (/macintosh|mac os x/i.test(ua)) return 'macos';
  if (/linux/i.test(ua)) return 'linux';
  return 'web';
}

/**
 * Persist the push subscription so the server can deliver background push.
 *
 * Writes to BOTH:
 *   * `user_devices` (multi-device, preferred — upsert on user_id+device_id)
 *   * `users.push_subscription` (legacy single-device fallback)
 *
 * Failures are non-fatal: in-app notifications still work without a server
 * subscription.
 */
async function savePushSubscription(userId: string, sub: PushSubscription) {
  const supabase = getSupabaseSafe();
  if (!supabase) return;

  const subscriptionJson = JSON.parse(JSON.stringify(sub)) as Record<string, unknown>;
  const deviceId = getDeviceId();

  // 1) Multi-device table (preferred)
  try {
    const { error } = await supabase.from('user_devices').upsert(
      {
        user_id: userId,
        device_id: deviceId,
        device_name: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : 'Web',
        platform: detectPlatform(),
        push_subscription: subscriptionJson,
        last_seen_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: 'user_id,device_id' },
    );
    if (error) {
      console.debug('user_devices push subscription save skipped:', error.message);
    }
  } catch (err) {
    console.debug('user_devices push subscription save failed (non-critical):', err);
  }

  // 2) Legacy single-device column (fallback for older server code)
  try {
    const { error } = await supabase
      .from('users')
      .update({ push_subscription: subscriptionJson })
      .eq('id', userId);
    if (error && error.code !== 'PGRST204') {
      console.debug('users.push_subscription save skipped:', error.message);
    }
  } catch (err) {
    console.debug('users.push_subscription save failed (non-critical):', err);
  }
}

export function usePushNotifications() {
  const user = useAuthStore((s) => s.user);

  const init = useCallback(async () => {
    await pushNotificationService.init();
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    init()
      .then(async () => {
        if (Notification.permission !== 'granted') return;
        const sub = await pushNotificationService.subscribeToPush();
        if (sub) await savePushSubscription(user.id, sub);
      })
      .catch(() => {});
  }, [user?.id, init]);

  const requestPermission = useCallback(async () => {
    const granted = await pushNotificationService.requestPermission();
    if (granted && user?.id) {
      const sub = await pushNotificationService.subscribeToPush();
      if (sub) await savePushSubscription(user.id, sub);
    }
    return granted;
  }, [user]);

  return {
    requestPermission,
    isSupported: pushNotificationService.isSupported(),
    canSend: pushNotificationService.canSend(),
  };
}

export default usePushNotifications;
