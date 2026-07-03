import { useCallback, useEffect, useRef } from 'react';
import type { Message } from '@/types';

interface ScheduledMessage {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  type: string;
  mediaUrl?: string;
  replyTo?: string;
  scheduledAt: number; // timestamp when to send
  createdAt: number;
}

const STORAGE_KEY = 'gaga_scheduled_messages';

function getScheduledMessages(): ScheduledMessage[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveScheduledMessages(msgs: ScheduledMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
  } catch {
    // Ignore localStorage errors (quota exceeded, etc.)
  }
}

export function addScheduledMessage(msg: Omit<ScheduledMessage, 'id' | 'createdAt'>): ScheduledMessage {
  const scheduled: ScheduledMessage = {
    ...msg,
    id: `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  const existing = getScheduledMessages();
  existing.push(scheduled);
  saveScheduledMessages(existing);
  return scheduled;
}

export function removeScheduledMessage(id: string) {
  const existing = getScheduledMessages();
  const filtered = existing.filter((m) => m.id !== id);
  saveScheduledMessages(filtered);
}

export function getPendingScheduledMessages(chatId?: string): ScheduledMessage[] {
  const now = Date.now();
  const all = getScheduledMessages();
  const pending = all.filter((m) => m.scheduledAt > now);
  return chatId ? pending.filter((m) => m.chatId === chatId) : pending;
}

export function getOverdueScheduledMessages(chatId?: string): ScheduledMessage[] {
  const now = Date.now();
  const all = getScheduledMessages();
  const overdue = all.filter((m) => m.scheduledAt <= now);
  return chatId ? overdue.filter((m) => m.chatId === chatId) : overdue;
}

export function cleanupOldScheduledMessages() {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const all = getScheduledMessages();
  // Keep messages scheduled in the last 24 hours or pending in the future
  const kept = all.filter((m) => m.scheduledAt > now - oneDay);
  saveScheduledMessages(kept);
}

export function useScheduledMessages(
  chatId: string,
  sendMessage: (chatId: string, senderId: string, content: string, type?: string, mediaUrl?: string, replyTo?: Message | string) => Promise<void>
) {
  const processedRef = useRef<Set<string>>(new Set());

  // Check for overdue scheduled messages on mount and periodically
  const checkAndSend = useCallback(async () => {
    const overdue = getOverdueScheduledMessages(chatId);
    const now = Date.now();

    for (const msg of overdue) {
      // Avoid sending the same message twice
      if (processedRef.current.has(msg.id)) continue;
      processedRef.current.add(msg.id);

      // Small safety buffer: only send if it's at least 2 seconds past due
      // (prevents race conditions on mount)
      if (now - msg.scheduledAt < 2000) continue;

      try {
        await sendMessage(msg.chatId, msg.senderId, msg.content, msg.type || 'text', msg.mediaUrl, msg.replyTo);
        removeScheduledMessage(msg.id);
      } catch {
        // If send fails, keep it in localStorage for next retry
        processedRef.current.delete(msg.id);
      }
    }
  }, [chatId, sendMessage]);

  useEffect(() => {
    // Check immediately on mount
    checkAndSend();

    // Check periodically every 10 seconds
    const interval = setInterval(checkAndSend, 10000);

    // Cleanup old messages periodically
    const cleanupInterval = setInterval(cleanupOldScheduledMessages, 60 * 60 * 1000); // every hour

    return () => {
      clearInterval(interval);
      clearInterval(cleanupInterval);
    };
  }, [checkAndSend]);

  return {
    schedule: (params: {
      senderId: string;
      content: string;
      type: string;
      mediaUrl?: string;
      replyTo?: string;
      scheduledAt: number; // timestamp
    }) => addScheduledMessage({ chatId, ...params }),
    getPending: () => getPendingScheduledMessages(chatId),
    cancel: (id: string) => removeScheduledMessage(id),
  };
}
