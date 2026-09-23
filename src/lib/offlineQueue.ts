import { v4 as uuidv4 } from 'uuid';
import { safeGetStorageItem, safeSetStorageItem, safeRemoveStorageItem } from '@/lib/safeStorage';

export type SyncStatus = 'synced' | 'pending' | 'sending' | 'failed';

export interface QueuedMessage {
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

export function getQueue(): QueuedMessage[] {
  try {
    const raw = safeGetStorageItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveQueue(queue: QueuedMessage[]) {
  safeSetStorageItem(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Drop every queued message.
 *
 * Called on sign-out so a queued message from account A can never be flushed
 * under account B's session (never mix cached data between accounts).
 */
export function clearQueue() {
  try {
    safeRemoveStorageItem(QUEUE_KEY);
  } catch {
    /* best-effort */
  }
}

export function addToQueue(msg: Omit<QueuedMessage, 'id' | 'timestamp' | 'syncStatus'> & { id?: string; timestamp?: number; syncStatus?: SyncStatus }): QueuedMessage {
  const queue = getQueue();
  const queued: QueuedMessage = {
    id: msg.id ?? uuidv4(),
    timestamp: msg.timestamp ?? Date.now(),
    syncStatus: msg.syncStatus ?? 'pending',
    type: msg.type,
    chatId: msg.chatId,
    senderId: msg.senderId,
    content: msg.content,
    messageType: msg.messageType,
    mediaUrl: msg.mediaUrl,
    replyTo: msg.replyTo,
  };
  queue.push(queued);
  saveQueue(queue);
  return queued;
}

export function removeFromQueue(id: string) {
  saveQueue(getQueue().filter(m => m.id !== id));
}

export function updateQueueStatus(id: string, status: SyncStatus) {
  saveQueue(getQueue().map(m => m.id === id ? { ...m, syncStatus: status } : m));
}

export function enqueueOfflineMessage(msg: {
  type: 'direct' | 'group';
  chatId: string;
  senderId: string;
  content: string;
  messageType?: string;
  mediaUrl?: string;
  replyTo?: string;
}): QueuedMessage {
  return addToQueue({
    ...msg,
    syncStatus: 'pending',
  });
}

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export interface QueueStats {
  queueLength: number;
  pendingCount: number;
  failedCount: number;
}

export function getQueueStats(): QueueStats {
  const q = getQueue();
  return {
    queueLength: q.length,
    pendingCount: q.filter(m => m.syncStatus === 'pending' || m.syncStatus === 'sending').length,
    failedCount: q.filter(m => m.syncStatus === 'failed').length,
  };
}
