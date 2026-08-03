import { useEffect, useRef, useCallback, useState } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { useGroupStore } from '@/store/useGroupStore';
import { toast } from 'sonner';
import { safeGetStorageItem, safeSetStorageItem } from '@/lib/safeStorage';

export type SyncStatus = 'synced' | 'pending' | 'sending' | 'failed';

interface QueuedMessage {
  id: string;
  type: 'direct' | 'group';
  chatId: string;
  senderId: string;
  content: string;
  messageType?: string;
  mediaUrl?: string;
  replyTo?: string;
  timestamp: number;
  syncStatus: SyncStatus;
}

const QUEUE_KEY = 'gaga-message-queue';

function getQueue(): QueuedMessage[] {
  try {
    const raw = safeGetStorageItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedMessage[]) {
  safeSetStorageItem(QUEUE_KEY, JSON.stringify(queue));
}

function addToQueue(msg: QueuedMessage) {
  const queue = getQueue();
  queue.push(msg);
  saveQueue(queue);
}

function removeFromQueue(id: string) {
  const queue = getQueue().filter(m => m.id !== id);
  saveQueue(queue);
}

function updateStatus(id: string, status: SyncStatus) {
  const queue = getQueue().map(m => m.id === id ? { ...m, syncStatus: status } : m);
  saveQueue(queue);
}

export function useOfflineQueue() {
  const { sendMessage } = useChatStore();
  const { sendGroupMessage } = useGroupStore();
  const isProcessing = useRef(false);
  const [queueLength, setQueueLength] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  // Sync queue stats periodically
  const refreshStats = useCallback(() => {
    const q = getQueue();
    setQueueLength(q.length);
    setPendingCount(q.filter(m => m.syncStatus === 'pending' || m.syncStatus === 'sending').length);
    setFailedCount(q.filter(m => m.syncStatus === 'failed').length);
  }, []);

  const queueMessage = (msg: Omit<QueuedMessage, 'id' | 'timestamp' | 'syncStatus'>) => {
    const queued: QueuedMessage = {
      ...msg,
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      syncStatus: 'pending',
    };
    addToQueue(queued);
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
        updateStatus(msg.id, 'sending');
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
          updateStatus(msg.id, 'failed');
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
      processQueue().catch(() => {});
    };
    const handleOffline = () => {
      toast.error('You are offline. Messages will be queued.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (navigator.onLine) processQueue().catch(() => {});

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

export function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}
