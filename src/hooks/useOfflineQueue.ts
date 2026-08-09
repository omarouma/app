import { useEffect, useRef, useCallback, useState } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { useGroupStore } from '@/store/useGroupStore';
import { toast } from 'sonner';
import {
  getQueue,
  removeFromQueue,
  updateQueueStatus,
  enqueueOfflineMessage,
  getQueueStats,
  isOnline,
  type QueuedMessage,
  type SyncStatus,
} from '@/lib/offlineQueue';

export function useOfflineQueue() {
  const { sendMessage } = useChatStore();
  const { sendGroupMessage } = useGroupStore();
  const isProcessing = useRef(false);
  const [queueLength, setQueueLength] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  // Sync queue stats periodically
  const refreshStats = useCallback(() => {
    const stats = getQueueStats();
    setQueueLength(stats.queueLength);
    setPendingCount(stats.pendingCount);
    setFailedCount(stats.failedCount);
  }, []);

  const queueMessage = (msg: Omit<QueuedMessage, 'id' | 'timestamp' | 'syncStatus'>) => {
    const queued = enqueueOfflineMessage(msg);
    refreshStats();
    toast.info('Message queued - will send when online');
    return queued.id;
  };

  const processQueue = useCallback(async () => {
    if (isProcessing.current) return;
    isProcessing.current = true;

    try {
      const queue = getQueue();
      if (queue.length === 0) {
        return;
      }

      let sent = 0;
      let failed = 0;
      for (const msg of queue) {
        updateQueueStatus(msg.id, 'sending');
        try {
          if (msg.type === 'direct') {
            await sendMessage(msg.chatId, msg.senderId, msg.content, msg.messageType || 'text', msg.mediaUrl, msg.replyTo);
          } else {
            await sendGroupMessage(msg.chatId, msg.senderId, msg.content, msg.messageType || 'text', msg.mediaUrl, msg.replyTo);
          }
          removeFromQueue(msg.id);
          sent++;
        } catch (err) {
          console.error('Failed to send queued message:', err);
          updateQueueStatus(msg.id, 'failed');
          failed++;
        }
      }

      if (sent > 0) {
        toast.success(`${sent} queued message${sent > 1 ? 's' : ''} sent`);
      }
      if (failed > 0) {
        toast.error(`${failed} message${failed > 1 ? 's' : ''} failed to send`);
      }
      refreshStats();
    } finally {
      isProcessing.current = false;
    }
  }, [sendMessage, sendGroupMessage, refreshStats]);

  useEffect(() => {
    const handleOnline = () => {
      toast.success('Back online');
      processQueue().catch(() => { });
    };
    const handleOffline = () => {
      toast.error('You are offline. Messages will be queued.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (navigator.onLine) processQueue().catch(() => { });

    refreshStats();
    // Only poll stats when there are queued messages
    const interval = setInterval(() => {
      if (getQueue().length > 0) refreshStats();
    }, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [processQueue, refreshStats]);

  return { queueMessage, processQueue, queueLength, pendingCount, failedCount, refreshStats };
}

export { isOnline };
export type { QueuedMessage, SyncStatus };
