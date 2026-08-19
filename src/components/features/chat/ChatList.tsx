import { memo, useRef, useEffect } from 'react';
import { ChatListItem } from './ChatListItem';
import type { Chat } from '@/types';

interface ChatListProps {
  chats: (Chat & { itemType: 'direct' | 'group' })[];
  userId?: string;
  friends: { id: string; name: string; avatar?: string }[];
  nonFriendNames: Record<string, string>;
  nonFriendAvatars: Record<string, string>;
  visibleOnline: Record<string, boolean>;
  typingMap: Record<string, string>;
  onAddFriend: (friendId: string) => Promise<void>;
  onLongPress?: (chatId: string, archived: boolean, muted: boolean, y: number) => void;
}

export const ChatList = memo(({
  chats,
  userId,
  friends,
  nonFriendNames,
  nonFriendAvatars,
  visibleOnline,
  typingMap,
  onAddFriend,
  onLongPress,
}: ChatListProps) => {
  const longPressTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimer = (chatId: string) => {
    const t = longPressTimers.current.get(chatId);
    if (t) {
      clearTimeout(t);
      longPressTimers.current.delete(chatId);
    }
  };

  useEffect(() => {
    const timers = longPressTimers.current;
    return () => {
      for (const t of timers.values()) {
        clearTimeout(t);
      }
      timers.clear();
    };
  }, []);

  return (
    <div>
      {chats.map((chat, i) => {
        const isGroup = chat.type === 'group';
        const otherId = isGroup ? '' : (chat.participants.find(p => p !== userId) || '');
        const friend = friends.find(fr => fr.id === otherId);
        const isFriend = !!friend;
        const name = isGroup ? (chat.name || 'Group') : (friend?.name || nonFriendNames[otherId] || 'Chat');
        const avatar = isGroup ? (chat.avatar || '') : (friend?.avatar || nonFriendAvatars[otherId] || '');
        const isOnline = !isGroup && visibleOnline[otherId];
        const typingName = typingMap[chat.id];

        return (
          <div
            key={chat.id}
            onTouchStart={(e) => {
              if (!onLongPress) return;
              const y = e.touches[0].clientY;
              const id = chat.id;
              longPressTimers.current.set(id, setTimeout(() => onLongPress(id, !!chat.archived, !!chat.isMuted, y), 500));
            }}
            onTouchEnd={() => clearTimer(chat.id)}
            onTouchMove={() => clearTimer(chat.id)}
            onTouchCancel={() => clearTimer(chat.id)}
            onContextMenu={(e) => {
              if (!onLongPress) return;
              e.preventDefault();
              onLongPress(chat.id, !!chat.archived, !!chat.isMuted, e.clientY);
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
