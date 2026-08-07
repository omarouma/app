import { useEffect, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { useFriendStore } from '@/store/useFriendStore';
import { isFirestoreAvailable, COLLECTIONS } from '@/lib/firestore';
import { isSupabaseConfigured, getSupabase } from '@/lib/supabase';

export function useChatEffects(
  chatId: string,
  userId: string,
  inputRef: RefObject<string>,
  setInput: (input: string) => void,
  setFriendStatus: (status: string) => void,
  setLastSeen: (lastSeen: string | null) => void,
  setIsChatLocked: (locked: boolean) => void,
  setChatBg: (bg: string) => void
) {
  const { user: currentUser } = useAuthStore();
  const { subscribeMessages, markAsRead, chats } = useChatStore();
  const { getFriendStatus } = useFriendStore();

  // Stable refs so Zustand method identity changes never retrigger effects
  const subscribeMessagesRef = useRef(subscribeMessages);
  const markAsReadRef = useRef(markAsRead);
  const getFriendStatusRef = useRef(getFriendStatus);
  useLayoutEffect(() => {
    subscribeMessagesRef.current = subscribeMessages;
    markAsReadRef.current = markAsRead;
    getFriendStatusRef.current = getFriendStatus;
  });

  // ── Single canonical subscription + initial markAsRead ──────────────────
  useEffect(() => {
    if (!currentUser?.id || !chatId) return;
    const uid = currentUser.id;
    const unsubscribe = subscribeMessagesRef.current(chatId);
    markAsReadRef.current(chatId, uid);
    return () => unsubscribe();
  }, [chatId, currentUser?.id]);

  // ── Re-mark as read when window regains focus (debounced) ─────────────────
  useEffect(() => {
    if (!currentUser?.id || !chatId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onFocus = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => markAsReadRef.current(chatId, currentUser.id), 1000);
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      if (timer) clearTimeout(timer);
    };
  }, [chatId, currentUser?.id]);

  // ── Friend status ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser?.id || !userId) return;
    let cancelled = false;
    getFriendStatusRef.current(currentUser.id, userId).then((status) => {
      if (!cancelled) setFriendStatus(status);
    });
    return () => { cancelled = true; };
  }, [currentUser?.id, userId, setFriendStatus]);

  // ── Draft persistence (reads from React state ref, not DOM) ─────────────
  useEffect(() => {
    if (!chatId) return;
    const draftKey = `draft_${chatId}`;
    const savedDraft = localStorage.getItem(draftKey);
    if (savedDraft) setInput(savedDraft);
    const inputRefCurrent = inputRef;
    return () => {
      const current = inputRefCurrent.current ?? '';
      if (current) {
        localStorage.setItem(draftKey, current);
      } else {
        localStorage.removeItem(draftKey);
      }
    };
  }, [chatId, setInput, inputRef]);

  // ── Last seen — realtime via Supabase, fallback to one-shot fetch ────────
  useEffect(() => {
    if (!userId) return;
    let unsub: (() => void) | null = null;

    const supabase = isSupabaseConfigured() ? getSupabase() : null;
    if (supabase) {
      // Initial fetch
      void (async () => {
        try {
          const { data } = await supabase
            .from('users')
            .select('last_seen, online')
            .eq('id', userId)
            .single();
          if (!data) return;
          setLastSeen(data.online ? 'online' : data.last_seen ? new Date(data.last_seen).toLocaleString() : null);
        } catch {
          /* ignore */
        }
      })();

      // Realtime subscription
      const channel = supabase
        .channel(`user_presence_${userId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${userId}`,
        }, (payload) => {
          const d = payload.new as Record<string, unknown>;
          setLastSeen(
            d.online ? 'online' : d.last_seen ? new Date(d.last_seen as string).toLocaleString() : null
          );
        })
        .subscribe();

      unsub = () => supabase.removeChannel(channel);
    } else {
      // Firestore fallback — one-shot
      import('@/lib/firestore').then(({ getDocById }) => {
        getDocById(COLLECTIONS.USERS, userId).then((userDoc) => {
          if (userDoc) {
            const ls = userDoc.lastSeen;
            setLastSeen(ls ? (typeof ls.toDate === 'function' ? ls.toDate().toLocaleString() : new Date(ls).toLocaleString()) : 'online');
          }
        }).catch(() => {});
      });
    }

    return () => unsub?.();
  }, [userId, setLastSeen]);

  // ── Chat lock state ──────────────────────────────────────────────────────
  useEffect(() => {
    const chat = chats.find((c) => c.id === chatId);
    if (chat?.chatLocked) setIsChatLocked(true);
  }, [chatId, chats, setIsChatLocked]);

  // ── Chat background ──────────────────────────────────────────────────────
  useEffect(() => {
    const savedBg = localStorage.getItem(`chat_bg_${chatId}`);
    if (savedBg) setChatBg(savedBg);
  }, [chatId, setChatBg]);
}
