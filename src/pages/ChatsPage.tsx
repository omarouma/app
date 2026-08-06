import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

import { UserPlus, Plus, Search, Users, Archive, MessageCircle, MessageSquare } from 'lucide-react';

import { ChatListItem } from '@/components/features/chat/ChatListItem';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import EmptyState from '@/components/EmptyState';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useChatLogic } from '@/hooks/useChatLogic';

export default function ChatsPage() {
  const navigate = useNavigate();
  const {
    search, setSearch, activeTab, setActiveTab,
    loading, filtered, totalUnread, activeChats, archivedChats,
    handleRefresh,
  } = useChatLogic();

  useDocumentTitle(`Chats (${totalUnread > 0 ? totalUnread : 0})`);

  const [refreshing, setRefreshing] = useState(false);
  const touchStartRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (containerRef.current?.scrollTop === 0) {
      touchStartRef.current = e.touches[0].clientY;
    }
  };

  const handleTouchEnd = async (e: React.TouchEvent) => {
    if (touchStartRef.current === 0) return;
    const touchEnd = e.changedTouches[0].clientY;
    if (touchEnd > touchStartRef.current + 60) {
      setRefreshing(true);
      try {
        await handleRefresh();
      } finally {
        setRefreshing(false);
      }
    }
    touchStartRef.current = 0;
  };

  return (
    <div className="h-[100dvh] bg-white flex flex-col relative page-enter">
      {/* Header */}
      <div className="shrink-0 px-5 pt-5 pb-3 flex justify-between items-center bg-white">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Chats</h1>
          {totalUnread > 0 && (
            <p className="text-indigo-600 text-xs font-semibold mt-0.5">
              {totalUnread} unread message{totalUnread !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="flex gap-2 text-gray-800">
          <button type="button" onClick={() => navigate('/add-friends')}
            className="w-9 h-9 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full transition-colors tap-scale"
            aria-label="Add friends"
          >
            <UserPlus size={18} strokeWidth={2} />
          </button>
          <button type="button" onClick={() => navigate('/create-group')}
            className="w-9 h-9 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full transition-colors tap-scale"
            aria-label="Create new group"
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="shrink-0 px-4 pb-2 bg-white">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search chats or start a new one..."
            className="w-full bg-gray-100 rounded-full pl-10 pr-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 placeholder:text-gray-400 transition-shadow"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex gap-2 px-4 pb-2 overflow-x-auto scrollbar-hide bg-white">
        {(['all', 'direct', 'groups', 'archived'] as const).map(tab => (
          <button type="button" key={tab}
            onClick={() => setActiveTab(tab)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all tap-scale ${
              activeTab === tab
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:text-gray-900'
            }`}
          >
            {
              {
                all: `All${activeChats.length ? ` (${activeChats.length})` : ''}`,
                direct: 'Direct',
                groups: 'Groups',
                archived: `Archived${archivedChats.length ? ` (${archivedChats.length})` : ''}`,
              }[tab]
            }
          </button>
        ))}
      </div>

      {/* Chat List */}
      <div
        ref={containerRef}
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
              className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full"
            />
          </div>
        )}

        {loading ? (
          <LoadingSkeleton count={8} variant="list" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={
              activeTab === 'groups' ? Users :
              activeTab === 'archived' ? Archive :
              activeTab === 'direct' ? MessageSquare :
              MessageCircle
            }
            title={
              activeTab === 'groups' ? 'No groups yet' :
              activeTab === 'archived' ? 'No archived chats' :
              search ? 'No results found' : 'No conversations yet'
            }
            description={
              activeTab === 'groups' ? 'Create a group to start chatting with multiple people.' :
              activeTab === 'archived' ? 'Long press on a chat in your list to archive it.' :
              'Start a conversation by finding your friends or creating a new group.'
            }
            action={
              activeTab === 'groups' ? (
                <button type="button" onClick={() => navigate('/create-group')}
                  className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-full active:bg-indigo-700 transition-colors"
                >
                  Create Group
                </button>
              ) : activeTab === 'archived' ? null : (
                <button type="button" onClick={() => navigate('/contacts')}
                  className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-full active:bg-indigo-700 transition-colors"
                >
                  Start Chatting
                </button>
              )
            }
          />
        ) : (
          filtered.map((chat, i) => (
            <ChatListItem
              key={chat.id}
              chat={chat}
              index={i}
            />
          ))
        )}
      </div>

      {/* Floating New Chat Button */}
      <button type="button" onClick={() => navigate('/contacts')}
        className="absolute bottom-[76px] right-4 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-indigo-700 active:scale-95 transition-all z-30 tap-scale"
        title="New Chat"
        aria-label="New Chat"
      >
        <MessageSquare size={24} strokeWidth={2} />
      </button>
    </div>
  );
}
