import { useEffect, useCallback } from 'react';
import { pushNotificationService } from '@/services/pushNotificationService';
import { useAuthStore } from '@/store/useAuthStore';

export function usePushNotifications() {
  const { user } = useAuthStore();

  const init = useCallback(async () => {
    const supported = await pushNotificationService.init();
    if (supported && Notification.permission === 'default') {
      // Don't auto-request — let user trigger via UI
    }
  }, []);

  useEffect(() => {
    init();
  }, [init]);

  const requestPermission = useCallback(async () => {
    return await pushNotificationService.requestPermission();
  }, []);

  return {
    requestPermission,
    isSupported: pushNotificationService.isSupported(),
    canSend: pushNotificationService.canSend(),
  };
}

export default usePushNotifications;
