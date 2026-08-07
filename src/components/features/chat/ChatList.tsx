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
  const longPressTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const clearTimer = (chatId: string) => {
    if (longPressTimers.current[chatId]) {
      clearTimeout(longPressTimers.current[chatId]);
      delete longPressTimers.current[chatId];
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
              longPressTimers.current[chat.id] = setTimeout(() => onLongPress(chat.id, !!chat.archived, y), 500);
            }}
            onTouchEnd={() => clearTimer(chat.id)}
            onTouchMove={() => clearTimer(chat.id)}
            onTouchCancel={() => clearTimer(chat.id)}
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
