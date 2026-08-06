import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { isSupabaseConfigured, getSupabase } from '@/lib/supabase';
import { setDocById, subscribeToDoc, serverTimestamp } from '@/lib/firestore';

interface TypingUser {
  name: string;
  timestamp: number;
}

interface TypingState {
  [userId: string]: TypingUser;
}

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
  const [typingState, setTypingState] = useState<TypingState>({});
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const setupSubscription = useCallback((
    onTypingEvent: (userId: string, name: string, isTyping: boolean, timestamp: number) => void,
    fetchUserName: (userId: string) => Promise<string | undefined>
  ) => {
    if (!chatId || !user) return () => {};

    const supabase = isSupabaseConfigured() ? getSupabase() : null;

    if (supabase) {
      const channel = supabase
        .channel(`typing-${chatId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'typing', filter: `chat_id=eq.${chatId}` }, async (payload) => {
          const data = payload.new as any;
          if (!data || data.user_id === user.id) return;

          const ts = new Date(data.updated_at).getTime();
          const userName = data.user_name || await fetchUserName(data.user_id) || 'User';
          onTypingEvent(data.user_id, userName, data.is_typing, ts);
        })
        .subscribe();
      return () => supabase.removeChannel(channel);
    }

    // Firebase fallback
    return subscribeToDoc('typing', chatId, (data) => {
      if (!data) return;
      const now = Date.now();
      Object.entries(data).forEach(([key, value]) => {
        if (key === 'id' || key === user.id) return;
        const typed = value as { name: string; timestamp: unknown };
        if (!typed || typeof typed !== 'object') return;
        const ts = (typed.timestamp as { toMillis?: () => number })?.toMillis?.() || new Date(typed.timestamp as string).getTime();
        onTypingEvent(key, typed.name, now - ts < 6000, ts);
      });
    });
  }, [chatId, user]);

  useEffect(() => {
    const userNameCache = new Map<string, string>();
    const fetchUserName = async (userId: string): Promise<string | undefined> => {
      if (userNameCache.has(userId)) return userNameCache.get(userId);
      const supabase = isSupabaseConfigured() ? getSupabase() : null;
      if (!supabase) return undefined;
      try {
        const { data } = await supabase.from('users').select('name').eq('id', userId).single();
        if (data?.name) {
          userNameCache.set(userId, data.name);
          return data.name;
        }
      } catch { /* noop */ }
      return undefined;
    };

    const handleTypingEvent = (userId: string, name: string, isTyping: boolean, timestamp: number) => {
      const sanitizedName = String(name).replace(/[<>"&]/g, '').slice(0, 50);
      setTypingState(prev => {
        const now = Date.now();
        if (isTyping && now - timestamp < 6000) {
          if (prev[userId]?.name === sanitizedName) return prev;
          return { ...prev, [userId]: { name: sanitizedName, timestamp } };
        }
        if (prev[userId]) {
          const next = { ...prev };
          delete next[userId];
          return next;
        }
        return prev;
      });
    };

    const unsub = setupSubscription(handleTypingEvent, fetchUserName);

    return () => {
      unsub();
      setTypingState({});
    };
  }, [setupSubscription]);

  useEffect(() => {
    if (!chatId || !user) return;
    const interval = setInterval(() => {
      setTypingState(prev => {
        const now = Date.now();
        let changed = false;
        const next = { ...prev };
        for (const id in next) {
          if (now - next[id].timestamp >= 6000) {
            delete next[id];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [chatId, user]);

  const broadcast = useCallback(async (isTyping: boolean) => {
    if (!chatId || !user) return;
    const supabase = isSupabaseConfigured() ? getSupabase() : null;

    if (supabase) {
      const payload = {
        id: `${chatId}_${user.id}`,
        chat_id: chatId,
        user_id: user.id,
        user_name: user.name || 'User',
        is_typing: isTyping,
        updated_at: new Date().toISOString(),
      };
      try {
        await supabase.from('typing').upsert(payload, { onConflict: 'id' });
      } catch (err) {
if (isColumnMissingError(err)) {
          const rest = { ...payload };
          delete (rest as { user_name?: string }).user_name;
          await supabase.from('typing').upsert(rest, { onConflict: 'id' });
        }
      }
    } else {
      await setDocById('typing', chatId, {
        [user.id]: isTyping ? { name: user.name || 'User', timestamp: serverTimestamp() } : null,
      }, true);
    }
  }, [chatId, user]);

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
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (isTypingRef.current) {
      isTypingRef.current = false;
      broadcast(false);
    }
  }, [broadcast]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') stopTyping();
    };
    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', stopTyping);
    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', stopTyping);
      stopTyping();
    };
  }, [stopTyping]);

  const typingUsers = useMemo(() => {
    const result: Record<string, string> = {};
    for (const id in typingState) {
      result[id] = typingState[id].name;
    }
    return result;
  }, [typingState]);

  return { typingUsers, sendTyping, stopTyping };
}