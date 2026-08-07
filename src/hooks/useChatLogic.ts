import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { useGroupStore } from '@/store/useGroupStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useFilteredOnline } from '@/hooks/usePresence';
import { useChatListTyping } from '@/hooks/useChatListTyping';
import { COLLECTIONS, queryCollection, where } from '@/lib/firestore';
import type { Chat } from '@/types';

type ChatListItemData = Chat & { itemType: 'direct' | 'group' };

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

  // Store the active subscription unsubscribers so handleRefresh can cancel them
  const activeUnsubRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (!user) return;
    activeUnsubRef.current.forEach((fn) => fn?.());
    activeUnsubRef.current = [];

    const unsubChats = subscribeChats(user.id);
    const unsubGroups = subscribeGroups(user.id);
    activeUnsubRef.current = [unsubChats, unsubGroups].filter(
      (fn): fn is () => void => typeof fn === 'function'
    );

    return () => {
      activeUnsubRef.current.forEach((fn) => fn?.());
      activeUnsubRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const allChats = useMemo<ChatListItemData[]>(() => {
    const map = new Map<string, ChatListItemData>();
    chats.forEach(c => map.set(c.id, { ...c, itemType: 'direct' as const }));
    groups.forEach(g => map.set(g.id, { ...g, itemType: 'group' as const }));
    return Array.from(map.values()).sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt as string).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt as string).getTime() : 0;
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

    const filterFunctions: Record<string, (c: ChatListItemData) => boolean> = {
      direct: (c) => c.itemType === 'direct',
      groups: (c) => c.itemType === 'group',
      all: () => true,
      archived: () => true,
    };

    const searchFilter = (c: ChatListItemData) => {
      if (!search) return true;
      if (c.type === 'group') return (c.name as string)?.toLowerCase().includes(search.toLowerCase());
      const participants = c.participants as string[];
      const otherId = participants.find((p) => p !== user?.id) || '';
      const f = friends.find((fr) => fr.id === otherId);
      const name = f?.name || nonFriendNames[otherId] || 'Chat';
      return name.toLowerCase().includes(search.toLowerCase());
    };

    return base.filter(filterFunctions[activeTab]).filter(searchFilter);
  }, [activeTab, search, archivedChats, pinnedChats, unpinnedChats, activeChats, friends, nonFriendNames, user?.id]);

  const totalUnread = useMemo(
    () => activeChats.reduce((sum, c) => sum + ((c.unreadCount as number) || 0), 0),
    [activeChats]
  );

  const typingKey = useMemo(() => filtered.map(c => c.id as string).join(','), [filtered]);
  const typingMap = useChatListTyping(typingKey);

  const handleAddFriend = useCallback(async (friendId: string) => {
    if (!user?.id) throw new Error('You must be logged in to add friends.');
    await sendRequest(friendId, user.id);
  }, [user?.id, sendRequest]);

  // Fetch names for non-friend chat participants
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
        const data = await queryCollection(COLLECTIONS.USERS, [where('id', 'in', nonFriendIds)]);
        if (!cancelled && data) {
          const newNames: Record<string, string> = {};
          data.forEach((u: Record<string, unknown>) => {
            if (typeof u.id === 'string') newNames[u.id] = (u.name as string) || 'User';
          });
          nonFriendNamesRef.current = { ...nonFriendNamesRef.current, ...newNames };
          setNonFriendNames(prev => ({ ...prev, ...newNames }));
        }
      } catch (error) {
        console.error('Error fetching non-friend names:', error);
      }
    };

    fetchAndSetNonFriendNames();
    return () => { cancelled = true; };
  }, [chats, friends, user]);

  const handleRefresh = useCallback(async () => {
    if (!user?.id) return;
    // Subscriptions are already real-time — just force a fresh snapshot without reconnecting
    await queryCollection(COLLECTIONS.CHATS, [where('participants', 'array-contains', user.id)]);
  }, [user?.id]);

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
