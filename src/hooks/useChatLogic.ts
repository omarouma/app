import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { useGroupStore } from '@/store/useGroupStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useFilteredOnline } from '@/hooks/usePresence';
import { useChatListTyping } from '@/hooks/useChatListTyping';
import { isFirestoreAvailable, getDocById } from '@/lib/firestore';

export function useChatLogic() {
  const { user } = useAuthStore();
  const { chats, loadingChats, subscribeChats } = useChatStore();
  const { groups, loading: loadingGroups, subscribeGroups } = useGroupStore();
  const { friends, sendRequest } = useFriendStore();
  const { filtered: visibleOnline } = useFilteredOnline(user?.id || '', friends);

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'direct' | 'groups' | 'archived'>('all');
  const [nonFriendNames, setNonFriendNames] = useState<Record<string, string>>({});
  const nonFriendNamesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    const unsubChats = subscribeChats(user.id);
    const unsubGroups = subscribeGroups(user.id);
    return () => {
      unsubChats?.();
      unsubGroups?.();
    };
  }, [user, subscribeChats, subscribeGroups]);

  const allChats = useMemo(() => {
    const map = new Map<string, any>();
    chats.forEach(c => map.set(c.id, { ...c, itemType: 'direct' as const }));
    groups.forEach(g => map.set(g.id, { ...g, itemType: 'group' as const }));
    return Array.from(map.values()).sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [chats, groups]);

  const activeChats = useMemo(() => allChats.filter(c => !c.archived), [allChats]);
  const archivedChats = useMemo(() => allChats.filter(c => c.archived), [allChats]);
  const pinnedChats = useMemo(() => activeChats.filter(c => c.pinned), [activeChats]);
  const unpinnedChats = useMemo(() => activeChats.filter(c => !c.pinned), [activeChats]);

  const filtered = useMemo(() => {
    const base =
      activeTab === 'archived' ? archivedChats :
      activeTab === 'all' && !search ? [...pinnedChats, ...unpinnedChats] :
      activeChats;

    const filterFunctions = {
      direct: (c: any) => c.itemType === 'direct',
      groups: (c: any) => c.itemType === 'group',
      all: () => true,
      archived: () => true,
    };

    const searchFilter = (c: any) => {
      if (!search) return true;
      if (c.type === 'group') return c.name?.toLowerCase().includes(search.toLowerCase());
      const otherId = c.participants.find((p: string) => p !== user?.id) || '';
      const f = friends.find((fr: any) => fr.id === otherId);
      const name = f?.name || nonFriendNames[otherId] || 'Chat';
      return name.toLowerCase().includes(search.toLowerCase());
    };

    return base.filter(filterFunctions[activeTab]).filter(searchFilter);
  }, [activeTab, search, archivedChats, pinnedChats, unpinnedChats, activeChats, friends, nonFriendNames, user?.id]);

  const totalUnread = useMemo(
    () => activeChats.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
    [activeChats]
  );

  const visibleChatIds = useMemo(() => filtered.map(c => c.id), [filtered]);
  const typingMap = useChatListTyping(visibleChatIds.join(','));

  const handleAddFriend = useCallback(async (friendId: string) => {
    if (!user?.id) throw new Error("You must be logged in to add friends.");
    await sendRequest(friendId, user.id);
  }, [user?.id, sendRequest]);

  useEffect(() => {
    if (!user || !chats.length) return;

    const nonFriendIds = chats
      .filter(c => c.type !== 'group')
      .map(c => c.participants.find(p => p !== user.id))
      .filter((id): id is string => !!id && !friends.find(f => f.id === id) && !nonFriendNamesRef.current[id]);

    if (nonFriendIds.length === 0) return;

    let cancelled = false;

    const fetchAndSetNonFriendNames = async () => {
      try {
        if (!isFirestoreAvailable()) return;

        const { getSupabaseSafe } = await import('@/lib/supabase');
        const supabase = getSupabaseSafe();

        const newNames: Record<string, string> = {};

        if (supabase) {
          const { data } = await supabase.from('users').select('id, name').in('id', nonFriendIds);
          if (data) {
            data.forEach((u: { id: string; name?: string }) => {
              newNames[u.id] = u.name || 'User';
            });
          }
        } else {
          const results = await Promise.all(
            nonFriendIds.map(id => getDocById('users', id).catch(() => null))
          );
          results.forEach((data, i) => {
            if (data) {
              newNames[nonFriendIds[i]] = (data as { name?: string }).name || 'User';
            }
          });
        }

        if (!cancelled) {
          nonFriendNamesRef.current = { ...nonFriendNamesRef.current, ...newNames };
          setNonFriendNames(prev => ({ ...prev, ...newNames }));
        }
      } catch (error) {
        console.error("Error fetching non-friend names:", error);
      }
    };

    fetchAndSetNonFriendNames();

    return () => {
      cancelled = true;
    };
  }, [chats, friends, user]);

const refreshUnsubRef = useRef<Array<() => void>>([]);

  const handleRefresh = useCallback(async () => {
    if (!user?.id) return;
    // Clean up any previous refresh subscriptions before creating new ones
    refreshUnsubRef.current.forEach((fn) => fn?.());
    refreshUnsubRef.current = [];
    const unsubs = await Promise.all([
      subscribeChats(user.id),
      subscribeGroups(user.id),
    ]);
    refreshUnsubRef.current = unsubs.filter(
      (fn): fn is () => void => typeof fn === 'function'
    );
  }, [user?.id, subscribeChats, subscribeGroups]);

  // Clean up refresh subscriptions on unmount
  useEffect(() => {
    return () => {
      refreshUnsubRef.current.forEach((fn) => fn?.());
      refreshUnsubRef.current = [];
    };
  }, []);

  return {
    user,
    search,
    setSearch,
    activeTab,
    setActiveTab,
    loading: loadingChats || loadingGroups,
    filtered,
    totalUnread,
    typingMap,
    friends,
    nonFriendNames,
    visibleOnline,
    handleAddFriend,
    handleRefresh,
    activeChats,
    archivedChats,
  };
}
