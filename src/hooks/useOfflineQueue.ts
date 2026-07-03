import { useEffect, useRef } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { useGroupStore } from '@/store/useGroupStore';
import { toast } from 'sonner';

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
}

const QUEUE_KEY = 'gaga-message-queue';

function getQueue(): QueuedMessage[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedMessage[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
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

export function useOfflineQueue() {
  const { sendMessage } = useChatStore();
  const { sendGroupMessage } = useGroupStore();
  const isProcessing = useRef(false);

  const queueMessage = (msg: Omit<QueuedMessage, 'id' | 'timestamp'>) => {
    const queued: QueuedMessage = {
      ...msg,
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
    };
    addToQueue(queued);
    toast.info('Message queued - will send when online');
  };

  const processQueue = async () => {
    if (isProcessing.current) return;
    isProcessing.current = true;

    const queue = getQueue();
    if (queue.length === 0) {
      isProcessing.current = false;
      return;
    }

    let sent = 0;
    for (const msg of queue) {
      try {
        if (msg.type === 'direct') {
          await sendMessage(msg.chatId, msg.senderId, msg.content, msg.messageType || 'text', msg.mediaUrl, msg.replyTo);
        } else {
          await sendGroupMessage(msg.chatId, msg.senderId, msg.content, msg.messageType || 'text', msg.mediaUrl, msg.replyTo);
        }
        removeFromQueue(msg.id);
        sent++;
      } catch (err) {
        // Keep in queue for next attempt
        console.error('Failed to send queued message:', err);
      }
    }

    if (sent > 0) {
      toast.success(`${sent} queued message${sent > 1 ? 's' : ''} sent`);
    }
    isProcessing.current = false;
  };

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

    // Process any existing queue on mount if online
    if (navigator.onLine) {
      processQueue().catch(() => {});
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { queueMessage, processQueue };
}

export function isOnline() {
  return navigator.onLine;
}
