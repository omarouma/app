import { create } from 'zustand';
import { toast } from 'sonner';
import {
  isFirestoreAvailable,
  COLLECTIONS,
  updateDocById,
  addDocToCollection,
  addDocToSubcollection,
  queryCollection,
  querySubcollection,
  updateSubcollectionDoc,
  deleteSubcollectionDoc,
  subscribeToCollection,
  subscribeToSubcollection,
  serverTimestamp,
  where,
  orderBy,
  limit,
  startAfter,
} from '@/lib/firestore';
import type { Chat, Message, MessageType, PollData, TransferData, PinnedMessage } from '@/types';
import { checkMessageRateLimit } from '@/hooks/useMessageRateLimiter';
import { enqueueOfflineMessage, isOnline } from '@/lib/offlineQueue';
import { toDateFromDb } from '@/lib/timeUtils';
import { sanitizeText } from '@/lib/sanitize';
import { logStoreError } from '@/lib/errorLogger';

interface ContactCard {
  userId: string;
  name: string;
  username?: string;
  phone?: string;
  email?: string;
  avatar?: string;
  bio?: string;
}

const mapMessage = (d: Record<string, unknown> & { id?: string }): Message => {
  let contactCard: ContactCard | undefined;
  const cc = d.contactCard;
  if (cc && typeof cc === 'object') {
    const r = cc as Record<string, unknown>;
    const userId = typeof r.userId === 'string' ? r.userId : undefined;
    const name = typeof r.name === 'string' ? r.name : undefined;
    if (userId || name) {
      contactCard = {
        userId: userId ?? '',
        name: name ?? '',
        username: typeof r.username === 'string' ? r.username : undefined,
        phone: typeof r.phone === 'string' ? r.phone : undefined,
        email: typeof r.email === 'string' ? r.email : undefined,
        avatar: typeof r.avatar === 'string' ? r.avatar : undefined,
        bio: typeof r.bio === 'string' ? r.bio : undefined,
      };
    }
  }

  return {
    id: d.id as string,
    chatId: (d.chatId as string) || '',
    senderId: (d.senderId as string) || '',
    content: (d.content as string) || '',
    type: ((d.type as MessageType) || 'text') as MessageType,
    mediaUrl: (d.mediaUrl as string) || '',
    timestamp: d.createdAt ? toDateFromDb(d.createdAt) : d.timestamp ? toDateFromDb(d.timestamp) : new Date(),
    read: (d.read as boolean) || false,
    edited: (d.edited as boolean) || false,
    replyTo: (d.replyTo as string) || undefined,
    reactions: (d.reactions as Record<string, string[]>) || {},
    forwardedFrom: (d.forwardedFrom as string) || undefined,
    pollData: d.pollData as PollData | undefined,
    transferData: d.transferData as TransferData | undefined,
    contactCard,
    disappearingTimer: (d.disappearingTimer as number) || 0,
    disappearingInitiatedAt: d.disappearingInitiatedAt ? toDateFromDb(d.disappearingInitiatedAt) : undefined,
    destroyed: (d.destroyed as boolean) || false,
    deliveryStatus: (d.deliveryStatus as Message['deliveryStatus']) || (d.read ? 'read' : d.senderId ? 'sent' : undefined),
    deliveredAt: d.deliveredAt ? toDateFromDb(d.deliveredAt) : undefined,
    readAt: d.readAt ? toDateFromDb(d.readAt) : undefined,
    retryCount: (d.retryCount as number) || undefined,
    localId: (d.localId as string) || undefined,
  };
};

const mapChat = (d: Record<string, unknown> & { id?: string }): Chat => ({
  id: d.id as string,
  type: ((d.type as string) === 'group' ? 'group' : 'direct') as 'direct' | 'group',
  participants: (d.participants as string[]) || [],
  name: (d.name as string) || '',
  avatar: (d.avatar as string) || '',
  lastMessage: (d.lastMessage as string) || '',
  lastMessageSenderId: (d.lastMessageSenderId as string) || '',

  updatedAt: (d.updatedAt as string) || '',
  unreadCount: (d.unreadCount as number) || 0,
  isMuted: (d.isMuted as boolean) || false,
  admins: (d.admins as string[]) || [],
  createdBy: (d.createdBy as string) || '',
  pinnedMessages: (d.pinnedMessages as PinnedMessage[]) || [],
  description: (d.description as string) || '',
  disappearingMessages: (d.disappearingMessages as number) || 0,
  chatLocked: (d.chatLocked as boolean) || false,
  lockType: (d.lockType as 'pin' | 'biometric') || undefined,
  lockValue: (d.lockValue as string) || undefined,
  archived: (d.archived as boolean) || false,
  pinned: (d.pinned as boolean) || false,
});

interface ChatStore {
  chats: Chat[];
  archivedChats: Chat[];
  messages: Record<string, Message[]>;
  loadingChats: boolean;
  hasMore: Record<string, boolean>;
  totalUnread: number;

  fetchChats: (userId?: string) => Promise<void>;
  addMessage: (message: Message) => void;
  subscribeChats: (userId: string) => () => void;
  subscribeMessages: (chatId: string, limit?: number) => () => void;
  sendMessage: (chatId: string, senderId: string, content: string, type?: string, mediaUrl?: string, replyTo?: Message | string) => Promise<void>;
  editMessage: (chatId: string, messageId: string, content: string) => Promise<void>;
  deleteMessage: (chatId: string, messageId: string) => Promise<void>;
  deleteForEveryone: (chatId: string, messageId: string) => Promise<void>;
  recallMessage: (chatId: string, messageId: string) => Promise<void>;
  addReaction: (chatId: string, messageId: string, emoji: string, userId: string) => Promise<void>;
  markAsRead: (chatId: string, currentUserId?: string) => Promise<void>;
  createDirectChat: (userId: string, currentUserId: string) => Promise<Chat | null>;
  loadOlderMessages: (chatId: string) => Promise<void>;
  muteChat: (chatId: string) => Promise<void>;
  updateChat: (chatId: string, data: Partial<Chat>) => Promise<void>;
  removeParticipant: (chatId: string, userId: string) => Promise<void>;
  promoteAdmin: (chatId: string, userId: string) => Promise<void>;
  demoteAdmin: (chatId: string, userId: string) => Promise<void>;
  clearChat: (chatId: string) => Promise<void>;
  leaveGroup: (chatId: string, userId: string) => Promise<void>;
  addParticipant: (chatId: string, userId: string) => Promise<void>;
  sendPoll: (chatId: string, senderId: string, question: string, options: string[]) => Promise<void>;
  votePoll: (chatId: string, messageId: string, optionIndex: number, userId: string) => Promise<void>;
  pinMessage: (chatId: string, messageId: string, content: string) => Promise<void>;
  unpinMessage: (chatId: string, messageId: string) => Promise<void>;
  archiveChat: (chatId: string) => Promise<void>;
  unarchiveChat: (chatId: string) => Promise<void>;
  setDisappearingMessages: (chatId: string, seconds: number) => Promise<void>;
  lockChat: (chatId: string, lockType: 'pin' | 'biometric', lockValue: string) => Promise<void>;
  unlockChat: (chatId: string) => Promise<void>;
  sendContactCard: (chatId: string, senderId: string, contactData: { userId: string; name: string; phone?: string; email?: string; avatar?: string; username?: string; bio?: string }) => Promise<void>;
  exportChat: (chatId: string) => Promise<Record<string, unknown> | null>;
  getSharedMedia: (chatId: string, mediaType?: string) => Promise<Message[]>;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  chats: [],
  archivedChats: [],
  messages: {},
  loadingChats: true,
  hasMore: {},
  totalUnread: 0,

  fetchChats: async (userId) => {
    if (!isFirestoreAvailable() || !userId) return;
    set({ loadingChats: true });
    try {
      const chats = await queryCollection<Chat>(
        COLLECTIONS.CHATS,
        [where('participants', 'array-contains', userId)],
      );
      const mappedChats = chats.map(c => mapChat(c as unknown as Record<string, unknown> & { id?: string }));
      const archivedChats = mappedChats.filter(c => c.archived);
      const activeChats = mappedChats.filter(c => !c.archived);
      const totalUnread = activeChats.reduce((sum, chat) => sum + (chat.unreadCount || 0), 0);
      set({ chats: activeChats, archivedChats, loadingChats: false, totalUnread });
    } catch (error) {
      logStoreError('fetchChats', error, { userId });
      set({ loadingChats: false });
    }
  },

  addMessage: (message) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [message.chatId]: [...(state.messages[message.chatId] || []), message],
      },
    }));
  },

  subscribeChats: (userId) => {
    if (!isFirestoreAvailable() || !userId) return () => { };
    return subscribeToCollection<Chat>(
      COLLECTIONS.CHATS,
      [where('participants', 'array-contains', userId)],
      (rawChats) => {
        const chats = rawChats.map(c => mapChat(c as unknown as Record<string, unknown> & { id?: string }));
        const archivedChats = chats.filter(c => c.archived);
        const activeChats = chats.filter(c => !c.archived);
        const totalUnread = activeChats.reduce((sum, chat) => sum + (chat.unreadCount || 0), 0);
        set({ chats: activeChats, archivedChats, totalUnread });
      },
    );
  },

  subscribeMessages: (chatId, limitCount = 50) => {
    if (!isFirestoreAvailable() || !chatId) return () => { };
    return subscribeToSubcollection<Message>(
      COLLECTIONS.CHATS,
      chatId,
      COLLECTIONS.MESSAGES,
      [orderBy('timestamp', 'desc'), limit(limitCount)],
      (rawMessages) => {
        const messages = rawMessages.map(m => mapMessage(m as unknown as Record<string, unknown> & { id?: string })).reverse();
        set(state => ({
          messages: { ...state.messages, [chatId]: messages },
          hasMore: { ...state.hasMore, [chatId]: messages.length === limitCount },
        }));
      },
    );
  },

  sendMessage: async (chatId, senderId, content, type = 'text', mediaUrl, replyTo) => {
    if (!isFirestoreAvailable()) { return; }
    const rateErr = checkMessageRateLimit();
    if (rateErr) { toast.warning(rateErr); return; }

    const tempId = `${Date.now()}`;
    const replyToId: string | undefined = typeof replyTo === 'string' ? replyTo : replyTo?.id;
    const message: Message = {
      id: tempId,
      chatId,
      senderId,
      content: sanitizeText(content),
      type: type as MessageType,
      mediaUrl,
      timestamp: new Date(),
      deliveryStatus: 'sending',
      replyTo: replyToId,
    };

    get().addMessage(message);

    if (!isOnline()) {
      enqueueOfflineMessage({
        chatId,
        senderId,
        content,
        type: 'direct',
        messageType: type,
        mediaUrl,
        replyTo: replyToId,
      });
      return;
    }

    try {
      const newDocId = await addDocToSubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, {
        ...message,
        timestamp: serverTimestamp(),
      });
      updateDocById(COLLECTIONS.CHATS, chatId, {
        lastMessage: content,
        lastMessageSenderId: senderId,
        updatedAt: serverTimestamp(),
      });
      set(state => ({
        messages: {
          ...state.messages,
          [chatId]: (state.messages[chatId] || []).map(m => m.id === tempId ? { ...m, id: newDocId, deliveryStatus: 'sent' as const } : m),
        }
      }));
    } catch (error) {
      logStoreError('sendMessage', error, { chatId, senderId });
      set(state => ({
        messages: {
          ...state.messages,
          [chatId]: (state.messages[chatId] || []).map(m => m.id === tempId ? { ...m, deliveryStatus: 'failed' as const } : m),
        }
      }));
    }
  },

  editMessage: async (chatId, messageId, content) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateSubcollectionDoc(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, messageId, { content: sanitizeText(content), edited: true });
    } catch (error) {
      logStoreError('editMessage', error, { chatId, messageId });
    }
  },

  deleteMessage: async (chatId, messageId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateSubcollectionDoc(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, messageId, { content: 'This message was deleted', type: 'deleted' });
    } catch (error) {
      logStoreError('deleteMessage', error, { chatId, messageId });
    }
  },

  deleteForEveryone: async (chatId, messageId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await deleteSubcollectionDoc(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, messageId);
    } catch (error) {
      logStoreError('deleteForEveryone', error, { chatId, messageId });
    }
  },

  recallMessage: async (chatId, messageId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await deleteSubcollectionDoc(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, messageId);
    } catch (error) {
      logStoreError('recallMessage', error, { chatId, messageId });
    }
  },

  addReaction: async (chatId, messageId, emoji, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      const message = get().messages[chatId]?.find(m => m.id === messageId);
      if (message) {
        const reactions = { ...(message.reactions || {}) };
        if (reactions[emoji]?.includes(userId)) {
          reactions[emoji] = reactions[emoji].filter(id => id !== userId);
        } else {
          reactions[emoji] = [...(reactions[emoji] || []), userId];
        }
        await updateSubcollectionDoc(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, messageId, { reactions });
      }
    } catch (error) {
      logStoreError('addReaction', error, { chatId, messageId, emoji, userId });
    }
  },

  markAsRead: async (chatId, currentUserId) => {
    if (!isFirestoreAvailable() || !chatId || !currentUserId) return;
    try {
      await updateDocById(COLLECTIONS.CHATS, chatId, { unreadCount: 0 });

      const unreadMessages = await querySubcollection<Message>(
        COLLECTIONS.CHATS,
        chatId,
        COLLECTIONS.MESSAGES,
        [where('deliveryStatus', '!=', 'read')],
      );

      const othersMessages = unreadMessages.filter(m => m.senderId !== currentUserId);
      if (othersMessages.length > 0) {
        await Promise.all(
          othersMessages.map(m =>
            updateSubcollectionDoc(
              COLLECTIONS.CHATS,
              chatId,
              COLLECTIONS.MESSAGES,
              m.id,
              { deliveryStatus: 'read', readAt: serverTimestamp() },
            )
          )
        );
      }
    } catch (error) {
      logStoreError('markAsRead', error, { chatId, currentUserId });
    }
  },

  createDirectChat: async (userId, currentUserId) => {
    if (!isFirestoreAvailable() || !userId || !currentUserId) return null;
    if (userId === currentUserId) {
      toast.error("You can't start a chat with yourself.");
      return null;
    }

    try {
      const existingChats = await queryCollection<Chat>(
        COLLECTIONS.CHATS,
        [
          where('type', '==', 'direct'),
          where('participants', 'array-contains-all', [userId, currentUserId]),
        ],
      );

      if (existingChats.length > 0) {
        return mapChat(existingChats[0] as unknown as Record<string, unknown> & { id?: string });
      }

      const newChatId = await addDocToCollection(COLLECTIONS.CHATS, {
        type: 'direct',
        participants: [userId, currentUserId],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        unreadCount: 0,
      });

      return { id: newChatId } as Chat;
    } catch (error) {
      logStoreError('createDirectChat', error, { userId, currentUserId });
      toast.error('Failed to create chat. Please try again.');
      return null;
    }
  },

  loadOlderMessages: async (chatId) => {
    if (!isFirestoreAvailable() || !chatId) return;

    const state = get();
    if (!state.hasMore[chatId]) {
      return;
    }

    try {
      const currentMessages = state.messages[chatId] || [];
      const lastMessage = currentMessages.length > 0 ? currentMessages[0] : null;

      const olderMessages = await querySubcollection<Message>(
        COLLECTIONS.CHATS,
        chatId,
        COLLECTIONS.MESSAGES,
        [
          orderBy('timestamp', 'desc'),
          startAfter(lastMessage?.timestamp || new Date()),
          limit(50),
        ],
      );

      const mappedOlder = olderMessages.map(m => mapMessage(m as unknown as Record<string, unknown> & { id?: string }));

      set(s => ({
        messages: {
          ...s.messages,
          [chatId]: [...mappedOlder.reverse(), ...currentMessages],
        },
        hasMore: {
          ...s.hasMore,
          [chatId]: olderMessages.length === 50,
        },
      }));
    } catch (error) {
      logStoreError('loadOlderMessages', error, { chatId });
      toast.error('Failed to load older messages.');
    }
  },

  muteChat: async (chatId) => {
    if (!isFirestoreAvailable() || !chatId) return;

    try {
      const chat = get().chats.find(c => c.id === chatId);
      if (!chat) {
        toast.error('Chat not found.');
        return;
      }

      const newMutedState = !chat.isMuted;
      await updateDocById(COLLECTIONS.CHATS, chatId, { isMuted: newMutedState });

      set(s => ({
        chats: s.chats.map(c =>
          c.id === chatId ? { ...c, isMuted: newMutedState } : c
        ),
      }));
      toast.success(`Chat ${newMutedState ? 'muted' : 'unmuted'}.`);
    } catch (error) {
      logStoreError('muteChat', error, { chatId });
      toast.error('Failed to update mute status.');
    }
  },

  updateChat: async (chatId, data) => {
    if (!isFirestoreAvailable() || !chatId) return;

    try {
      await updateDocById(COLLECTIONS.CHATS, chatId, data);
      set(s => ({
        chats: s.chats.map(c =>
          c.id === chatId ? { ...c, ...data } : c
        ),
      }));
      toast.success('Chat updated successfully.');
    } catch (error) {
      logStoreError('updateChat', error, { chatId, data });
      toast.error('Failed to update chat.');
    }
  },

  removeParticipant: async (chatId, userId) => {
    if (!isFirestoreAvailable() || !chatId || !userId) return;

    try {
      const chat = get().chats.find(c => c.id === chatId);
      if (!chat) {
        toast.error('Chat not found.');
        return;
      }

      const newParticipants = chat.participants.filter(p => p !== userId);
      await updateDocById(COLLECTIONS.CHATS, chatId, { participants: newParticipants });

      set(s => ({
        chats: s.chats.map(c =>
          c.id === chatId ? { ...c, participants: newParticipants } : c
        ),
      }));
      toast.success('Participant removed successfully.');
    } catch (error) {
      logStoreError('removeParticipant', error, { chatId, userId });
      toast.error('Failed to remove participant.');
    }
  },

  promoteAdmin: async (chatId, userId) => {
    if (!isFirestoreAvailable() || !chatId || !userId) return;

    try {
      const chat = get().chats.find(c => c.id === chatId);
      if (!chat) {
        toast.error('Chat not found.');
        return;
      }

      const admins = chat.admins ?? [];
      if (admins.includes(userId)) {
        toast.info('User is already an admin.');
        return;
      }

      const newAdmins = [...admins, userId];
      await updateDocById(COLLECTIONS.CHATS, chatId, { admins: newAdmins });

      set(s => ({
        chats: s.chats.map(c =>
          c.id === chatId ? { ...c, admins: newAdmins } : c
        ),
      }));
      toast.success('Admin promoted successfully.');
    } catch (error) {
      logStoreError('promoteAdmin', error, { chatId, userId });
      toast.error('Failed to promote admin.');
    }
  },

  demoteAdmin: async (chatId, userId) => {
    if (!isFirestoreAvailable() || !chatId || !userId) return;

    try {
      const chat = get().chats.find(c => c.id === chatId);
      if (!chat) {
        toast.error('Chat not found.');
        return;
      }

      const admins = chat.admins ?? [];
      if (!admins.includes(userId)) {
        toast.info('User is not an admin.');
        return;
      }

      const newAdmins = admins.filter(adminId => adminId !== userId);
      await updateDocById(COLLECTIONS.CHATS, chatId, { admins: newAdmins });

      set(s => ({
        chats: s.chats.map(c =>
          c.id === chatId ? { ...c, admins: newAdmins } : c
        ),
      }));
      toast.success('Admin demoted successfully.');
    } catch (error) {
      logStoreError('demoteAdmin', error, { chatId, userId });
      toast.error('Failed to demote admin.');
    }
  },

  clearChat: async (chatId) => {
    if (!isFirestoreAvailable() || !chatId) return;

    try {
      const allMessages = await querySubcollection<Message>(
        COLLECTIONS.CHATS,
        chatId,
        COLLECTIONS.MESSAGES,
        [],
      );
      if (allMessages.length > 0) {
        await Promise.all(
          allMessages.map(m =>
            deleteSubcollectionDoc(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, m.id)
          )
        );
      }

      set(s => ({
        messages: {
          ...s.messages,
          [chatId]: [],
        },
      }));
      toast.success('Chat cleared successfully.');
    } catch (error) {
      logStoreError('clearChat', error, { chatId });
      toast.error('Failed to clear chat.');
    }
  },

  leaveGroup: async (chatId, userId) => {
    if (!isFirestoreAvailable() || !chatId || !userId) return;

    try {
      const chat = get().chats.find(c => c.id === chatId);
      if (!chat) {
        toast.error('Chat not found.');
        return;
      }

      const newParticipants = chat.participants.filter(p => p !== userId);
      await updateDocById(COLLECTIONS.CHATS, chatId, { participants: newParticipants });

      set(s => ({
        chats: s.chats.filter(c => c.id !== chatId),
      }));
      toast.success('You have left the group.');
    } catch (error) {
      logStoreError('leaveGroup', error, { chatId, userId });
      toast.error('Failed to leave group.');
    }
  },

  addParticipant: async (chatId, userId) => {
    if (!isFirestoreAvailable() || !chatId || !userId) return;

    try {
      const chat = get().chats.find(c => c.id === chatId);
      if (!chat) {
        toast.error('Chat not found.');
        return;
      }

      if (chat.participants.includes(userId)) {
        toast.info('User is already in the chat.');
        return;
      }

      const newParticipants = [...chat.participants, userId];
      await updateDocById(COLLECTIONS.CHATS, chatId, { participants: newParticipants });

      set(s => ({
        chats: s.chats.map(c =>
          c.id === chatId ? { ...c, participants: newParticipants } : c
        ),
      }));
      toast.success('Participant added successfully.');
    } catch (error) {
      logStoreError('addParticipant', error, { chatId, userId });
      toast.error('Failed to add participant.');
    }
  },

  sendPoll: async (chatId, senderId, question, options) => {
    if (!isFirestoreAvailable() || !chatId || !senderId) return;

    try {
      const pollData: PollData = {
        question,
        options: options.map(option => ({ text: option, votes: [] })),
        totalVotes: 0,
      };

      const messageData = {
        chatId,
        senderId,
        type: 'poll',
        pollData,
        createdAt: serverTimestamp(),
      };

      await addDocToSubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, messageData);
      toast.success('Poll sent successfully.');
    } catch (error) {
      logStoreError('sendPoll', error, { chatId, senderId });
      toast.error('Failed to send poll.');
    }
  },

  votePoll: async (chatId, messageId, optionIndex, userId) => {
    if (!isFirestoreAvailable() || !chatId || !messageId || !userId) return;

    try {
      const message = get().messages[chatId]?.find(m => m.id === messageId);
      if (!message || message.type !== 'poll' || !message.pollData) {
        toast.error('Poll not found.');
        return;
      }

      const pollData = { ...message.pollData };
      const option = pollData.options[optionIndex];
      if (!option) {
        toast.error('Invalid option.');
        return;
      }

      // Allow changing vote
      pollData.options.forEach(opt => {
        opt.votes = opt.votes.filter(v => v !== userId);
      });

      option.votes.push(userId);

      await updateSubcollectionDoc(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, messageId, { pollData });
      toast.success('Vote cast successfully.');
    } catch (error) {
      logStoreError('votePoll', error, { chatId, messageId, optionIndex, userId });
      toast.error('Failed to cast vote.');
    }
  },

  pinMessage: async (chatId, messageId, content) => {
    if (!isFirestoreAvailable() || !chatId || !messageId) return;

    try {
      const chat = get().chats.find(c => c.id === chatId);
      if (!chat) {
        toast.error('Chat not found.');
        return;
      }

      const newPinnedMessage: PinnedMessage = {
        messageId,
        message_id: messageId,
        content,
        pinnedAt: new Date().toISOString(),
        pinned_at: new Date().toISOString(),
        pinnedBy: '',
        pinned_by: '',
      };
      const newPinnedMessages = [...(chat.pinnedMessages || []), newPinnedMessage];

      await updateDocById(COLLECTIONS.CHATS, chatId, { pinnedMessages: newPinnedMessages });

      set(s => ({
        chats: s.chats.map(c =>
          c.id === chatId ? { ...c, pinnedMessages: newPinnedMessages } : c
        ),
      }));
      toast.success('Message pinned successfully.');
    } catch (error) {
      logStoreError('pinMessage', error, { chatId, messageId });
      toast.error('Failed to pin message.');
    }
  },

  unpinMessage: async (chatId, messageId) => {
    if (!isFirestoreAvailable() || !chatId || !messageId) return;

    try {
      const chat = get().chats.find(c => c.id === chatId);
      if (!chat) {
        toast.error('Chat not found.');
        return;
      }

      const newPinnedMessages = (chat.pinnedMessages || []).filter(p => p.messageId !== messageId);
      await updateDocById(COLLECTIONS.CHATS, chatId, { pinnedMessages: newPinnedMessages });

      set(s => ({
        chats: s.chats.map(c =>
          c.id === chatId ? { ...c, pinnedMessages: newPinnedMessages } : c
        ),
      }));
      toast.success('Message unpinned successfully.');
    } catch (error) {
      logStoreError('unpinMessage', error, { chatId, messageId });
      toast.error('Failed to unpin message.');
    }
  },

  archiveChat: async (chatId) => {
    if (!isFirestoreAvailable() || !chatId) return;

    try {
      await updateDocById(COLLECTIONS.CHATS, chatId, { archived: true });
      set(s => {
        const chatToArchive = s.chats.find(c => c.id === chatId);
        if (!chatToArchive) return s;
        return {
          chats: s.chats.filter(c => c.id !== chatId),
          archivedChats: [...s.archivedChats, { ...chatToArchive, archived: true }],
        };
      });
      toast.success('Chat archived.');
    } catch (error) {
      logStoreError('archiveChat', error, { chatId });
      toast.error('Failed to archive chat.');
    }
  },

  unarchiveChat: async (chatId) => {
    if (!isFirestoreAvailable() || !chatId) return;

    try {
      await updateDocById(COLLECTIONS.CHATS, chatId, { archived: false });
      set(s => {
        const chatToUnarchive = s.archivedChats.find(c => c.id === chatId);
        if (!chatToUnarchive) return s;
        return {
          archivedChats: s.archivedChats.filter(c => c.id !== chatId),
          chats: [...s.chats, { ...chatToUnarchive, archived: false }],
        };
      });
      toast.success('Chat unarchived.');
    } catch (error) {
      logStoreError('unarchiveChat', error, { chatId });
      toast.error('Failed to unarchive chat.');
    }
  },

  setDisappearingMessages: async (chatId, seconds) => {
    if (!isFirestoreAvailable() || !chatId) return;

    try {
      await updateDocById(COLLECTIONS.CHATS, chatId, { disappearingMessages: seconds });
      set(s => ({
        chats: s.chats.map(c =>
          c.id === chatId ? { ...c, disappearingMessages: seconds } : c
        ),
      }));
      toast.success('Disappearing messages timer updated.');
    } catch (error) {
      logStoreError('setDisappearingMessages', error, { chatId, seconds });
      toast.error('Failed to update disappearing messages timer.');
    }
  },

  lockChat: async (chatId, lockType, lockValue) => {
    if (!isFirestoreAvailable() || !chatId) return;

    try {
      await updateDocById(COLLECTIONS.CHATS, chatId, { chatLocked: true, lockType, lockValue });
      set(s => ({
        chats: s.chats.map(c =>
          c.id === chatId ? { ...c, chatLocked: true, lockType, lockValue } : c
        ),
      }));
      toast.success('Chat locked.');
    } catch (error) {
      logStoreError('lockChat', error, { chatId });
      toast.error('Failed to lock chat.');
    }
  },

  unlockChat: async (chatId) => {
    if (!isFirestoreAvailable() || !chatId) return;

    try {
      await updateDocById(COLLECTIONS.CHATS, chatId, { chatLocked: false, lockType: null, lockValue: null });
      set(s => ({
        chats: s.chats.map(c =>
          c.id === chatId ? { ...c, chatLocked: false, lockType: undefined, lockValue: undefined } : c
        ),
      }));
      toast.success('Chat unlocked.');
    } catch (error) {
      logStoreError('unlockChat', error, { chatId });
      toast.error('Failed to unlock chat.');
    }
  },

  sendContactCard: async (chatId, senderId, contactData) => {
    if (!isFirestoreAvailable() || !chatId || !senderId) return;

    try {
      const messageData = {
        chatId,
        senderId,
        type: 'contact_card',
        contactCard: contactData,
        createdAt: serverTimestamp(),
      };

      await addDocToSubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, messageData);
      toast.success('Contact card sent successfully.');
    } catch (error) {
      logStoreError('sendContactCard', error, { chatId, senderId });
      toast.error('Failed to send contact card.');
    }
  },

  exportChat: async (chatId) => {
    if (!isFirestoreAvailable() || !chatId) return null;

    try {
      const messages = get().messages[chatId] || [];
      if (messages.length === 0) {
        toast.info('No messages to export.');
        return null;
      }

      const chat = get().chats.find(c => c.id === chatId);
      const dataToExport = {
        chatInfo: chat,
        messages: messages,
      };

      // In a real app, you would use a library to generate a file (e.g., CSV, JSON)
      // and trigger a download. For this example, we'll just return the data.
      toast.success('Chat exported successfully.');
      return dataToExport;
    } catch (error) {
      logStoreError('exportChat', error, { chatId });
      toast.error('Failed to export chat.');
      return null;
    }
  },

  getSharedMedia: async (chatId, mediaType) => {
    if (!isFirestoreAvailable() || !chatId) return [];

    try {
      const messages = get().messages[chatId] || [];
      const mediaMessages = messages.filter(m => {
        const mediaTypes: MessageType[] = ['image', 'video', 'file', 'voice'];
        if (!mediaTypes.includes(m.type)) return false;
        if (mediaType) {
          // Match against either media URL content or the message type
          if (m.mediaUrl?.includes(mediaType)) return true;
          if (mediaType === 'image' && m.type === 'image') return true;
          if (mediaType === 'video' && m.type === 'video') return true;
          if (mediaType === 'voice' && m.type === 'voice') return true;
          if (mediaType === 'file' && m.type === 'file') return true;
          return false;
        }
        return true;
      });
      return mediaMessages;
    } catch (error) {
      logStoreError('getSharedMedia', error, { chatId, mediaType });
      toast.error('Failed to get shared media.');
      return [];
    }
  },
}));