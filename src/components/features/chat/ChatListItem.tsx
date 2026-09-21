import { memo, useMemo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { Pin, Users, UserPlus, Archive, VolumeX, Volume2 } from 'lucide-react';
import type { Chat } from '@/types';
import { formatTime, getDefaultAvatar, sanitizeMediaUrl, getMessagePreview } from '@/lib/utils';
import { safeGetStorageItem } from '@/lib/safeStorage';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useFilteredOnline } from '@/hooks/usePresence';

interface ChatListItemProps {
  chat: Chat;
  index: number;
  userId?: string;
  isFriend?: boolean;
  isOnline?: boolean;
  name?: string;
  avatar?: string;
  typingName?: string;
  onAddFriend?: (friendId: string) => Promise<void>;
  onArchive?: (chatId: string, archived: boolean) => void;
  onToggleMute?: (chatId: string) => void;
}

export const ChatListItem = memo(function ChatListItem({
  chat,
  index,
  userId: propUserId,
  isFriend: propIsFriend,
  isOnline: propIsOnline,
  name: propName,
  avatar: propAvatar,
  typingName,
  onAddFriend,
  onArchive,
  onToggleMute,
}: ChatListItemProps) {
  const navigate = useNavigate();
  const swipeEnabled = !!onArchive || !!onToggleMute;
  const x = useMotionValue(0);
  const [revealed, setRevealed] = useState(false);
  const archiveOpacity = useTransform(x, [-120, -40, 0], [1, 0.6, 0]);
  const muteOpacity = useTransform(x, [0, 40, 120], [0, 0.6, 1]);
  const { user } = useAuthStore();
  const { friends, requests, sentRequests } = useFriendStore();
  const { filtered: visibleOnline } = useFilteredOnline(user?.id || '', friends);

  const userId = propUserId ?? user?.id ?? '';
  const isGroup = chat.type === 'group';
  const otherId = isGroup ? '' : (chat.participants.find(p => p !== userId) || '');
  const friend = friends.find(f => f.id === otherId);

  const resolvedIsFriend = propIsFriend ?? !!friend;
  const hasIncoming = !isGroup && !!otherId && requests.some(r => r.from === otherId);
  const hasSent = !isGroup && !!otherId && sentRequests.some(r => r.toUserId === otherId);
  const showAddFriend = !isGroup && !resolvedIsFriend && !hasIncoming && !hasSent && !!otherId && otherId !== userId;

  const name = propName ?? (isGroup ? (chat.name || 'Group') : (friend?.name || 'Chat'));
  const avatar = propAvatar ?? (isGroup ? (chat.avatar || '') : (friend?.avatar || ''));
  const isOnline = propIsOnline ?? (!isGroup && !!visibleOnline[otherId]);
  const lastMsgPreview = useMemo(() => {
    if (typingName) return `${typingName} is typing...`;
    const lm = chat.lastMessage;
    if (!lm) return '';
    if (typeof lm === 'string') return lm;
    return getMessagePreview(lm.type, lm.content);
  }, [chat.lastMessage, typingName]);

  // Local draft preview (stored per-chat in localStorage by the chat room)
  const draft = useMemo(() => {
    if (typingName) return '';
    try {
      return safeGetStorageItem(`draft_${chat.id}`) || '';
    } catch {
      return '';
    }
  }, [chat.id, typingName]);

  const avatarSrc = sanitizeMediaUrl(avatar) || getDefaultAvatar(otherId || chat.id || name || 'C');

  const handleAddFriend = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (onAddFriend && otherId) {
      try {
        await onAddFriend(otherId);
      } catch {
          /* parent handles toast */
        }
    }
  }, [onAddFriend, otherId]);

  const closeSwipe = useCallback(() => {
    animate(x, 0, { type: 'spring', stiffness: 400, damping: 40 });
    setRevealed(false);
  }, [x]);

  const handleDragEnd = useCallback((_: unknown, info: { offset: { x: number } }) => {
    const offset = info.offset.x;
    if (offset < -60 && onArchive) {
      animate(x, -96, { type: 'spring', stiffness: 400, damping: 40 });
      setRevealed(true);
    } else if (offset > 60 && onToggleMute) {
      animate(x, 96, { type: 'spring', stiffness: 400, damping: 40 });
      setRevealed(true);
    } else {
      closeSwipe();
    }
  }, [x, onArchive, onToggleMute, closeSwipe]);

  const item = (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      onClick={() => {
        if (revealed) { closeSwipe(); return; }
        navigate(isGroup ? `/group/${chat.id}` : `/chat/${otherId || chat.id}`);
      }}
      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer relative bg-white"
    >
      <div className="relative shrink-0">
        <div className="w-12 h-12 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center">
          {isGroup ? (
            avatar ? (
              <img src={avatarSrc} className="w-full h-full object-cover" alt={name} />
            ) : (
              <div className="w-full h-full bg-indigo-100 flex items-center justify-center">
                <Users size={22} className="text-indigo-500" />
              </div>
            )
          ) : (
            <img src={avatarSrc} className="w-full h-full object-cover" alt={name} />
          )}
        </div>
        {isOnline && (
          <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">
            {chat.pinned && <Pin size={11} className="text-gray-400 shrink-0" />}
            <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {showAddFriend && onAddFriend && (
              <button
                type="button"
                onClick={handleAddFriend}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-[#00C300] text-white hover:bg-[#00A300] active:opacity-80 transition-colors"
                aria-label="Add friend"
              >
                <UserPlus size={12} />
                Add
              </button>
            )}
            {hasIncoming && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#FF9800]/15 text-[#FF9800]">
                Pending
              </span>
            )}
            {hasSent && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">
                Requested
              </span>
            )}
            {chat.updatedAt && (
              <span className="text-[11px] text-gray-400">
                {formatTime(chat.updatedAt)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className={`text-xs truncate ${typingName ? 'text-[#00C300] font-medium' : draft ? 'text-[#FF9800]' : 'text-gray-500'}`}>
            {draft ? (
              <><span className="font-semibold text-[#FF9800]">Draft: </span>{draft}</>
            ) : lastMsgPreview}
          </p>
          {(chat.unreadCount ?? 0) > 0 && (
            <span className="shrink-0 min-w-[18px] h-[18px] bg-[#00C300] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
              {chat.unreadCount! > 99 ? '99+' : chat.unreadCount}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );

  if (!swipeEnabled) return item;

  return (
    <div className="relative overflow-hidden">
      {/* Left action (revealed by swiping right): mute/unmute */}
      {onToggleMute && (
        <motion.button
          type="button"
          style={{ opacity: muteOpacity }}
          onClick={() => { onToggleMute(chat.id); closeSwipe(); }}
          className="absolute inset-y-0 left-0 w-24 flex flex-col items-center justify-center gap-1 bg-amber-500 text-white text-[11px] font-semibold"
          aria-label={chat.isMuted ? 'Unmute chat' : 'Mute chat'}
        >
          {chat.isMuted ? <Volume2 size={18} /> : <VolumeX size={18} />}
          {chat.isMuted ? 'Unmute' : 'Mute'}
        </motion.button>
      )}
      {/* Right action (revealed by swiping left): archive/unarchive */}
      {onArchive && (
        <motion.button
          type="button"
          style={{ opacity: archiveOpacity }}
          onClick={() => { onArchive(chat.id, !!chat.archived); closeSwipe(); }}
          className="absolute inset-y-0 right-0 w-24 flex flex-col items-center justify-center gap-1 bg-gray-500 text-white text-[11px] font-semibold"
          aria-label={chat.archived ? 'Unarchive chat' : 'Archive chat'}
        >
          <Archive size={18} />
          {chat.archived ? 'Unarchive' : 'Archive'}
        </motion.button>
      )}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.5}
        style={{ x }}
        onDragEnd={handleDragEnd}
        className="relative z-10 bg-white"
      >
        {item}
      </motion.div>
    </div>
  );
});
