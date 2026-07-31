import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { isSupabaseConfigured, getSupabase } from '@/lib/supabase';
import { setDocById, subscribeToDoc, serverTimestamp } from '@/lib/firestore';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isColumnMissingError(error: any): boolean {
  if (!error) return false;
  const code = error.code || '';
  const msg = error.message || '';
  return (
    code === 'PGRST204' ||
    code === '42703' ||
    msg.includes('Could not find the') ||
    msg.includes('column of') ||
    msg.includes('in the schema cache') ||
    msg.includes('does not exist')
  );
}

export function useTyping(chatId: string | undefined) {
  const { user } = useAuthStore();
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const unsubRef = useRef<(() => void) | null>(null);

  const userNameCacheRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!chatId || !user) {
      queueMicrotask(() => setTypingUsers({}));
      return;
    }

    const supabase = isSupabaseConfigured() ? getSupabase() : null;

    // ─── Supabase path ───
    if (supabase) {
      const channel = supabase
        .channel(`typing-${chatId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'typing', filter: `chat_id=eq.${chatId}` }, (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = payload.new as any;
          if (!data || data.user_id === user.id) return;
          const now = Date.now();
          const ts = new Date(data.updated_at).getTime();
          if (data.is_typing && now - ts < 6000) {
            let userName = data.user_name || userNameCacheRef.current.get(data.user_id);
            if (!userName) {
              userName = 'User';
              // Async fetch from users table
              (async () => {
                try {
                  const { data: userRow } = await supabase.from('users').select('name').eq('id', data.user_id).single();
                  if (userRow?.name) {
                    userNameCacheRef.current.set(data.user_id, userRow.name);
                    setTypingUsers((prev) => ({
                      ...prev,
                      [data.user_id]: String(userRow.name).replace(/[<>"&]/g, '').slice(0, 50),
                    }));
                  }
                } catch { /* noop */ }
              })();
            }
            setTypingUsers((prev) => ({
              ...prev,
              [data.user_id]: String(userName).replace(/[<>"&]/g, '').slice(0, 50),
            }));
          } else {
            setTypingUsers((prev) => {
              const next = { ...prev };
              delete next[data.user_id];
              return next;
            });
          }
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
        setTypingUsers({});
      };
    }

    // ─── Firebase fallback ───
    const unsub = subscribeToDoc('typing', chatId, (data) => {
      if (!data) {
        setTypingUsers({});
        return;
      }
      const now = Date.now();
      const users: Record<string, string> = {};
      Object.entries(data).forEach(([key, value]) => {
        if (key === 'id' || key === user.id) return;
        const typed = value as { name: string; timestamp: unknown };
        if (!typed || typeof typed !== 'object') return;
        const ts = (typed.timestamp as { toMillis?: () => number }).toMillis?.() || new Date(typed.timestamp as string).getTime();
        if (now - ts < 6000) {
          users[key] = String(typed.name ?? '').replace(/[<>"&]/g, '').slice(0, 50);
        }
      });
      setTypingUsers(users);
    });

    unsubRef.current = unsub;

    return () => {
      unsub();
      unsubRef.current = null;
      setTypingUsers({});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, user?.id]);

  useEffect(() => {
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    };
  }, []);

  const broadcast = useCallback(
    async (isTyping: boolean) => {
      if (!chatId || !user) return;

      const supabase = isSupabaseConfigured() ? getSupabase() : null;

      if (supabase) {
        const payload: Record<string, unknown> = {
          id: `${chatId}_${user.id}`,
          chat_id: chatId,
          user_id: user.id,
          user_name: user.name || 'User',
          is_typing: isTyping,
          updated_at: new Date().toISOString(),
        };
        try {
          await supabase.from('typing').upsert(payload, { onConflict: 'id' });
        } catch (err: unknown) {
          if (isColumnMissingError(err)) {
            delete payload.user_name;
            await supabase.from('typing').upsert(payload, { onConflict: 'id' });
          }
        }
        return;
      }

      await setDocById('typing', chatId, {
        [user.id]: {
          name: user.name || 'User',
          timestamp: serverTimestamp(),
        },
      });
    },
    [chatId, user]
  );

  const sendTyping = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      broadcast(true);
    }
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      broadcast(false);
    }, 4000);
  }, [broadcast]);

  const stopTyping = useCallback(() => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      broadcast(false);
    }
  }, [broadcast]);

  return { typingUsers, sendTyping, stopTyping };
}
