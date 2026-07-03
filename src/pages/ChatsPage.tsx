import { useState, useEffect, useCallback, useRef } from 'react';
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
import BottomNav from '@/components/layout/BottomNav';
import EmptyState from '@/components/EmptyState';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import { formatTime, getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
import { isFirestoreAvailable, getDocById } from '@/lib/firestore';
import { toast } from 'sonner';
import type { Message } from '@/types';

/** Format the last message preview with type icon and delivery status */
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

  // If lastMessage is a Message object
  if (typeof lastMsg === 'object' && lastMsg !== null) {
    const msg = lastMsg as Message;
    isMe = msg.senderId === currentUserId;
    readStatus = msg.read ? 'read' : isMe ? 'delivered' : 'none';

    switch (msg.type) {
      case 'image':
        text = 'Photo';
        icon = <ImageIcon size={14} className="shrink-0" />;
        break;
      case 'video':
        text = 'Video';
        icon = <Video size={14} className="shrink-0" />;
        break;
      case 'voice':
        text = 'Voice message';
        icon = <Mic size={14} className="shrink-0" />;
        break;
      case 'file':
        text = msg.content || 'File';
        icon = <FileText size={14} className="shrink-0" />;
        break;
      case 'location':
        text = 'Location';
        icon = <MapPin size={14} className="shrink-0" />;
        break;
      case 'poll':
        text = 'Poll';
        icon = <BarChart3 size={14} className="shrink-0" />;
        break;
      case 'money_transfer':
        text = 'Transfer';
        icon = <Wallet size={14} className="shrink-0" />;
        break;
      case 'contact_card':
        text = 'Contact';
        icon = <User size={14} className="shrink-0" />;
        break;
      default:
        text = msg.content || '';
    }
  } else if (typeof lastMsg === 'string') {
    // Infer from content string patterns
    isMe = chat.lastMessageSenderId === currentUserId;
    if (lastMsg.includes('📷') || lastMsg.includes('Photo')) {
      text = 'Photo';
      icon = <ImageIcon size={14} className="shrink-0" />;
    } else if (lastMsg.includes('🎥') || lastMsg.includes('Video')) {
      text = 'Video';
      icon = <Video size={14} className="shrink-0" />;
    } else if (lastMsg.includes('🎤') || lastMsg.includes('Voice')) {
      text = 'Voice message';
      icon = <Mic size={14} className="shrink-0" />;
    } else if (lastMsg.startsWith('Shared contact:')) {
      text = 'Contact';
      icon = <User size={14} className="shrink-0" />;
    } else {
      text = lastMsg;
    }
    // Use chat-level read status if available
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
  const [nonFriendNames, setNonFriendNames] = useState<Record<string, string>>({});
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubChats = subscribeChats(user.id);
    const unsubGroups = subscribeGroups(user.id);
    return () => { unsubChats(); unsubGroups(); };
  }, [user, subscribeChats, subscribeGroups]);

  const handleRefresh = useCallback(() => {
    if (!user?.id || refreshing) return;
    setRefreshing(true);
    // Existing subscriptions already handle real-time updates.
    // Just show a brief visual refresh indicator.
    refreshTimeoutRef.current = setTimeout(() => setRefreshing(false), 800);
  }, [user?.id, refreshing]);

  useEffect(() => {
    if (!user || !chats.length) return;
    const nonFriendIds = chats
      .filter(c => c.type !== 'group')
      .map(c => c.participants.find(p => p !== user.id))
      .filter((id): id is string => !!id && !friends.find(f => f.id === id) && !nonFriendNames[id]);
    
    if (!nonFriendIds.length) return;
    let cancelled = false;
    const load = async () => {
      const names: Record<string, string> = {};
      for (const id of nonFriendIds) {
        try {
          if (!isFirestoreAvailable()) continue;
          const data = await getDocById('users', id);
          if (data && !cancelled) names[id] = data.name || 'User';
        } catch { /* ignore */ }
      }
      if (!cancelled) setNonFriendNames(prev => ({ ...prev, ...names }));
    };
    load();
    return () => { cancelled = true; };
  }, [chats, friends, user]);

  // Combine chats and groups, deduplicate by id
  const allChatsMap = new Map<string, typeof chats[0] & { itemType: 'direct' | 'group' }>();
  chats.forEach(c => allChatsMap.set(c.id, { ...c, itemType: 'direct' as const }));
  groups.forEach(g => allChatsMap.set(g.id, { ...g, itemType: 'group' as const }));
  const allChats = Array.from(allChatsMap.values()).sort((a, b) => {
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bTime - aTime;
  });

  const activeChats = allChats.filter(c => !c.archived);
  const archivedChats = allChats.filter(c => c.archived);

  // Separate pinned and unpinned chats
  const pinnedChats = activeChats.filter(c => c.pinned);
  const unpinnedChats = activeChats.filter(c => !c.pinned);

  const filtered = (activeTab === 'archived' ? archivedChats : activeTab === 'all' && search === '' ? [...pinnedChats, ...unpinnedChats] : activeChats).filter(c => {
    if (activeTab === 'direct') return c.itemType === 'direct';
    if (activeTab === 'groups') return c.itemType === 'group';
    if (activeTab === 'archived') return true;
    return true;
  }).filter(c => {
    if (!search) return true;
    if (c.type === 'group') return c.name?.toLowerCase().includes(search.toLowerCase());
    const otherId = c.participants.find(p => p !== user?.id) || '';
    const f = friends.find(fr => fr.id === otherId);
    const name = f?.name || nonFriendNames[otherId] || 'Chat';
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const totalUnread = activeChats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  return (
    <div className="h-[100dvh] bg-white flex flex-col relative">
      {/* Header */}
      <div className="shrink-0 px-5 py-4 flex justify-between items-center border-b border-[#EBEBEB]">
        <div>
          <h1 className="text-2xl font-bold text-[#111111]">Chats</h1>
          {totalUnread > 0 && <p className="text-[#00C300] text-xs font-medium">{totalUnread} unread</p>}
        </div>
        <div className="flex gap-3 text-[#111111]">
          <button type="button" onClick={() => navigate('/add-friends')} className="p-2 hover:bg-gray-50 rounded-full transition-colors" title="Add friends">
            <UserPlus size={22} strokeWidth={1.5} />
          </button>
          <button type="button" onClick={() => navigate('/create-group')} className="p-2 hover:bg-gray-50 rounded-full transition-colors" title="New group">
            <Plus size={22} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="shrink-0 px-4 py-2">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search chats..."
            className="w-full bg-[#F5F5F5] rounded-xl pl-10 pr-4 py-2.5 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#8D8D8D]"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex border-b border-[#EBEBEB] px-4">
        {(['all', 'direct', 'groups', 'archived'] as const).map(tab => (
          <button type="button" key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-sm font-medium transition-colors capitalize ${
              activeTab === tab
                ? 'text-[#00C300] border-b-2 border-[#00C300]'
                : 'text-[#8D8D8D]'
            }`}
          >
            {tab === 'all' ? `All (${activeChats.length})` : tab === 'direct' ? 'Direct' : tab === 'groups' ? 'Groups' : `Archived (${archivedChats.length})`}
          </button>
        ))}
      </div>

      {/* Chat List */}
      <div
        className="flex-1 overflow-y-auto scrollbar-hide scroll-smooth relative"
        onTouchStart={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop <= 0) {
            const startY = e.touches[0].clientY;
            const handleMove = (me: TouchEvent) => {
              const diff = me.touches[0].clientY - startY;
              if (diff > 80) {
                handleRefresh();
                el.removeEventListener('touchmove', handleMove);
              }
            };
            el.addEventListener('touchmove', handleMove, { once: true });
          }
        }}
      >
        {/* Pull to refresh */}
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

            const { text: lastMsgText, icon: msgIcon, isMe: isLastMsgFromMe, readStatus } = formatLastMessage(chat, user?.id);

            const handleAddFriend = async (e: React.MouseEvent) => {
              e.stopPropagation();
              if (!user?.id || !otherId) return;
              try {
                await sendRequest(otherId, user.id);
                toast.success('Friend request sent');
              } catch (err: unknown) {
                toast.error(err instanceof Error ? err.message : 'Failed to send request');
              }
            };

            return (
              <motion.button
                key={chat.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
                onClick={() => navigate(isGroup ? `/group/${chat.id}` : `/chat/${otherId}`)}
                className={`w-full flex items-center p-4 active:bg-gray-50 transition-colors text-left press-scale ${hasUnread ? 'bg-[#00C300]/5' : ''}`}
              >
                {/* Avatar with badges */}
                <div className="relative w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden mr-4 bg-[#F5F5F5]">
                  {sanitizeMediaUrl(avatar) ? (
                    <img src={sanitizeMediaUrl(avatar)} className="w-full h-full object-cover" alt="User avatar" />
                  ) : isGroup ? (
                    <Users size={24} className="text-[#00C300]" />
                  ) : (
                    <img src={getDefaultAvatar(otherId || name)} className="w-full h-full object-cover" alt="User avatar" />
                  )}
                  {/* Online dot - bottom right */}
                  {isOnline && (
                    <div className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-[#00C300] rounded-full border-2 border-white" />
                  )}
                  {/* Pinned badge - top left */}
                  {isPinned && (
                    <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-[#FFD700] rounded-full flex items-center justify-center border border-white">
                      <Pin size={8} className="text-white" />
                    </div>
                  )}
                </div>

                {/* Chat info */}
                <div className="flex-1 min-w-0 border-b border-[#EBEBEB] py-1">
                  {/* Name row */}
                  <div className="flex justify-between items-center mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h3 className={`text-[16px] truncate ${hasUnread ? 'font-bold text-[#111111]' : 'font-medium text-[#111111]'}`}>{name}</h3>
                      {isGroup && (
                        <span className="text-[10px] bg-[#00C300]/10 text-[#00C300] px-1.5 py-0.5 rounded-full font-medium shrink-0">
                          Group
                        </span>
                      )}
                      {!isGroup && !isFriend && (
                        <span className="text-[10px] bg-[#FF9800]/10 text-[#FF9800] px-1.5 py-0.5 rounded-full font-medium shrink-0">
                          Not Friends
                        </span>
                      )}
                    </div>
                    <span className={`text-[12px] shrink-0 ml-2 ${hasUnread ? 'text-[#00C300] font-bold' : 'text-[#8D8D8D]'}`}>{formatTime(chat.updatedAt)}</span>
                  </div>

                  {/* Message preview row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className={`flex items-center gap-1 min-w-0 ${hasUnread ? 'text-[#111111] font-medium' : 'text-[#8D8D8D]'}`}>
                      {/* Read status checkmarks for sent messages */}
                      {isLastMsgFromMe && readStatus !== 'none' && (
                        <span className="shrink-0">
                          {readStatus === 'read' ? (
                            <CheckCheck size={14} className="text-[#2196F3]" />
                          ) : (
                            <Check size={14} className="text-[#8D8D8D]" />
                          )}
                        </span>
                      )}
                      {msgIcon && <span className="text-[#8D8D8D]">{msgIcon}</span>}
                      <p className="text-[14px] truncate">{lastMsgText}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!isGroup && !isFriend && (
                        <button type="button" onClick={handleAddFriend}
                          className="px-2.5 py-1 bg-[#00C300] text-white text-[10px] rounded-full font-medium active:bg-[#00A300] transition-colors"
                        >
                          Add Friend
                        </button>
                      )}
                      {hasUnread && (
                        <span className="bg-[#FF3B30] text-white text-[11px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
                          {chat.unreadCount}
                        </span>
                      )}
                      {chat.archived && (
                        <button type="button" onClick={(e) => {
                            e.stopPropagation();
                            unarchiveChat(chat.id);
                            toast.success('Chat unarchived');
                          }}
                          className="p-1.5 hover:bg-[#F5F5F5] rounded-full text-[#8D8D8D] transition-colors"
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
        className="absolute bottom-20 right-4 w-14 h-14 bg-[#00C300] text-white rounded-full shadow-lg flex items-center justify-center hover:bg-[#00A300] active:scale-95 transition-all z-30"
        title="New Chat"
      >
        <MessageCircle size={24} />
      </button>

      <BottomNav />
    </div>
  );
}
