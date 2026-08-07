import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { isSupabaseConfigured, getSupabase } from '@/lib/supabase';
import { subscribeToDoc } from '@/lib/firestore';

interface TypingInfo {
  name: string;
  timestamp: number;
}

interface TypingState {
  [chatId: string]: string; // Final output: chatId -> typing user name
}

interface InternalTypingState {
  [chatId: string]: TypingInfo; // Internal state with timestamps
}



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

export function useChatListTyping(chatIdsKey: string) {
  const chatIds = useMemo(() => chatIdsKey ? chatIdsKey.split(',') : [], [chatIdsKey]);
  const { user } = useAuthStore();
  const [typingMap, setTypingMap] = useState<InternalTypingState>({});
  const chatIdSetRef = useRef<Set<string>>(new Set(chatIds));

  useEffect(() => {
    chatIdSetRef.current = new Set(chatIds);
  }, [chatIds]);

  
  const channelName = useMemo(
    () => `chat-list-typing-${hashChatIds(chatIdsKey.split(','))}`,
    [chatIdsKey]
  );

  useEffect(() => {
    if (!user?.id || chatIds.length === 0) {
      setTypingMap({});
      return;
    }

    const supabase = isSupabaseConfigured() ? getSupabase() : null;
    const unsubs: (() => void)[] = [];

    if (supabase) {
      const channel = supabase
        .channel(channelName)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'typing' }, (payload) => {
          const data = payload.new as Record<string, unknown>;
          if (!data || data.user_id === user.id) return;

          const chatId = String(data.chat_id);
          if (!chatIdSetRef.current.has(chatId)) return;

          const ts = new Date(String(data.updated_at ?? '')).getTime() || Date.now();
          const isTyping = !!data.is_typing && (Date.now() - ts < 6000);

          setTypingMap(prev => {
            const current = prev[chatId];
            if (isTyping) {
              const newEntry = { name: String(data.user_name || 'Someone'), timestamp: ts };
              if (current?.name === newEntry.name && current?.timestamp === newEntry.timestamp) return prev;
              return { ...prev, [chatId]: newEntry };
            }
            if (current) {
              const next = { ...prev };
              delete next[chatId];
              return next;
            }
            return prev;
          });
        })
        .subscribe();
      unsubs.push(() => supabase.removeChannel(channel));
    } else {
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
            const ts = (typed.timestamp as { toMillis?: () => number })?.toMillis?.() || new Date(typed.timestamp as string).getTime();
            if (now - ts < 6000 && ts > typingTs) {
              typingName = String(typed.name ?? '').replace(/[<>&"]/g, '').slice(0, 30);
              typingTs = ts;
            }
          });

          setTypingMap(prev => {
            const current = prev[chatId];
            if (typingName) {
              if (current?.name === typingName && current?.timestamp === typingTs) return prev;
              return { ...prev, [chatId]: { name: typingName, timestamp: typingTs } };
            }
            if (current) {
              const next = { ...prev };
              delete next[chatId];
              return next;
            }
            return prev;
          });
        });
        unsubs.push(unsub);
      });
    }

    return () => {
      unsubs.forEach(u => u());
    };
  }, [chatIdsKey, channelName, user?.id, chatIds]);

  useEffect(() => {
    if (chatIds.length === 0) return;

    const interval = setInterval(() => {
      setTypingMap(prev => {
        const now = Date.now();
        let changed = false;
        const next = { ...prev };
        for (const chatId in next) {
          if (now - next[chatId].timestamp >= 6000) {
            delete next[chatId];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [chatIds.length]);

  const activeTypingMap = useMemo(() => {
    const result: TypingState = {};
    for (const chatId in typingMap) {
      result[chatId] = typingMap[chatId].name;
    }
    return result;
  }, [typingMap]);

  return activeTypingMap;
}