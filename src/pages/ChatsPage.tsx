import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

import { UserPlus, Plus, Search, Users, Archive, MessageCircle, MessageSquare, ArchiveRestore, Phone, Bell } from 'lucide-react';

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
    <div className="h-screen-safe bg-background flex flex-col relative page-enter">
      {/* Header */}
      <header className="shrink-0 page-header">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Chats</h1>
          {totalUnread > 0 && (
            <p className="text-primary text-xs font-semibold mt-0.5">
              {totalUnread} unread message{totalUnread !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="flex gap-1.5 sm:gap-2 text-foreground">
          <button type="button" onClick={() => navigate('/calls')}
            className="icon-btn w-10 h-10 sm:w-11 sm:h-11 bg-accent text-foreground"
            aria-label="Calls"
          >
            <Phone size={18} strokeWidth={2} />
          </button>
          <button type="button" onClick={() => navigate('/notifications')}
            className="icon-btn w-10 h-10 sm:w-11 sm:h-11 bg-accent text-foreground"
            aria-label="Notifications"
          >
            <Bell size={18} strokeWidth={2} />
          </button>
          <button type="button" onClick={() => navigate('/add-friends')}
            className="icon-btn w-10 h-10 sm:w-11 sm:h-11 bg-accent text-foreground"
            aria-label="Add friends"
          >
            <UserPlus size={18} strokeWidth={2} />
          </button>
          <button type="button" onClick={() => navigate('/create-group')}
            className="icon-btn w-10 h-10 sm:w-11 sm:h-11 bg-accent text-foreground"
            aria-label="Create new group"
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>
      </header>

      {/* Search */}
      <div className="shrink-0 page-padding-x pb-2 bg-card/50">
        <div className="relative max-w-md mx-auto sm:mx-0">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search chats or start a new one..."
            className="w-full input-surface pl-10 pr-4 py-2.5 text-foreground text-sm placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex gap-2 page-padding-x pb-2 overflow-x-auto scrollbar-hide bg-card/50">
        <div className="flex gap-2 mx-auto sm:mx-0">
          {(['all', 'direct', 'groups', 'archived'] as const).map(tab => (
            <button type="button" key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 px-4 sm:px-5 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold transition-all tap-scale ${activeTab === tab
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-accent text-muted-foreground hover:text-foreground'
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
      </div>

      {/* Chat List */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto scrollbar-hide scroll-smooth relative pb-16"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div className="max-w-3xl mx-auto">
          {/* Pull to refresh indicator */}
          {refreshing && (
            <div className="flex justify-center py-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full"
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
                    className="gchat-btn text-sm font-medium px-5 py-2 rounded-full"
                  >
                    Create Group
                  </button>
                ) : activeTab === 'archived' ? null : (
                  <button type="button" onClick={() => navigate('/contacts')}
                    className="gchat-btn text-sm font-medium px-5 py-2 rounded-full"
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
      </div>

      {/* Floating New Chat Button */}
      <button type="button" onClick={() => navigate('/contacts')}
        className="absolute sm:right-6 md:right-8 bottom-[calc(76px+env(safe-area-inset-bottom,0px))] right-4 w-12 h-12 sm:w-14 sm:h-14 bg-primary text-primary-foreground rounded-full shadow-float flex items-center justify-center hover:brightness-95 active:scale-95 transition-all z-30 tap-scale"
        title="New Chat"
        aria-label="New Chat"
      >
        <MessageSquare size={20} strokeWidth={2.2} className="sm:hidden" />
        <MessageSquare size={24} strokeWidth={2.2} className="hidden sm:block" />
      </button>

      {/* Long-press context menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed z-50 bg-popover rounded-2xl shadow-float border border-border py-1 min-w-[180px]"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => handleArchiveToggle(contextMenu.chatId, contextMenu.archived)}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors"
            >
              {contextMenu.archived
                ? <><ArchiveRestore size={16} className="text-primary" /> Unarchive Chat</>
                : <><Archive size={16} className="text-primary" /> Archive Chat</>
              }
            </button>
            <button
              type="button"
              onClick={() => setContextMenu(null)}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground hover:bg-accent transition-colors"
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