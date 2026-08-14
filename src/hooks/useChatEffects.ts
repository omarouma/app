import { useEffect, useRef, useLayoutEffect } from 'react';
import type { RefObject } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { useFriendStore } from '@/store/useFriendStore';
import { isFirestoreAvailable, COLLECTIONS } from '@/lib/firestore';
import { isSupabaseConfigured, getSupabase } from '@/lib/supabase';
import { safeGetStorageItem, safeRemoveStorageItem, safeSetStorageItem } from '@/lib/safeStorage';

function formatLastSeen(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

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

  // Stable refs to avoid re-subscription loops
  const subscribeMessagesRef = useRef(subscribeMessages);
  const markAsReadRef = useRef(markAsRead);
  useLayoutEffect(() => {
    subscribeMessagesRef.current = subscribeMessages;
    markAsReadRef.current = markAsRead;
  });

  // ── Single canonical subscription + initial markAsRead ──────────────────
  useEffect(() => {
    if (!currentUser?.id || !chatId) return;
    const unsubscribe = subscribeMessagesRef.current(chatId);
    markAsReadRef.current(chatId, currentUser.id);
    return () => unsubscribe();
  }, [chatId, currentUser?.id]);

  // ── Re-mark as read when window regains focus or page becomes visible ────
  useEffect(() => {
    if (!currentUser?.id || !chatId) return;
    const onFocus = () => markAsReadRef.current(chatId, currentUser.id);
    const onVisibility = () => { if (document.visibilityState === 'visible') markAsReadRef.current(chatId, currentUser.id); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [chatId, currentUser?.id]);

// ── Friend status ────────────────────────────────────────────────────────
  const getFriendStatusRef = useRef(getFriendStatus);
  useLayoutEffect(() => {
    getFriendStatusRef.current = getFriendStatus;
  });
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
    const savedDraft = safeGetStorageItem(draftKey);
    if (savedDraft) setInput(savedDraft);
    const inputRefCurrent = inputRef;
    return () => {
      const current = inputRefCurrent.current ?? '';
      if (current) {
        safeSetStorageItem(draftKey, current);
      } else {
        safeRemoveStorageItem(draftKey);
      }
    };
  }, [chatId, setInput, inputRef]);

  // ── Last seen — realtime via Supabase, fallback to one-shot fetch ────────
  useEffect(() => {
    if (!userId || !isFirestoreAvailable()) return;
    let unsub: (() => void) | null = null;

const supabase = isSupabaseConfigured() ? getSupabase() : null;
    if (supabase) {
// Initial fetch
      void (async () => {
        try {
          const { data } = await supabase
            .from('users')
            .select('status, last_seen')
            .eq('id', userId)
            .single();
          if (!data) return;
          const d = data as { status?: string; last_seen?: string };
          setLastSeen(d.status === 'online' ? 'online' : d.last_seen ? formatLastSeen(new Date(d.last_seen)) : null);
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
            d.status === 'online' ? 'online' : d.last_seen ? formatLastSeen(new Date(d.last_seen as string)) : null
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
    const savedBg = safeGetStorageItem(`chat_bg_${chatId}`);
    if (savedBg) setChatBg(savedBg);
  }, [chatId, setChatBg]);
}
