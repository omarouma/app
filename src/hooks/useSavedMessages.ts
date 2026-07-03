import { useState, useEffect, useCallback } from 'react';
import type { Message } from '@/types';

export interface SavedMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  content: string;
  type: string;
  mediaUrl?: string;
  timestamp: string;
  savedAt: string;
}

const STORAGE_KEY = 'gaga_saved_messages';

export function useSavedMessages(userId: string | undefined) {
  const [saved, setSaved] = useState<SavedMessage[]>([]);
  const [loading] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (!userId) return;
    const key = `${STORAGE_KEY}_${userId}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) queueMicrotask(() => setSaved(JSON.parse(raw)));
    } catch { /* noop */ }
  }, [userId]);

  // Persist to localStorage whenever saved changes
  useEffect(() => {
    if (!userId) return;
    const key = `${STORAGE_KEY}_${userId}`;
    try {
      localStorage.setItem(key, JSON.stringify(saved));
    } catch { /* noop */ }
  }, [saved, userId]);

  const saveMessage = useCallback((msg: Message, senderName: string) => {
    const entry: SavedMessage = {
      id: msg.id,
      chatId: msg.chatId,
      senderId: msg.senderId,
      senderName,
      content: msg.content,
      type: msg.type,
      mediaUrl: msg.mediaUrl,
      timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : String(msg.timestamp),
      savedAt: new Date().toISOString(),
    };
    setSaved(prev => {
      if (prev.some(p => p.id === msg.id)) return prev;
      return [entry, ...prev];
    });
  }, []);

  const unsaveMessage = useCallback((messageId: string) => {
    setSaved(prev => prev.filter(p => p.id !== messageId));
  }, []);

  const isSaved = useCallback((messageId: string) => {
    return saved.some(p => p.id === messageId);
  }, [saved]);

  const clearAll = useCallback(() => {
    setSaved([]);
  }, []);

  return { saved, loading, saveMessage, unsaveMessage, isSaved, clearAll };
}
