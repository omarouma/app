import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { isSupabaseConfigured, getSupabase } from '@/lib/supabase';
import { subscribeToDoc } from '@/lib/firestore';

interface TypingState {
  [chatId: string]: string; // chatId -> typing user name
}

// Unique per-tab id so multiple tabs/clients don't collide on the same channel.
const TAB_ID = Math.random().toString(36).slice(2, 8);

// Stable 32-bit hash of the chat-id set so the channel name changes only when the set changes.
function hashChatIds(ids: string[]): string {
  let h = 2166136261;
  for (const id of ids) {
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return (h >>> 0).toString(36);
}

export function useChatListTyping(chatIds: string[]) {
  const { user } = useAuthStore();
  const [typingMap, setTypingMap] = useState<TypingState>({});
  const unsubRef = useRef<(() => void)[]>([]);
  const typingTsRef = useRef<Record<string, number>>({});
  const chatIdSetRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    chatIdSetRef.current = new Set(chatIds);
  }, [chatIds]);

  const chatIdsKey = useMemo(() => chatIds.join(','), [chatIds]);
  const channelName = useMemo(
    () => `chat-list-typing-${TAB_ID}-${hashChatIds(chatIdsKey.split(','))}`,
    [chatIdsKey]
  );

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!user?.id || chatIds.length === 0) {
      if (!initializedRef.current) {
        initializedRef.current = true;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- resets typing map when no chats
        setTypingMap({});
      }
      typingTsRef.current = {};
      return;
    }

    const supabase = isSupabaseConfigured() ? getSupabase() : null;
    const newUnsubs: (() => void)[] = [];

    if (supabase) {
      // Single channel for all typing events — unique name per tab + chat set to
      // avoid Supabase reusing/mixing a channel across different clients.
      const channel = supabase
        .channel(channelName)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'typing',
        }, (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = payload.new as any;
          if (!data || data.user_id === user.id) return;
          const chatId = data.chat_id;
          if (!chatIdSetRef.current.has(chatId)) return;

          const now = Date.now();
          const ts = new Date(data.updated_at).getTime();

          if (data.is_typing && now - ts < 6000) {
            typingTsRef.current[chatId] = ts || now;
            setTypingMap(prev => ({ ...prev, [chatId]: data.user_name || 'Someone' }));
          } else {
            delete typingTsRef.current[chatId];
            setTypingMap(prev => {
              const next = { ...prev };
              delete next[chatId];
              return next;
            });
          }
        })
        .subscribe();

      newUnsubs.push(() => supabase.removeChannel(channel));
    } else {
      // Firestore fallback - subscribe to each chat's typing doc
      chatIds.forEach(chatId => {
        const unsub = subscribeToDoc('typing', chatId, (data) => {
          if (!data) return;
          const now = Date.now();
          let typingName = '';
          let typingTs = 0;

          Object.entries(data).forEach(([key, value]) => {
            if (key === 'id' || key === user.id) return;
            const typed = value as { name: string; timestamp: unknown };
            if (!typed || typeof typed !== 'object') return;
            const ts = (typed.timestamp as { toMillis?: () => number }).toMillis?.() || new Date(typed.timestamp as string).getTime();
            if (now - ts < 6000) {
              typingName = String(typed.name ?? '').replace(/[<>&"]/g, '').slice(0, 30);
              typingTs = ts || now;
            }
          });

          setTypingMap(prev => {
            const next = { ...prev };
            if (typingName) {
              typingTsRef.current[chatId] = typingTs || now;
              next[chatId] = typingName;
            } else {
              delete typingTsRef.current[chatId];
              delete next[chatId];
            }
            return next;
          });
        });
        newUnsubs.push(unsub);
      });
    }

    unsubRef.current = newUnsubs;

    return () => {
      newUnsubs.forEach(u => u());
      typingTsRef.current = {};
      setTypingMap({});
    };
  }, [chatIdsKey, chatIds, channelName, user?.id]);

  useEffect(() => {
    if (!user?.id || chatIds.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      let changed = false;
      const nextTs = { ...typingTsRef.current };
      for (const [chatId, ts] of Object.entries(nextTs)) {
        if (now - ts >= 6000) {
          delete nextTs[chatId];
          changed = true;
        }
      }
      if (!changed) return;
      typingTsRef.current = nextTs;
      setTypingMap((prev) => {
        const next = { ...prev };
        for (const chatId of Object.keys(prev)) {
          if (!nextTs[chatId]) delete next[chatId];
        }
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [chatIdsKey, chatIds.length, user?.id]);

  return typingMap;
}
