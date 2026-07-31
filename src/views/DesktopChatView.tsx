import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, MessageSquare, Inbox } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { useFriendStore } from '@/store/useFriendStore';
import ChatRoom from '@/components/features/chat/ChatRoom';
import { formatTime, getChatName, getChatAvatar, sanitizeMediaUrl, getDefaultAvatar } from '@/lib/utils';

export default function DesktopChatView() {
  const { user } = useAuthStore();
  const { chats, loadingChats, subscribeChats, createDirectChat } = useChatStore();
  const { friends } = useFriendStore();
  const _params = useParams();
  const userId = (_params as { userId?: string }).userId;
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const routeChatId = user?.id && userId ? `dm_${[user.id, userId].sort().join('_')}` : null;

  useEffect(() => {
    if (!user?.id) return;
    const unsubChats = subscribeChats(user.id);
    return () => unsubChats();
  }, [user?.id, subscribeChats]);

  useEffect(() => {
    if (!routeChatId || !user?.id) return;
    let cancelled = false;
    createDirectChat(userId!, user.id)
      .then(() => {
        if (!cancelled) {
          // Route selection is driven by URL; no local state update needed.
        }
      })
      .catch(() => {
        // If a direct chat cannot be created, allow the user to choose another chat from the list.
      });
    return () => {
      cancelled = true;
    };
  }, [routeChatId, user?.id, userId, createDirectChat]);

  const filteredChats = useMemo(() => chats.filter(c => {
    if (!search) return true;
    const name = getChatName(c, Object.fromEntries(friends.map(f => [f.id, { name: f.name }])), user?.id || '');
    return name.toLowerCase().includes(search.toLowerCase());
  }), [chats, friends, search, user?.id]);

  const activeChat = chats.find(c => c.id === routeChatId);
  const activeUserId = activeChat?.participants.find(p => p !== user?.id) || '';

  return (
    <div className="h-full flex bg-white">
      {/* Chat List Sidebar */}
      <div className="w-80 border-r border-[#EBEBEB] flex flex-col bg-white">
        <div className="shrink-0 p-4 border-b border-[#EBEBEB]">
          <h2 className="text-[#111111] font-bold text-xl mb-4 flex items-center gap-2">
            <MessageSquare size={20} className="text-[#00C300]" /> Messages
          </h2>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search chats..."
              className="w-full bg-[#F5F5F5] border-none rounded-xl pl-10 pr-4 py-2.5 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#8D8D8D]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {loadingChats ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-[#F5F5F5] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-[#8D8D8D]">
              <Inbox size={32} className="mb-2" />
              <p className="text-sm">No chats yet</p>
            </div>
          ) : (
            filteredChats.map(chat => {
              const isGroup = chat.type === 'group';
              const otherId = chat.participants.find(p => p !== user?.id) || '';
              const name = getChatName(chat, Object.fromEntries(friends.map(f => [f.id, { name: f.name }])), user?.id || '');
              const avatar = getChatAvatar(chat, Object.fromEntries(friends.map(f => [f.id, { avatar: f.avatar }])), user?.id || '');
              const lastMsg = typeof chat.lastMessage === 'string' ? chat.lastMessage : 'No messages';
              const isActive = routeChatId === chat.id;

              return (
                <motion.button
                  key={chat.id}
                  whileHover={{ x: 2 }}
                  onClick={() => {
                    if (isGroup) {
                      navigate(`/group/${chat.id}`);
                      return;
                    }
                    if (otherId) {
                      navigate(`/chat/${otherId}`);
                    }
                  }}
                  className={`w-full flex items-center gap-3 p-3 text-left transition-colors ${
                    isActive ? 'bg-[#00C300]/5' : 'hover:bg-[#F5F5F5]'
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-[#F5F5F5] flex items-center justify-center shrink-0 overflow-hidden">
                    {sanitizeMediaUrl(avatar) ? (
                      <img src={sanitizeMediaUrl(avatar)} className="w-full h-full object-cover" alt="User avatar" />
                    ) : (
                      <img src={getDefaultAvatar(otherId || 'default')} className="w-full h-full object-cover" alt="User avatar" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-[#111111] text-sm font-medium truncate">{name}</p>
                      <span className="text-[#8D8D8D] text-[10px] shrink-0">{formatTime(chat.updatedAt)}</span>
                    </div>
                    <p className="text-[#8D8D8D] text-xs truncate">{lastMsg}</p>
                  </div>
                  {(chat.unreadCount || 0) > 0 && (
                    <span className="w-5 h-5 rounded-full bg-[#00C300] flex items-center justify-center shrink-0">
                      <span className="text-white text-[10px] font-bold">{chat.unreadCount}</span>
                    </span>
                  )}
                </motion.button>
              );
            })
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 bg-white">
        {routeChatId && activeChat ? (
          <ChatRoom chatId={routeChatId} userId={activeUserId} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center bg-[#F5F5F5]">
            <MessageSquare size={48} className="mb-4 text-[#C7C7CC]" />
            <p className="text-lg text-[#8D8D8D]">Select a chat to start messaging</p>
          </div>
        )}
      </div>
    </div>
  );
}
