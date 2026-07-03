import { useEffect, useState, useRef } from 'react';
import { getSupabaseSafe } from '@/lib/supabase';
import { isFirestoreAvailable, getDocById, setDocById, subscribeToDoc, serverTimestamp } from '@/lib/firestore';
import type { User } from '@/types';

// ─── Shared online-state bus (avoids N listeners for N components) ─────
let sharedOnlineMap: Record<string, boolean> = {};
let firebaseUnsub: (() => void) | null = null;
let listenerCount = 0;

function broadcastMap(map: Record<string, boolean>) {
  sharedOnlineMap = map;
  window.dispatchEvent(new CustomEvent('gaga-presence-sync', { detail: map }));
}

// ─── hooks ─────────────────────────────────────────────────────────────

export function useOnlineUsers() {
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>(() => ({
    ...sharedOnlineMap,
  }));

  useEffect(() => {
    const handler = (e: Event) => {
      setOnlineUsers((e as CustomEvent<Record<string, boolean>>).detail);
    };
    window.addEventListener('gaga-presence-sync', handler);
    return () => window.removeEventListener('gaga-presence-sync', handler);
  }, []);

  return { onlineUsers };
}

export function useFilteredOnline(
  currentUserId: string | undefined,
  friends: User[],
) {
  const { onlineUsers } = useOnlineUsers();
  const [filtered, setFiltered] = useState<Record<string, boolean>>({});
  const cacheRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!currentUserId) return;

    const friendIds = new Set(friends.map((f) => f.id));

    const compute = async () => {
      const result: Record<string, boolean> = {};
      const unknown: string[] = [];

      for (const [uid, online] of Object.entries(onlineUsers)) {
        if (!online) continue;
        if (uid === currentUserId || friendIds.has(uid)) {
          result[uid] = true;
        } else if (cacheRef.current[uid] === false) {
          result[uid] = true; // not hidden
        } else if (cacheRef.current[uid] === undefined) {
          unknown.push(uid);
        }
        // cacheRef.current[uid] === true means hidden → skip
      }

      if (unknown.length > 0) {
        try {
          const supabase = getSupabaseSafe();
          if (supabase) {
            const { data } = await supabase
              .from('users')
              .select('id, hide_online_status')
              .in('id', unknown);
            for (const row of data ?? []) {
              const hidden = !!row.hide_online_status;
              cacheRef.current[row.id] = hidden;
              if (!hidden) result[row.id] = true;
            }
          } else if (isFirestoreAvailable()) {
            for (const id of unknown) {
              const userData = await getDocById('users', id);
              const hidden = !!userData?.hideOnlineStatus;
              cacheRef.current[id] = hidden;
              if (!hidden) result[id] = true;
            }
          }
        } catch {
          // if check fails, assume visible
          unknown.forEach((id) => { cacheRef.current[id] = false; result[id] = true; });
        }
      }

      setFiltered(result);
    };

    compute();
  }, [onlineUsers, currentUserId, friends]);

  return { filtered };
}

export function useTrackPresence(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;

    const supabase = getSupabaseSafe();

    // ── Supabase ─────────────────────────────────────────────────────
    if (supabase) {
      let writeTimer: ReturnType<typeof setTimeout> | null = null;

      const writePresence = async (isOnline: boolean) => {
        try {
          const now = new Date().toISOString();
          await supabase
            .from('users')
            .update({ status: isOnline ? 'online' : 'offline', last_seen: now })
            .eq('id', userId);
          await supabase.from('presence').upsert(
            { user_id: userId, is_online: isOnline, last_seen: now, updated_at: now },
            { onConflict: 'user_id' },
          );
          sharedOnlineMap[userId] = isOnline;
          broadcastMap({ ...sharedOnlineMap });
        } catch { /* ignore */ }
      };

      const markOnline = () => {
        if (writeTimer) clearTimeout(writeTimer);
        writeTimer = setTimeout(() => writePresence(true), 300);
      };
      const markOffline = () => writePresence(false);

      // Subscribe to presence changes from other users
      const channel = supabase
        .channel('presence-global')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'presence' },
          ({ new: row }) => {
            const r = row as { user_id?: string; is_online?: boolean } | null;
            if (r?.user_id) {
              sharedOnlineMap[r.user_id] = !!r.is_online;
              broadcastMap({ ...sharedOnlineMap });
            }
          },
        )
        .subscribe();

      markOnline();

      const onVisibility = () => {
        if (document.visibilityState === 'hidden') {
          markOffline();
        } else {
          markOnline();
        }
      };
      window.addEventListener('beforeunload', markOffline);
      document.addEventListener('visibilitychange', onVisibility);

      return () => {
        if (writeTimer) clearTimeout(writeTimer);
        markOffline();
        supabase.removeChannel(channel);
        window.removeEventListener('beforeunload', markOffline);
        document.removeEventListener('visibilitychange', onVisibility);
      };
    }

    // ── Firebase fallback ────────────────────────────────────────────
    if (!isFirestoreAvailable()) return;

    listenerCount++;

    if (!firebaseUnsub) {
      firebaseUnsub = subscribeToDoc('presence', 'online', (data) => {
        broadcastMap(data ? (data.users ?? {}) : {});
      });
    }

    const markOnline = async () => {
      try {
        await setDocById('users', userId, { status: 'online', lastSeen: serverTimestamp() });
        await setDocById('presence', 'online', { [`users.${userId}`]: true, lastUpdated: serverTimestamp() });
      } catch { /* ignore */ }
    };

    const markOffline = async () => {
      try {
        await setDocById('users', userId, { status: 'offline', lastSeen: serverTimestamp() });
        await setDocById('presence', 'online', { [`users.${userId}`]: false, lastUpdated: serverTimestamp() });
      } catch { /* ignore */ }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        markOffline();
      } else {
        markOnline();
      }
    };

    markOnline();
    window.addEventListener('beforeunload', markOffline);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      listenerCount--;
      markOffline();
      if (listenerCount <= 0 && firebaseUnsub) { firebaseUnsub(); firebaseUnsub = null; }
      window.removeEventListener('beforeunload', markOffline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [userId]);
}
