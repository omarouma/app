import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { useGroupStore } from '@/store/useGroupStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useFilteredOnline } from '@/hooks/usePresence';
import { useChatListTyping } from '@/hooks/useChatListTyping';
import { isFirestoreAvailable, getDocById } from '@/lib/firestore';
import type { Chat } from '@/types';

type ChatListItemData = Chat & { itemType: 'direct' | 'group' };

export function useChatLogic() {
  const { user } = useAuthStore();
  const { chats, loadingChats } = useChatStore();
  const { groups, loading: loadingGroups, subscribeGroups } = useGroupStore();
  const { friends, sendRequest } = useFriendStore();
  const { filtered: visibleOnline } = useFilteredOnline(user?.id || '', friends);

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'direct' | 'groups' | 'archived'>('all');
  const [nonFriendNames, setNonFriendNames] = useState<Record<string, string>>({});
  const [nonFriendAvatars, setNonFriendAvatars] = useState<Record<string, string>>({});
  const nonFriendNamesRef = useRef<Record<string, string>>({});
  const nonFriendAvatarsRef = useRef<Record<string, string>>({});

  // Store the active subscription unsubscribers so handleRefresh can cancel them
  const activeUnsubRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (!user) return;
    // Cancel any previous subscriptions (e.g. from a prior refresh)
    activeUnsubRef.current.forEach((fn) => fn?.());
    activeUnsubRef.current = [];

    // App.tsx already subscribes to chats globally — only subscribe groups here
    const unsubGroups = subscribeGroups(user.id);
    activeUnsubRef.current = [unsubGroups].filter(
      (fn): fn is () => void => typeof fn === 'function'
    );

    return () => {
      activeUnsubRef.current.forEach((fn) => fn?.());
      activeUnsubRef.current = [];
    };
  }, [user, subscribeGroups]);

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

  const visibleChatIds = useMemo(() => filtered.map(c => c.id as string), [filtered]);
  const typingMap = useChatListTyping(visibleChatIds.join(','));

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
        // Supabase is the app's PRIMARY database — try it first. Only fall
        // back to Firestore when Supabase is unavailable. (Previously this
        // effect returned early when Firestore was unavailable, which meant
        // names/avatars were NEVER fetched in the Supabase-only production
        // setup and the chat list rendered every non-friend as "Chat".)
        const { getSupabaseSafe } = await import('@/lib/supabase');
        const supabase = getSupabaseSafe();
        const newNames: Record<string, string> = {};
        const newAvatars: Record<string, string> = {};

        if (supabase) {
          const { data, error } = await supabase
            .from('users')
            .select('id, name, avatar')
            .in('id', nonFriendIds);
          if (error) throw error;
          if (data) {
            data.forEach((u: { id: string; name?: string; avatar?: string }) => {
              newNames[u.id] = u.name || 'User';
              if (u.avatar) newAvatars[u.id] = u.avatar;
            });
          }
        } else if (isFirestoreAvailable()) {
          const results = await Promise.all(
            nonFriendIds.map(id => getDocById('users', id).catch(() => null))
          );
          results.forEach((data, i) => {
            if (data) {
              const d = data as { name?: string; avatar?: string };
              newNames[nonFriendIds[i]] = d.name || 'User';
              if (d.avatar) newAvatars[nonFriendIds[i]] = d.avatar;
            }
          });
        }

        if (!cancelled) {
          nonFriendNamesRef.current = { ...nonFriendNamesRef.current, ...newNames };
          nonFriendAvatarsRef.current = { ...nonFriendAvatarsRef.current, ...newAvatars };
          setNonFriendNames(prev => ({ ...prev, ...newNames }));
          setNonFriendAvatars(prev => ({ ...prev, ...newAvatars }));
        }
      } catch {
        // silently ignore — non-friend name fetch is best-effort
      }
    };

    fetchAndSetNonFriendNames();
    return () => { cancelled = true; };
  }, [chats, friends, user]);

  // handleRefresh cancels the current subscriptions before creating new ones
  const handleRefresh = useCallback(async () => {
    if (!user?.id) return;
    activeUnsubRef.current.forEach((fn) => fn?.());
    activeUnsubRef.current = [];
    const unsubs = [subscribeGroups(user.id)];
    activeUnsubRef.current = unsubs.filter(
      (fn): fn is () => void => typeof fn === 'function'
    );
  }, [user?.id, subscribeGroups]);

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
    nonFriendAvatars,
    visibleOnline,
    handleAddFriend,
    handleRefresh,
    activeChats,
    archivedChats,
  };
}
