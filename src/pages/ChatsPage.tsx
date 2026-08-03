import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Search, MessageCircle, Plus, Users, UserPlus, Archive, Check, CheckCheck,
  Mic, Image as ImageIcon, Video, FileText, MapPin, BarChart3, Wallet, User, Pin
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useFilteredOnline } from '@/hooks/usePresence';
import { useChatStore } from '@/store/useChatStore';
import { useGroupStore } from '@/store/useGroupStore';
import { useFriendStore } from '@/store/useFriendStore';
import { usePageTitle } from '@/hooks/useDocumentTitle';
import { useChatListTyping } from '@/hooks/useChatListTyping';
import EmptyState from '@/components/EmptyState';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import { formatTime, getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
import { isFirestoreAvailable, getDocById } from '@/lib/firestore';
import { toast } from 'sonner';
import type { Message } from '@/types';

// Static icon lookup — avoids recreating JSX elements on every render
const MSG_ICONS: Record<string, React.ReactNode> = {
  image: <ImageIcon size={14} className="shrink-0" />,
  video: <Video size={14} className="shrink-0" />,
  voice: <Mic size={14} className="shrink-0" />,
  file: <FileText size={14} className="shrink-0" />,
  location: <MapPin size={14} className="shrink-0" />,
  poll: <BarChart3 size={14} className="shrink-0" />,
  money_transfer: <Wallet size={14} className="shrink-0" />,
  contact_card: <User size={14} className="shrink-0" />,
};

const MSG_TEXT: Record<string, string> = {
  image: 'Photo',
  video: 'Video',
  voice: 'Voice message',
  location: 'Location',
  poll: 'Poll',
  money_transfer: 'Transfer',
  contact_card: 'Contact',
};

/** Format the last message preview with type icon and delivery status */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatLastMessage(chat: any, currentUserId?: string): {
  text: string;
  icon: React.ReactNode | null;
  isMe: boolean;
  readStatus: 'none' | 'sent' | 'delivered' | 'read';
} {
  const lastMsg = chat.lastMessage;
  let text = 'No messages yet';
  let icon: React.ReactNode | null = null;
  let isMe = false;
  let readStatus: 'none' | 'sent' | 'delivered' | 'read' = 'none';

  if (!lastMsg) return { text, icon, isMe, readStatus };

  if (typeof lastMsg === 'object' && lastMsg !== null) {
    const msg = lastMsg as Message;
    isMe = msg.senderId === currentUserId;
    readStatus = msg.read ? 'read' : isMe ? 'delivered' : 'none';

    if (msg.type === 'file') {
      text = msg.content || 'File';
      icon = MSG_ICONS.file;
    } else if (MSG_ICONS[msg.type]) {
      text = MSG_TEXT[msg.type] || msg.type;
      icon = MSG_ICONS[msg.type];
    } else {
      text = msg.content || '';
    }
  } else if (typeof lastMsg === 'string') {
    isMe = chat.lastMessageSenderId === currentUserId;
    if (lastMsg.includes('📷') || lastMsg.includes('Photo')) {
      text = 'Photo'; icon = MSG_ICONS.image;
    } else if (lastMsg.includes('🎥') || lastMsg.includes('Video')) {
      text = 'Video'; icon = MSG_ICONS.video;
    } else if (lastMsg.includes('🎤') || lastMsg.includes('Voice')) {
      text = 'Voice message'; icon = MSG_ICONS.voice;
    } else if (lastMsg.startsWith('Shared contact:')) {
      text = 'Contact'; icon = MSG_ICONS.contact_card;
    } else {
      text = lastMsg;
    }
    if (chat.lastMessageRead) readStatus = 'read';
    else if (isMe) readStatus = 'delivered';
  }

  return { text, icon, isMe, readStatus };
}

export default function ChatsPage() {
  const navigate = useNavigate();
  usePageTitle('Chats');
  const { user } = useAuthStore();
  const { chats, loadingChats, subscribeChats, unarchiveChat } = useChatStore();
  const { groups, loading: loadingGroups, subscribeGroups } = useGroupStore();
  const { friends, sendRequest } = useFriendStore();
  const { filtered: visibleOnline } = useFilteredOnline(user?.id || '', friends);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'direct' | 'groups' | 'archived'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const nonFriendNamesRef = useRef<Record<string, string>>({});
  const [nonFriendNames, setNonFriendNames] = useState<Record<string, string>>({});
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs to re-invoke subscriptions on manual refresh
  const subscribeChatsRef = useRef(subscribeChats);
  const subscribeGroupsRef = useRef(subscribeGroups);
  subscribeChatsRef.current = subscribeChats;
  subscribeGroupsRef.current = subscribeGroups;

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, []);

  const unsubChatsRef = useRef<(() => void) | null>(null);
  const unsubGroupsRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!user) return;
    unsubChatsRef.current = subscribeChats(user.id);
    unsubGroupsRef.current = subscribeGroups(user.id);
    return () => { unsubChatsRef.current?.(); unsubGroupsRef.current?.(); };
  }, [user, subscribeChats, subscribeGroups]);

  // Memoised derived lists
  const allChats = useMemo(() => {
    const map = new Map<string, typeof chats[0] & { itemType: 'direct' | 'group' }>();
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

    return base.filter(c => {
      if (activeTab === 'direct') return c.itemType === 'direct';
      if (activeTab === 'groups') return c.itemType === 'group';
      return true;
    }).filter(c => {
      if (!search) return true;
      if (c.type === 'group') return c.name?.toLowerCase().includes(search.toLowerCase());
      const otherId = c.participants.find(p => p !== user?.id) || '';
      const f = friends.find(fr => fr.id === otherId);
      const name = f?.name || nonFriendNames[otherId] || 'Chat';
      return name.toLowerCase().includes(search.toLowerCase());
    });
  }, [activeTab, search, archivedChats, pinnedChats, unpinnedChats, activeChats, friends, nonFriendNames, user?.id]);

  const totalUnread = useMemo(
    () => activeChats.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
    [activeChats]
  );

  // Typing indicators for visible chats
  const visibleChatIds = useMemo(() => filtered.map(c => c.id), [filtered]);
  const typingMap = useChatListTyping(visibleChatIds);

  const handleRefresh = useCallback(() => {
    if (!user?.id || refreshing) return;
    setRefreshing(true);
    // Unsubscribe old listeners before re-subscribing to prevent leaks
    unsubChatsRef.current?.();
    unsubGroupsRef.current?.();
    unsubChatsRef.current = subscribeChatsRef.current(user.id);
    unsubGroupsRef.current = subscribeGroupsRef.current(user.id);
    refreshTimeoutRef.current = setTimeout(() => setRefreshing(false), 800);
  }, [user?.id, refreshing]);

  // Pull-to-refresh touch handler — stored in a ref so the listener can be
  // properly removed even when the threshold is never met.
  const touchStartRef = useRef<{ startY: number; el: HTMLDivElement } | null>(null);
  const touchMoveHandlerRef = useRef<((e: TouchEvent) => void) | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop > 0) return;
    const startY = e.touches[0].clientY;
    touchStartRef.current = { startY, el };

    const handleMove = (me: TouchEvent) => {
      if (!touchStartRef.current) return;
      if (me.touches[0].clientY - touchStartRef.current.startY > 80) {
        handleRefresh();
        if (touchMoveHandlerRef.current) {
          el.removeEventListener('touchmove', touchMoveHandlerRef.current);
          touchMoveHandlerRef.current = null;
        }
      }
    };
    touchMoveHandlerRef.current = handleMove;
    el.addEventListener('touchmove', handleMove);
  }, [handleRefresh]);

  const handleTouchEnd = useCallback(() => {
    if (touchStartRef.current && touchMoveHandlerRef.current) {
      touchStartRef.current.el.removeEventListener('touchmove', touchMoveHandlerRef.current);
      touchMoveHandlerRef.current = null;
    }
    touchStartRef.current = null;
  }, []);

  useEffect(() => {
    if (!user || !chats.length) return;
    const nonFriendIds = chats
      .filter(c => c.type !== 'group')
      .map(c => c.participants.find(p => p !== user.id))
      .filter((id): id is string => !!id && !friends.find(f => f.id === id) && !nonFriendNamesRef.current[id]);

    if (!nonFriendIds.length) return;
    let cancelled = false;
    const load = async () => {
      try {
        if (!isFirestoreAvailable()) return;
        const { getSupabaseSafe } = await import('@/lib/supabase');
        const supabase = getSupabaseSafe();
        if (supabase) {
          const { data } = await supabase
            .from('users')
            .select('id, name')
            .in('id', nonFriendIds);
          if (!cancelled && data) {
            const names: Record<string, string> = {};
            data.forEach((u: { id: string; name?: string }) => { names[u.id] = u.name || 'User'; });
            nonFriendNamesRef.current = { ...nonFriendNamesRef.current, ...names };
            setNonFriendNames(prev => ({ ...prev, ...names }));
          }
        } else {
          const results = await Promise.all(
            nonFriendIds.map(id => getDocById('users', id).catch(() => null))
          );
          if (!cancelled) {
            const names: Record<string, string> = {};
            results.forEach((data, i) => { if (data) names[nonFriendIds[i]] = (data as { name?: string }).name || 'User'; });
            nonFriendNamesRef.current = { ...nonFriendNamesRef.current, ...names };
            setNonFriendNames(prev => ({ ...prev, ...names }));
          }
        }
      } catch { /* ignore */ }
    };
    load();
    return () => { cancelled = true; };
  }, [chats, friends, user]);

  return (
    <div className="h-[100dvh] bg-white flex flex-col relative page-enter">
      {/* Header */}
      <div className="shrink-0 px-5 pt-5 pb-3 flex justify-between items-center">
        <div>
          <h1 className="text-[26px] font-bold text-[#111111] tracking-tight">Chats</h1>
          {totalUnread > 0 && (
            <p className="text-[#00C300] text-xs font-semibold mt-0.5">
              {totalUnread} unread message{totalUnread !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="flex gap-2 text-[#111111]">
          <button type="button" onClick={() => navigate('/add-friends')}
            className="w-9 h-9 flex items-center justify-center bg-[#F5F5F5] hover:bg-[#EBEBEB] rounded-full transition-colors tap-scale"
            aria-label="Add friends"
          >
            <UserPlus size={18} strokeWidth={1.8} />
          </button>
          <button type="button" onClick={() => navigate('/create-group')}
            className="w-9 h-9 flex items-center justify-center bg-[#F5F5F5] hover:bg-[#EBEBEB] rounded-full transition-colors tap-scale"
            aria-label="Create new group"
          >
            <Plus size={18} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="shrink-0 px-4 pb-2">
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#ADADAD]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search chats…"
            className="w-full bg-[#F5F5F5] rounded-2xl pl-10 pr-4 py-2.5 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]/40 placeholder:text-[#ADADAD] transition-shadow"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex gap-2 px-4 pb-2 overflow-x-auto scrollbar-hide">
        {(['all', 'direct', 'groups', 'archived'] as const).map(tab => (
          <button type="button" key={tab}
            onClick={() => setActiveTab(tab)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all tap-scale ${
              activeTab === tab
                ? 'bg-[#111111] text-white shadow-sm'
                : 'bg-[#F5F5F5] text-[#8D8D8D] hover:text-[#111111]'
            }`}
          >
            {tab === 'all' ? `All${activeChats.length ? ` (${activeChats.length})` : ''}` : tab === 'direct' ? 'Direct' : tab === 'groups' ? 'Groups' : `Archived${archivedChats.length ? ` (${archivedChats.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* Chat List */}
      <div
        className="flex-1 overflow-y-auto scrollbar-hide scroll-smooth relative pb-nav"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {/* Pull to refresh indicator */}
        {refreshing && (
          <div className="flex justify-center py-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-5 h-5 border-2 border-[#00C300] border-t-transparent rounded-full"
            />
          </div>
        )}

        {loadingChats || loadingGroups ? (
          <LoadingSkeleton count={4} variant="list" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={activeTab === 'groups' ? Users : activeTab === 'archived' ? Archive : MessageCircle}
            title={activeTab === 'groups' ? 'No groups yet' : activeTab === 'archived' ? 'No archived chats' : search ? 'No results found' : 'No conversations yet'}
            description={activeTab === 'groups' ? 'Create a group to start chatting' : activeTab === 'archived' ? 'Long press a chat to archive it' : 'Start a conversation with friends'}
            action={
              activeTab === 'groups' ? (
                <button type="button" onClick={() => navigate('/create-group')}
                  className="bg-[#00C300] text-white text-sm font-medium px-4 py-2 rounded-full active:bg-[#00A300] transition-colors"
                >
                  Create Group
                </button>
              ) : activeTab === 'archived' ? null : (
                <button type="button" onClick={() => navigate('/contacts')}
                  className="bg-[#00C300] text-white text-sm font-medium px-4 py-2 rounded-full active:bg-[#00A300] transition-colors"
                >
                  Start Chatting
                </button>
              )
            }
          />
        ) : (
          filtered.map((chat, i) => {
            const isGroup = chat.type === 'group';
            const otherId = isGroup ? '' : (chat.participants.find(p => p !== user?.id) || '');
            const f = friends.find(fr => fr.id === otherId);
            const isFriend = !!f;
            const name = isGroup ? (chat.name || 'Group') : (f?.name || nonFriendNames[otherId] || 'Chat');
            const avatar = isGroup ? (chat.avatar || '') : (f?.avatar || '');
            const hasUnread = (chat.unreadCount || 0) > 0;
            const isPinned = !!chat.pinned;
            const isOnline = !isGroup && visibleOnline[otherId];
            const typingName = typingMap[chat.id];

            const { text: lastMsgText, icon: msgIcon, isMe: isLastMsgFromMe, readStatus } = formatLastMessage(chat, user?.id);

            const handleAddFriend = async (e: React.MouseEvent) => {
              e.stopPropagation();
              if (!user?.id || !otherId) return;
              try {
                await sendRequest(otherId, user.id);
                toast.success('Friend request sent');
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Failed to send request');
              }
            };

            return (
              <motion.button
                key={chat.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.025, 0.25) }}
                onClick={() => navigate(isGroup ? `/group/${chat.id}` : `/chat/${otherId}`)}
                className={`w-full flex items-center px-4 py-3 active:bg-[#F5F5F5] transition-colors text-left press-scale ${
                  hasUnread ? 'bg-[#00C300]/[0.04]' : ''
                }`}
              >
                {/* Avatar with badges */}
                <div className="relative w-[52px] h-[52px] rounded-2xl flex items-center justify-center shrink-0 overflow-hidden mr-3.5 bg-[#F5F5F5]">
                  {sanitizeMediaUrl(avatar) ? (
                    <img src={sanitizeMediaUrl(avatar)} className="w-full h-full object-cover" alt="User avatar" />
                  ) : isGroup ? (
                    <Users size={22} className="text-[#00C300]" />
                  ) : (
                    <img src={getDefaultAvatar(otherId || name)} className="w-full h-full object-cover" alt="User avatar" />
                  )}
                  {isOnline && (
                    <div className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-[#00C300] rounded-full border-2 border-white" />
                  )}
                  {isPinned && (
                    <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-[#FFD700] rounded-full flex items-center justify-center border border-white">
                      <Pin size={8} className="text-white" />
                    </div>
                  )}
                </div>

                {/* Chat info */}
                <div className="flex-1 min-w-0 border-b border-[#F0F0F0] pb-3">
                  {/* Name row */}
                  <div className="flex justify-between items-center mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h3 className={`text-[15px] truncate leading-snug ${
                        hasUnread ? 'font-bold text-[#111111]' : 'font-medium text-[#111111]'
                      }`}>{name}</h3>
                      {isGroup && (
                        <span className="text-[9px] bg-[#00C300]/10 text-[#00C300] px-1.5 py-0.5 rounded-full font-semibold shrink-0 uppercase tracking-wide">
                          Group
                        </span>
                      )}
                      {!isGroup && !isFriend && (
                        <span className="text-[9px] bg-[#FF9800]/10 text-[#FF9800] px-1.5 py-0.5 rounded-full font-semibold shrink-0">
                          Not Friends
                        </span>
                      )}
                    </div>
                    <span className={`text-[11px] shrink-0 ml-2 ${
                      hasUnread ? 'text-[#00C300] font-bold' : 'text-[#ADADAD]'
                    }`}>{formatTime(chat.updatedAt)}</span>
                  </div>

                  {/* Message preview / typing indicator row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className={`flex items-center gap-1 min-w-0 ${
                      hasUnread ? 'text-[#111111] font-medium' : 'text-[#ADADAD]'
                    }`}>
                      {typingName ? (
                        <p className="text-[13px] truncate text-[#00C300] italic">{typingName} is typing…</p>
                      ) : (
                        <>
                          {isLastMsgFromMe && readStatus !== 'none' && (
                            <span className="shrink-0">
                              {readStatus === 'read' ? (
                                <CheckCheck size={13} className="text-[#2196F3]" />
                              ) : (
                                <Check size={13} className="text-[#ADADAD]" />
                              )}
                            </span>
                          )}
                          {msgIcon && <span className="text-[#ADADAD]">{msgIcon}</span>}
                          <p className="text-[13px] truncate">{lastMsgText}</p>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!isGroup && !isFriend && (
                        <button type="button" onClick={handleAddFriend}
                          className="px-2.5 py-1 bg-[#00C300] text-white text-[10px] rounded-full font-semibold active:bg-[#00A300] transition-colors tap-scale"
                        >
                          Add
                        </button>
                      )}
                      {hasUnread && (
                        <span className="bg-[#FF3B30] text-white text-[11px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 badge-pulse">
                          {(chat.unreadCount ?? 0) > 99 ? '99+' : chat.unreadCount}
                        </span>
                      )}
                      {chat.archived && (
                        <button type="button" onClick={(e) => {
                            e.stopPropagation();
                            unarchiveChat(chat.id);
                            toast.success('Chat unarchived');
                          }}
                          className="p-1.5 hover:bg-[#F5F5F5] rounded-full text-[#ADADAD] transition-colors"
                          title="Unarchive"
                        >
                          <Archive size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.button>
            );
          })
        )}
      </div>

      {/* Floating New Chat Button */}
      <button type="button" onClick={() => navigate('/contacts')}
        className="absolute bottom-[76px] right-4 w-14 h-14 bg-[#00C300] text-white rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-all z-30 tap-scale"
        title="New Chat"
        aria-label="New Chat"
      >
        <MessageCircle size={22} strokeWidth={2} />
      </button>
    </div>
  );
}
