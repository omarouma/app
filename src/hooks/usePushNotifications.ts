import { useEffect, useCallback } from 'react';
import { pushNotificationService } from '@/services/pushNotificationService';
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
      if (error.code === 'PGRST204') {
        console.debug('Push subscription column not yet migrated in database - this is expected during deployment');
      } else {
        console.debug('Push notification subscription save skipped:', error.message);
      }
    }
  } catch (err) {
    // Silently ignore - push notifications are non-critical
    console.debug('Error saving push subscription (non-critical):', err instanceof Error ? err.message : String(err));
  }
}

export function usePushNotifications() {
  const user = useAuthStore((s) => s.user);

  const init = useCallback(async () => {
    await pushNotificationService.init();
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    init().then(async () => {
      if (Notification.permission !== 'granted') return;
      const sub = await pushNotificationService.subscribeToPush();
      if (sub) await savePushSubscription(user.id, sub);
    }).catch(() => { });
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
