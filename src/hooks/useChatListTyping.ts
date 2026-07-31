import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { isSupabaseConfigured, getSupabase } from '@/lib/supabase';
import { subscribeToDoc } from '@/lib/firestore';

interface TypingState {
  [chatId: string]: string; // chatId -> typing user name
}

export function useChatListTyping(chatIds: string[]) {
  const { user } = useAuthStore();
  const [typingMap, setTypingMap] = useState<TypingState>({});
  const unsubRef = useRef<(() => void)[]>([]);

  const chatIdsKey = useMemo(() => chatIds.join(','), [chatIds]);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!user?.id || chatIds.length === 0) {
      if (!initializedRef.current) {
        initializedRef.current = true;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- resets typing map when no chats
        setTypingMap({});
      }
      return;
    }

    const supabase = isSupabaseConfigured() ? getSupabase() : null;
    const newUnsubs: (() => void)[] = [];

    if (supabase) {
      // Single channel for all typing events
      const channel = supabase
        .channel('chat-list-typing')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'typing',
        }, (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = payload.new as any;
          if (!data || data.user_id === user.id) return;
          const chatId = data.chat_id;
          if (!chatIds.includes(chatId)) return;

          const now = Date.now();
          const ts = new Date(data.updated_at).getTime();

          if (data.is_typing && now - ts < 6000) {
            setTypingMap(prev => ({ ...prev, [chatId]: data.user_name || 'Someone' }));
          } else {
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

          Object.entries(data).forEach(([key, value]) => {
            if (key === 'id' || key === user.id) return;
            const typed = value as { name: string; timestamp: unknown };
            if (!typed || typeof typed !== 'object') return;
            const ts = (typed.timestamp as { toMillis?: () => number }).toMillis?.() || new Date(typed.timestamp as string).getTime();
            if (now - ts < 6000) {
              typingName = String(typed.name ?? '').replace(/[<>&"]/g, '').slice(0, 30);
            }
          });

          setTypingMap(prev => {
            const next = { ...prev };
            if (typingName) {
              next[chatId] = typingName;
            } else {
              delete next[chatId];
            }
            return next;
          });
        });
        newUnsubs.push(unsub);
      });
    }

    unsubRef.current = newUnsubs;

  // Clear stale entries periodically — no-op setTypingMap removed, interval dropped
  // Staleness is handled by the 6-second window check on each incoming event

    return () => {
      newUnsubs.forEach(u => u());
      setTypingMap({});
    };
  }, [chatIdsKey, chatIds, user?.id]);

  return typingMap;
}
