import { memo } from 'react';
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
}

export const ChatList = memo(({
  chats,
  userId,
  friends,
  nonFriendNames,
  visibleOnline,
  typingMap,
  onAddFriend,
}: ChatListProps) => {
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
          <ChatListItem
            key={chat.id}
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
        );
      })}
    </div>
  );
});

ChatList.displayName = 'ChatList';