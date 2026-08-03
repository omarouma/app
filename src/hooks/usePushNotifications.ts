import { useEffect, useCallback } from 'react';
import { pushNotificationService } from '@/services/pushNotificationService';
import { useAuthStore } from '@/store/useAuthStore';
import { getSupabaseSafe } from '@/lib/supabase';

async function savePushSubscription(userId: string, sub: PushSubscription) {
  const supabase = getSupabaseSafe();
  if (!supabase) return;
  try {
    // push_subscription column may not exist on older schemas — ignore column errors
    await supabase
      .from('users')
      .update({ push_subscription: JSON.stringify(sub) })
      .eq('id', userId);
  } catch { /* ignore — non-critical */ }
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
    }).catch(() => {});
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
