/**
 * Central offline-message sync manager (singleton).
 *
 * Historically the app had TWO parallel offline queues:
 *   1. `gaga-message-queue`   (lib/offlineQueue.ts — written by the chat and
 *      group stores when a send happens offline, but NEVER flushed)
 *   2. `offline-message-queue`(hooks/useOfflineQueue.ts — per-component flush)
 *
 * This module consolidates flushing for both: it migrates the legacy hook
 * queue into the lib queue, then flushes pending entries sequentially via
 * the owning store (direct chats → useChatStore, groups → useGroupStore).
 *
 * Started once via startOfflineQueueSync() (called from App mount and from
 * useOfflineQueue). Safe to call multiple times.
 */
import {
  getQueue,
  addToQueue,
  removeFromQueue,
  updateQueueStatus,
  isOnline,
} from '@/lib/offlineQueue';
import { safeGetStorageItem, safeRemoveStorageItem } from '@/lib/safeStorage';
import { useChatStore } from '@/store/useChatStore';
import { useGroupStore } from '@/store/useGroupStore';

const LEGACY_QUEUE_KEY = 'offline-message-queue';
const SEND_DELAY_MS = 800; // spacing between sends to avoid rate-limit bursts
const PERIODIC_FLUSH_MS = 60_000;

let started = false;
let flushing = false;

interface LegacyQueuedMessage {
  chatId: string;
  senderId: string;
  content: string;
  type: 'direct' | 'group';
  replyTo?: string;
}

/** Move entries from the retired hook-level queue into the lib queue. */
function migrateLegacyQueue(): void {
  try {
    const raw = safeGetStorageItem(LEGACY_QUEUE_KEY);
    if (!raw) return;
    const legacy = JSON.parse(raw) as LegacyQueuedMessage[];
    if (Array.isArray(legacy)) {
      for (const m of legacy) {
        if (!m?.chatId || !m?.senderId || !m?.content) continue;
        addToQueue({
          chatId: m.chatId,
          senderId: m.senderId,
          content: m.content,
          type: m.type === 'group' ? 'group' : 'direct',
          messageType: 'text',
          replyTo: m.replyTo,
        });
      }
    }
    safeRemoveStorageItem(LEGACY_QUEUE_KEY);
  } catch { /* corrupted legacy queue — drop it */ }
}

async function deliverQueued(msgId: string): Promise<boolean> {
  const msg = getQueue().find((m) => m.id === msgId);
  if (!msg) return true; // already gone
  updateQueueStatus(msg.id, 'sending');
  try {
    if (msg.type === 'group') {
      await useGroupStore
        .getState()
        .sendGroupMessage(msg.chatId, msg.senderId, msg.content, msg.messageType ?? 'text', msg.mediaUrl, msg.replyTo);
    } else {
      await useChatStore
        .getState()
        .sendMessage(msg.chatId, msg.senderId, msg.content, msg.messageType ?? 'text', msg.mediaUrl, msg.replyTo);
    }
    removeFromQueue(msg.id);
    return true;
  } catch {
    updateQueueStatus(msg.id, 'failed');
    return false;
  }
}

export async function flushOfflineQueue(): Promise<void> {
  if (flushing || !isOnline()) return;
  flushing = true;
  try {
    // Snapshot pending/failed entries; re-read per message for fresh state.
    const pending = getQueue().filter((m) => m.syncStatus !== 'synced');
    for (const msg of pending) {
      if (!isOnline()) break;
      await deliverQueued(msg.id);
      await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
    }
  } finally {
    flushing = false;
  }
}

/**
 * Idempotently start the global flush loop: immediate flush, flush on
 * reconnect, and a slow periodic retry for messages that failed mid-flush.
 */
export function startOfflineQueueSync(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  migrateLegacyQueue();

  window.addEventListener('online', () => { void flushOfflineQueue(); });
  setInterval(() => { void flushOfflineQueue(); }, PERIODIC_FLUSH_MS);

  void flushOfflineQueue();
}
