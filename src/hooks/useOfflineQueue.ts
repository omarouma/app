import { useEffect } from 'react';
import { enqueueOfflineMessage, isOnline } from '@/lib/offlineQueue';
import { startOfflineQueueSync } from '@/lib/offlineSync';

// Re-export so existing callers don't change their imports
export { isOnline };

interface QueueMessageInput {
  chatId: string;
  senderId: string;
  content: string;
  type: 'direct' | 'group';
  replyTo?: string;
}

/**
 * Queue a message for offline delivery. All queueing now flows through the
 * single lib-level queue (`gaga-message-queue`), which is flushed globally by
 * the offlineSync manager — previously this hook kept its own separate queue
 * (`offline-message-queue`) while the store-level queue had no flusher at
 * all, silently dropping offline sends.
 */
export const useOfflineQueue = () => {
  useEffect(() => {
    startOfflineQueueSync();
  }, []);

  const queueMessage = (message: QueueMessageInput) => {
    enqueueOfflineMessage({
      chatId: message.chatId,
      senderId: message.senderId,
      content: message.content,
      type: message.type,
      messageType: 'text',
      replyTo: message.replyTo,
    });
    startOfflineQueueSync();
  };

  return { queueMessage };
};
