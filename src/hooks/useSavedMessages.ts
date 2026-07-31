import { useState, useEffect, useCallback, useRef } from 'react';
import { safeGetStorageItem, safeSetStorageItem } from '@/lib/safeStorage';
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

function loadFromStorage(userId: string): SavedMessage[] {
  const raw = safeGetStorageItem(`${STORAGE_KEY}_${userId}`);
  if (!raw) return [];
  try { return JSON.parse(raw) as SavedMessage[]; } catch { return []; }
}

export function useSavedMessages(userId: string | undefined) {
  const [saved, setSaved] = useState<SavedMessage[]>(() =>
    userId ? loadFromStorage(userId) : []
  );

  // Track previous userId to detect account switches
  const prevUserIdRef = useRef(userId);

  // Ref-based Set for stable O(1) lookups in isSaved
  const savedIdsRef = useRef(new Set<string>());

  // Sync the ref Set whenever saved array changes
  useEffect(() => {
    savedIdsRef.current = new Set(saved.map(s => s.id));
  }, [saved]);

  // When userId changes, reload from storage
  useEffect(() => {
    if (prevUserIdRef.current === userId) return;
    prevUserIdRef.current = userId;
    setTimeout(() => {
      setSaved(userId ? loadFromStorage(userId) : []);
    }, 0);
  }, [userId]);

  // Persist to localStorage whenever saved changes
  useEffect(() => {
    if (!userId) return;
    safeSetStorageItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(saved));
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
    return savedIdsRef.current.has(messageId);
  }, []);

  const clearAll = useCallback(() => {
    setSaved([]);
  }, []);

  return { saved, saveMessage, unsaveMessage, isSaved, clearAll };
}
