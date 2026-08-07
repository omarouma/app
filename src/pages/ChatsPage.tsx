import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

import { UserPlus, Plus, Search, Users, Archive, MessageCircle, MessageSquare, ArchiveRestore } from 'lucide-react';

import { ChatList } from '@/components/features/chat/ChatList';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import EmptyState from '@/components/EmptyState';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useChatLogic } from '@/hooks/useChatLogic';
import { useChatStore } from '@/store/useChatStore';
import { toast } from 'sonner';

export default function ChatsPage() {
  const navigate = useNavigate();
  const {
    search, setSearch, activeTab, setActiveTab,
    loading, filtered, totalUnread, activeChats, archivedChats,
    typingMap, friends, nonFriendNames, visibleOnline, handleAddFriend, user,
    handleRefresh,
  } = useChatLogic();

const { archiveChat, unarchiveChat } = useChatStore();

  useDocumentTitle(`Chats (${totalUnread})`);

  const [refreshing, setRefreshing] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ chatId: string; archived: boolean; x: number; y: number } | null>(null);
  const touchStartRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleLongPress = useCallback((chatId: string, archived: boolean, y: number) => {
    setContextMenu({ chatId, archived, x: 20, y: Math.min(y, window.innerHeight - 120) });
  }, []);

  const handleArchiveToggle = useCallback(async (chatId: string, isArchived: boolean) => {
    try {
      if (isArchived) {
        await unarchiveChat(chatId);
        toast.success('Chat unarchived');
      } else {
        await archiveChat(chatId);
        toast.success('Chat archived');
      }
    } catch {
      toast.error('Failed to update chat');
    }
    setContextMenu(null);
  }, [archiveChat, unarchiveChat]);

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
      {(['all', 'direct', 'groups', 'archived'] as const).map(tab => {
          const count = {
            all: activeChats.length,
            direct: activeChats.filter(c => c.itemType === 'direct').length,
            groups: activeChats.filter(c => c.itemType === 'group').length,
            archived: archivedChats.length,
          }[tab];
          const label = {
            all: 'All',
            direct: 'Direct',
            groups: 'Groups',
            archived: 'Archived',
          }[tab];
          return (
            <button type="button" key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all tap-scale ${
                activeTab === tab
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:text-gray-900'
              }`}
            >
              {count > 0 ? `${label} (${count})` : label}
            </button>
          );
        })}
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
          <ChatList
            chats={filtered}
            userId={user?.id}
            friends={friends}
            nonFriendNames={nonFriendNames}
            visibleOnline={visibleOnline}
            typingMap={typingMap}
            onAddFriend={handleAddFriend}
            onLongPress={handleLongPress}
          />
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

      {/* Long-press context menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed z-50 bg-white rounded-2xl shadow-xl border border-gray-100 py-1 min-w-[180px]"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => handleArchiveToggle(contextMenu.chatId, contextMenu.archived)}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-800 hover:bg-gray-50 transition-colors"
            >
              {contextMenu.archived
                ? <><ArchiveRestore size={16} className="text-indigo-500" /> Unarchive Chat</>
                : <><Archive size={16} className="text-indigo-500" /> Archive Chat</>
              }
            </button>
            <button
              type="button"
              onClick={() => setContextMenu(null)}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-400 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dismiss context menu on backdrop tap */}
      {contextMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
      )}
    </div>
  );
}
