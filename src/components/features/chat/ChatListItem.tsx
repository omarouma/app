import { memo, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Pin, Users } from 'lucide-react';
import type { Chat } from '@/types';
import { formatTime, getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useFilteredOnline } from '@/hooks/usePresence';

interface ChatListItemProps {
  chat: Chat;
  index: number;
  // Optional props used by ChatList (not required when used from ChatsPage)
  userId?: string;
  isFriend?: boolean;
  isOnline?: boolean;
  name?: string;
  avatar?: string;
  typingName?: string;
  onAddFriend?: (friendId: string) => Promise<void>;
}

export const ChatListItem = memo(function ChatListItem({
  chat,
  index,
  userId: propUserId,
  isFriend: _propIsFriend,
  isOnline: propIsOnline,
  name: propName,
  avatar: propAvatar,
  typingName,
  onAddFriend: _onAddFriend,
}: ChatListItemProps) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { friends } = useFriendStore();
  const { filtered: visibleOnline } = useFilteredOnline(user?.id || '', friends);

  const userId = propUserId ?? user?.id ?? '';
  const isGroup = chat.type === 'group';
  const otherId = isGroup ? '' : (chat.participants.find(p => p !== userId) || '');
  const friend = friends.find(f => f.id === otherId);

  // When the parent ChatList already provides resolved values, use them to
  // avoid redundant per-row store lookups. Fall back to internal derivation
  // only for the direct ChatsPage usage where props are not supplied.
  const name = propName ?? (isGroup ? (chat.name || 'Group') : (friend?.name || 'Chat'));
  const avatar = propAvatar ?? (isGroup ? (chat.avatar || '') : (friend?.avatar || ''));
  const isOnline = propIsOnline ?? (!isGroup && !!visibleOnline[otherId]);
  const lastMsgPreview = useMemo(() => {
    if (typingName) return `${typingName} is typing...`;
    const lm = chat.lastMessage;
    if (!lm) return '';
    if (typeof lm === 'string') return lm;
    return lm.content || '';
  }, [chat.lastMessage, typingName]);

  const avatarSrc = sanitizeMediaUrl(avatar) || getDefaultAvatar(otherId || chat.id || name || 'C');

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      onClick={() => navigate(isGroup ? `/group/${chat.id}` : `/chat/${otherId || chat.id}`)}
      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer relative"
    >
      {/* Avatar */}
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

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">
            {chat.pinned && <Pin size={11} className="text-gray-400 shrink-0" />}
            <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
          </div>
{chat.updatedAt && (
            <span className="text-[11px] text-gray-400 shrink-0">
              {formatTime(chat.updatedAt)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className={`text-xs truncate ${typingName ? 'text-indigo-500 font-medium' : 'text-gray-500'}`}>
            {lastMsgPreview}
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
});
