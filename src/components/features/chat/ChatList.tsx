import { memo, useRef } from 'react';
import { ChatListItem } from './ChatListItem';
import type { Chat } from '@/types';

interface ChatListProps {
  chats: (Chat & { itemType: 'direct' | 'group' })[];
  userId?: string;
  friends: { id: string; name: string; avatar?: string }[];
  nonFriendNames: Record<string, string>;
  visibleOnline: Record<string, boolean>;
  typingMap: Record<string, string>;
  onAddFriend: (friendId: string) => Promise<void>;
  // Optional long-press / context-menu handlers (used by ChatsPage)
  onLongPress?: (chatId: string, archived: boolean, y: number) => void;
}

export const ChatList = memo(({
  chats,
  userId,
  friends,
  nonFriendNames,
  visibleOnline,
  typingMap,
  onAddFriend,
  onLongPress,
}: ChatListProps) => {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div>
      {chats.map((chat, i) => {
        const isGroup = chat.type === 'group';
        const otherId = isGroup ? '' : (chat.participants.find(p => p !== userId) || '');
        const friend = friends.find(fr => fr.id === otherId);
        const isFriend = !!friend;
        const name = isGroup ? (chat.name || 'Group') : (friend?.name || nonFriendNames[otherId] || 'Chat');
        const avatar = isGroup ? (chat.avatar || '') : (friend?.avatar || '');
        const isOnline = !isGroup && visibleOnline[otherId];
        const typingName = typingMap[chat.id];

        return (
          <div
            key={chat.id}
            onTouchStart={(e) => {
              if (!onLongPress) return;
              const y = e.touches[0].clientY;
              longPressTimer.current = setTimeout(() => onLongPress(chat.id, !!chat.archived, y), 500);
            }}
            onTouchEnd={clearTimer}
            onTouchMove={clearTimer}
            onTouchCancel={clearTimer}
            onContextMenu={(e) => {
              if (!onLongPress) return;
              e.preventDefault();
              onLongPress(chat.id, !!chat.archived, e.clientY);
            }}
          >
            <ChatListItem
              chat={chat}
              index={i}
              userId={userId}
              isFriend={isFriend}
              isOnline={isOnline}
              name={name}
              avatar={avatar}
              typingName={typingName}
              onAddFriend={onAddFriend}
            />
          </div>
        );
      })}
    </div>
  );
});

ChatList.displayName = 'ChatList';
