import { useEffect, useState, useRef, useCallback } from 'react';
import { getSupabaseSafe } from '@/lib/supabase';
import { isFirestoreAvailable, getDocById, setDocById, subscribeToDoc, serverTimestamp } from '@/lib/firestore';
import type { User } from '@/types';

// ─── Unique tab ID to avoid channel name collisions across tabs ────────
const TAB_ID = Math.random().toString(36).slice(2, 8);

// ─── Shared online-state bus ───────────────────────────────────────────
let sharedOnlineMap: Record<string, boolean> = {};
let sharedPresenceInfo: Record<string, { isOnline: boolean; lastSeen: number }> = {};
let firebaseUnsub: (() => void) | null = null;
let listenerCount = 0;

const PRESENCE_STALE_MS = 90_000;

function computeOnlineMapFromInfo() {
  const now = Date.now();
  const out: Record<string, boolean> = {};
  for (const [id, info] of Object.entries(sharedPresenceInfo)) {
    if (info.isOnline && now - info.lastSeen < PRESENCE_STALE_MS) out[id] = true;
  }
  return out;
}

function syncBroadcast() {
  broadcastMap(computeOnlineMapFromInfo());
}

function broadcastMap(map: Record<string, boolean>) {
  sharedOnlineMap = { ...map };
  window.dispatchEvent(new CustomEvent('gaga-presence-sync', { detail: { ...map } }));
}

export function resetPresenceState() {
  sharedOnlineMap = {};
  sharedPresenceInfo = {};
  if (firebaseUnsub) { firebaseUnsub(); firebaseUnsub = null; }
  listenerCount = 0;
  broadcastMap({});
}

// ─── useOnlineUsers ────────────────────────────────────────────────────
export function useOnlineUsers() {
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>(() => ({ ...sharedOnlineMap }));

  useEffect(() => {
    const handler = (e: Event) => {
      setOnlineUsers((e as CustomEvent<Record<string, boolean>>).detail);
    };
    window.addEventListener('gaga-presence-sync', handler);
    return () => window.removeEventListener('gaga-presence-sync', handler);
  }, []);

  return { onlineUsers };
}

// ─── useFilteredOnline — debounced, cached privacy checks ─────────────
export function useFilteredOnline(currentUserId: string | undefined, friends: User[]) {
  const { onlineUsers } = useOnlineUsers();
  const [filtered, setFiltered] = useState<Record<string, boolean>>({});
  // Cache: true = hidden (don't show), false = visible
  const privacyCacheRef = useRef<Record<string, boolean>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const friendIdsRef = useRef<Set<string>>(new Set());

  // Keep friendIds ref in sync without triggering the effect
  useEffect(() => {
    friendIdsRef.current = new Set(friends.map((f) => f.id));
  }, [friends]);

  const compute = useCallback(async (online: Record<string, boolean>, uid: string) => {
    const result: Record<string, boolean> = {};
    const unknown: string[] = [];

    for (const [id, isOnline] of Object.entries(online)) {
      if (!isOnline) continue;
      if (id === uid || friendIdsRef.current.has(id)) {
        result[id] = true;
        continue;
      }
      const cached = privacyCacheRef.current[id];
      if (cached === false) { result[id] = true; continue; }
      if (cached === undefined) unknown.push(id);
      // cached === true means hidden → skip
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
            privacyCacheRef.current[row.id] = hidden;
            if (!hidden) result[row.id] = true;
          }
        } else if (isFirestoreAvailable()) {
          await Promise.all(unknown.map(async (id) => {
            const userData = await getDocById('users', id);
            const hidden = !!userData?.hideOnlineStatus;
            privacyCacheRef.current[id] = hidden;
            if (!hidden) result[id] = true;
          }));
        }
      } catch {
        unknown.forEach((id) => { privacyCacheRef.current[id] = false; result[id] = true; });
      }
    }

    setFiltered(result);
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    // Debounce to avoid firing on every rapid presence update
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      compute(onlineUsers, currentUserId);
    }, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [onlineUsers, currentUserId, compute]);

  return { filtered };
}

// ─── useTrackPresence ─────────────────────────────────────────────────
export function useTrackPresence(userId: string | undefined) {
  const channelRef = useRef<any>(null);
  // Monotonic counter — each effect invocation gets a unique ID so stale
  // async callbacks from a previous mount can be safely ignored.
  const mountIdRef = useRef(0);

  useEffect(() => {
    if (!userId) return;

    const supabase = getSupabaseSafe();

    // ── Supabase path ────────────────────────────────────────────────
    if (supabase) {
      // Increment mount ID — any closure that captured a previous value is stale.
      const myMountId = ++mountIdRef.current;

      let writeTimer: ReturnType<typeof setTimeout> | null = null;
      let isDestroyed = false;

      const writePresence = async (isOnline: boolean) => {
        if (isDestroyed || mountIdRef.current !== myMountId) return;
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
          sharedPresenceInfo[userId] = { isOnline, lastSeen: Date.parse(now) || Date.now() };
          syncBroadcast();
        } catch { /* ignore */ }
      };

      const markOnline = () => {
        if (writeTimer) clearTimeout(writeTimer);
        writeTimer = setTimeout(() => writePresence(true), 300);
      };
      const markOfflineLocal = () => {
        sharedPresenceInfo[userId] = { isOnline: false, lastSeen: Date.now() };
        syncBroadcast();
      };
      const markOffline = () => { markOfflineLocal(); writePresence(false).catch(() => {}); };
      const handleBeforeUnload = () => { markOffline(); };
      const handlePageHide = () => { markOffline(); };
      const onVisibility = () => {
        if (document.visibilityState === 'hidden') markOffline();
        else markOnline();
      };
      const handleOnline = () => { markOnline(); };
      const handleOffline = () => { markOfflineLocal(); };

      // Always tear down any existing channel BEFORE creating a new one.
      // This prevents the "cannot add postgres_changes callbacks after subscribe()"
      // error that occurs when React remounts the component (StrictMode or fast refresh).
      if (channelRef.current) {
        try { supabase.removeChannel(channelRef.current); } catch { /* ignore */ }
        channelRef.current = null;
      }

      // Use a unique channel name per mount to avoid Supabase reusing a
      // partially-torn-down channel from a previous render cycle.
      const channelName = `presence-${TAB_ID}-${myMountId}`;

      // Register ALL callbacks BEFORE calling .subscribe() — Supabase throws
      // if you call .on() after .subscribe().
      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'presence' },
          ({ new: row }) => {
            if (mountIdRef.current !== myMountId) return;
            const r = row as { user_id?: string; is_online?: boolean; last_seen?: string; updated_at?: string } | null;
            if (r?.user_id) {
              const ts = Date.parse(r.last_seen || r.updated_at || '') || Date.now();
              sharedPresenceInfo[r.user_id] = { isOnline: !!r.is_online, lastSeen: ts };
              syncBroadcast();
            }
          },
        );

      // Critical: call subscribe() only once after .on(...) is fully attached.
      // This eliminates the race behind:
      // "cannot add postgres_changes callbacks ... after subscribe()"
      channel.subscribe();


      channelRef.current = channel;

      markOnline();

      // Heartbeat — keeps presence alive while the tab is open & visible.
      // Without this, "online" goes stale after ~1 min even if the user is
      // actively using the app (only visibilitychange/beforeunload fire otherwise).
      const heartbeat = setInterval(() => {
        if (document.visibilityState === 'hidden') return;
        writePresence(true).catch(() => {});
      }, 30_000);

      const sweep = setInterval(() => { syncBroadcast(); }, 15_000);

      window.addEventListener('beforeunload', handleBeforeUnload);
      window.addEventListener('pagehide', handlePageHide);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      document.addEventListener('visibilitychange', onVisibility);

      return () => {
        isDestroyed = true;
        if (writeTimer) clearTimeout(writeTimer);
        clearInterval(heartbeat);
        clearInterval(sweep);
        markOffline();

        if (channelRef.current) {
          try { supabase.removeChannel(channelRef.current); } catch { /* ignore */ }
          channelRef.current = null;
        }

        window.removeEventListener('beforeunload', handleBeforeUnload);
        window.removeEventListener('pagehide', handlePageHide);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
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

    const markOffline = () => {
      setDocById('users', userId, { status: 'offline', lastSeen: serverTimestamp() }).catch(() => {});
      setDocById('presence', 'online', { [`users.${userId}`]: false, lastUpdated: serverTimestamp() }).catch(() => {});
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') markOffline();
      else { markOnline().catch(() => {}); }
    };
    const handleBeforeUnload = () => { markOffline(); };

    markOnline().catch(() => {});

    // Heartbeat — keeps presence alive while the tab is open & visible.
    const heartbeat = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      markOnline().catch(() => {});
    }, 30_000);

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      listenerCount--;
      clearInterval(heartbeat);
      markOffline();
      if (listenerCount <= 0 && firebaseUnsub) { firebaseUnsub(); firebaseUnsub = null; }
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [userId]);
}
