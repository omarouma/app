import { create } from 'zustand';
import { toast } from 'sonner';
import type { Chat, Message, MessageType, PinnedMessage } from '@/types';
import { chatApi, mapMessage, mapChat } from '@/services/chatApi';
import {
  isFirestoreAvailable,
  COLLECTIONS,
  queryCollection,
  querySubcollection,
  subscribeToCollection,
  subscribeToSubcollection,
  where,
  orderBy,
  limit,
  startAfter,
} from '@/lib/firestore';
import { checkMessageRateLimit } from '@/hooks/useMessageRateLimiter';
import { isOnline, enqueueOfflineMessage } from '@/lib/offlineQueue';
import { sanitizeText } from '@/lib/sanitize';
import { logStoreError } from '@/lib/errorLogger';
import { withRetry } from '@/lib/errorHandling';
import { subscribeDeduped } from '@/lib/subscriptionManager';
import { v4 as uuidv4 } from 'uuid';

/**
 * Chat Store - Refactored to use API layer
 *
 * This store now delegates all I/O operations to the chatApi service,
 * keeping only pure state management logic. This separation of concerns
 * makes the store easier to test, maintain, and extend.
 */

const matchesMessageIdentity = (left: Partial<Message> | undefined, right: Partial<Message> | undefined) => {
  if (!left || !right) return false;

  const leftKeys = [left.localId, left.id].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
  const rightKeys = [right.localId, right.id].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );

  if (leftKeys.length === 0 || rightKeys.length === 0) {
    return !!left.id && !!right.id && left.id === right.id;
  }

  return leftKeys.some((value) => rightKeys.includes(value));
};

interface ChatStore {
  chats: Chat[];
  archivedChats: Chat[];
  messages: Record<string, Message[]>;
  loadingChats: boolean;
  hasMore: Record<string, boolean>;
  totalUnread: number;
  pendingMessageIds: string[]; // Track unsent messages with UUIDs
  lastSendError?: { message: string; timestamp: number };

  fetchChats: (userId?: string) => Promise<void>;
  addMessage: (message: Message) => void;
  subscribeChats: (userId: string) => () => void;
  subscribeMessages: (chatId: string, limit?: number) => () => void;
  sendMessage: (chatId: string, senderId: string, content: string, type?: string, mediaUrl?: string, replyTo?: Message | string) => Promise<{ success: boolean; id: string }>;
  retryFailedMessage: (chatId: string, localId: string) => Promise<{ success: boolean; id: string }>;
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
  pendingMessageIds: [],
  lastSendError: undefined,

  addMessage: (message) => {
    set((state) => {
      const chatMessages = state.messages[message.chatId] ?? [];
      const matchMessage = (candidate: Message) => matchesMessageIdentity(candidate, message);

      const existing = chatMessages.find(matchMessage);
      if (existing) {
        return {
          messages: {
            ...state.messages,
            [message.chatId]: chatMessages.map((candidate) =>
              matchMessage(candidate)
                ? { ...existing, ...message, id: message.id ?? existing.id, localId: message.localId ?? existing.localId }
                : candidate
            ),
          },
        };
      }

      return {
        messages: {
          ...state.messages,
          [message.chatId]: [...chatMessages, message],
        },
      };
    });
  },

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

  subscribeChats: (userId) => {
    if (!isFirestoreAvailable() || !userId) return () => { };
    return subscribeDeduped(
      `chats_${userId}`,
      () => subscribeToCollection<Chat>(
        COLLECTIONS.CHATS,
        [where('participants', 'array-contains', userId)],
        (rawChats) => {
          const chats = rawChats.map(c => mapChat(c as unknown as Record<string, unknown> & { id?: string }));
          const archivedChats = chats.filter(c => c.archived);
          const activeChats = chats.filter(c => !c.archived);
          const totalUnread = activeChats.reduce((sum, chat) => sum + (chat.unreadCount || 0), 0);
          set({ chats: activeChats, archivedChats, totalUnread });
        },
      )
    );
  },

  subscribeMessages: (chatId, limitCount = 50) => {
    if (!isFirestoreAvailable() || !chatId) return () => { };
    return subscribeDeduped(
      `messages_${chatId}`,
      () => subscribeToSubcollection<Message>(
        COLLECTIONS.CHATS,
        chatId,
        COLLECTIONS.MESSAGES,
        [orderBy('timestamp', 'desc'), limit(limitCount)],
        (rawMessages) => {
          const incomingMessages = rawMessages.map(m => mapMessage(m as unknown as Record<string, unknown> & { id?: string })).reverse();
          // Merge incoming server messages with existing local state using atomic matching logic.
          // This prevents the race condition where subscription replacement overwrites pending
          // tempId→newDocId mappings before the store can reconcile them.
          set(state => {
            const mergedMessages = state.messages[chatId] ?? [];

            for (const incomingMsg of incomingMessages) {
              const matchMessage = (candidate: Message) => matchesMessageIdentity(candidate, incomingMsg);

              const existingIdx = mergedMessages.findIndex(matchMessage);
              if (existingIdx >= 0) {
                // Merge: preserve optimistic delivery status if it's ahead
                const existing = mergedMessages[existingIdx];
                const optimisticDeliveryPriority = { sending: 3, sent: 2, failed: 1, delivered: 0 };
                const incomingPriority = optimisticDeliveryPriority[incomingMsg.deliveryStatus as keyof typeof optimisticDeliveryPriority] ?? 0;
                const existingPriority = optimisticDeliveryPriority[existing.deliveryStatus as keyof typeof optimisticDeliveryPriority] ?? 0;

                mergedMessages[existingIdx] = {
                  ...existing,
                  ...incomingMsg,
                  // Preserve the server ID but keep localId for future correlation
                  id: incomingMsg.id,
                  localId: incomingMsg.localId ?? existing.localId,
                  // Use the most optimistic delivery status (don't downgrade 'sent' to a lower state)
                  deliveryStatus: existingPriority > incomingPriority ? existing.deliveryStatus : incomingMsg.deliveryStatus,
                };
              } else {
                // New message from server
                mergedMessages.push(incomingMsg);
              }
            }

            return {
              messages: { ...state.messages, [chatId]: mergedMessages },
              hasMore: { ...state.hasMore, [chatId]: incomingMessages.length === limitCount },
            };
          });
        },
      )
    );
  },

  sendMessage: async (chatId, senderId, content, type = 'text', mediaUrl, replyTo) => {
    if (!isFirestoreAvailable()) { return { success: false, id: '' }; }

    const cleanedContent = sanitizeText(content ?? '').trim();
    const hasMediaContent = !!mediaUrl;

    if (!cleanedContent && !hasMediaContent) {
      return { success: false, id: '' };
    }

    const rateErr = checkMessageRateLimit();
    if (rateErr) { toast.warning(rateErr); return { success: false, id: '' }; }

    // Generate UUID locally - guaranteed unique + deterministic for sorting
    const tempId = uuidv4();
    const now = Date.now();

    const replyToId: string | undefined = typeof replyTo === 'string' ? replyTo : replyTo?.id;
    const message: Message = {
      id: tempId,
      chatId,
      senderId,
      content: cleanedContent || '',
      type: type as MessageType,
      mediaUrl,
      timestamp: new Date(now),
      deliveryStatus: 'sending',
      replyTo: replyToId,
      localId: tempId, // Track the client-generated ID
      retryCount: 0,
    };

    // Optimistic update - add message to store immediately
    get().addMessage(message);

    // Track pending message ID
    set(state => ({
      pendingMessageIds: [...state.pendingMessageIds, tempId],
    }));

    // Offline handling
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
      return { success: true, id: tempId }; // Local ID returned
    }

    try {
      // Send to database via chatApi with retry for transient errors
      const result = await withRetry(
        () => chatApi.sendMessage({
          chatId,
          senderId,
          content: cleanedContent,
          type,
          mediaUrl,
          replyTo: replyToId,
        }),
        2,
        500,
        { component: 'useChatStore', action: 'sendMessage', userId: senderId },
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to send message');
      }

      const newDocId = result.id;

      // Update message with server ID and mark as sent
      set(state => {
        const updatedMessages = { ...state.messages };
        updatedMessages[chatId] = (state.messages[chatId] || []).map(m =>
          m.id === tempId
            ? { ...m, id: newDocId, deliveryStatus: 'sent' as const, localId: tempId }
            : m
        );
        return {
          messages: updatedMessages,
          pendingMessageIds: state.pendingMessageIds.filter(id => id !== tempId),
        };
      });

      return { success: true, id: newDocId };
    } catch (error) {
      logStoreError('sendMessage', error, { chatId, senderId, tempId });

      // Mark message as failed but keep it in store for retry
      set(state => {
        const updatedMessages = { ...state.messages };
        updatedMessages[chatId] = (state.messages[chatId] || []).map(m =>
          m.id === tempId
            ? { ...m, deliveryStatus: 'failed' as const, retryCount: (m.retryCount || 0) + 1 }
            : m
        );
        return {
          messages: updatedMessages,
          lastSendError: { message: String(error), timestamp: Date.now() },
        };
      });

      // Keep in pending for retry
      return { success: false, id: tempId };
    }
  },

  // Retry failed message with exponential backoff
  retryFailedMessage: async (chatId, localId) => {
    const state = get();
    const failedMsg = state.messages[chatId]?.find(m => m.localId === localId || m.id === localId);

    if (!failedMsg) {
      throw new Error(`Message not found: ${localId}`);
    }

    if (failedMsg.deliveryStatus !== 'failed') {
      throw new Error('Message is not in failed state');
    }

    // Check retry limit (max 3 attempts)
    if ((failedMsg.retryCount || 0) >= 3) {
      throw new Error('Message retry limit exceeded');
    }

    // Exponential backoff: 1s, 2s, 4s
    const delay = Math.pow(2, failedMsg.retryCount || 0) * 1000;
    await new Promise(r => setTimeout(r, delay));

    // Retry send
    try {
      set(state => {
        const updatedMessages = { ...state.messages };
        updatedMessages[chatId] = (state.messages[chatId] || []).map(m =>
          m.id === failedMsg.id
            ? { ...m, deliveryStatus: 'sending' as const }
            : m
        );
        return { messages: updatedMessages };
      });

      const result = await withRetry(
        () => chatApi.retryFailedMessage(chatId, localId, failedMsg.content, failedMsg.senderId),
        2,
        500,
        { component: 'useChatStore', action: 'retryFailedMessage', userId: failedMsg.senderId },
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to retry message');
      }

      const newDocId = result.id;

      set(state => {
        const updatedMessages = { ...state.messages };
        updatedMessages[chatId] = (state.messages[chatId] || []).map(m =>
          m.id === failedMsg.id || m.localId === localId
            ? { ...m, id: newDocId, deliveryStatus: 'sent' as const }
            : m
        );
        return {
          messages: updatedMessages,
          pendingMessageIds: state.pendingMessageIds.filter(id => id !== failedMsg.id && id !== localId),
        };
      });

      return { success: true, id: newDocId };
    } catch (error) {
      logStoreError('retryFailedMessage', error, { chatId, localId });

      set(state => ({
        messages: {
          ...state.messages,
          [chatId]: (state.messages[chatId] || []).map(m =>
            m.id === failedMsg.id || m.localId === localId
              ? { ...m, deliveryStatus: 'failed' as const, retryCount: (m.retryCount || 0) + 1 }
              : m
          ),
        }
      }));

      throw error;
    }
  },

  editMessage: async (chatId, messageId, content) => {
    if (!isFirestoreAvailable()) return;
    try {
      await chatApi.editMessage(chatId, messageId, content);
    } catch (error) {
      logStoreError('editMessage', error, { chatId, messageId });
    }
  },

  deleteMessage: async (chatId, messageId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await chatApi.deleteMessage(chatId, messageId);
    } catch (error) {
      logStoreError('deleteMessage', error, { chatId, messageId });
    }
  },

  deleteForEveryone: async (chatId, messageId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await chatApi.deleteForEveryone(chatId, messageId);
    } catch (error) {
      logStoreError('deleteForEveryone', error, { chatId, messageId });
    }
  },

  recallMessage: async (chatId, messageId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await chatApi.recallMessage(chatId, messageId);
    } catch (error) {
      logStoreError('recallMessage', error, { chatId, messageId });
    }
  },

  addReaction: async (chatId, messageId, emoji, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await chatApi.addReaction(chatId, messageId, emoji, userId);
    } catch (error) {
      logStoreError('addReaction', error, { chatId, messageId, emoji, userId });
    }
  },

  markAsRead: async (chatId, currentUserId) => {
    if (!chatId || !currentUserId) return;
    try {
      await chatApi.markAsRead(chatId, currentUserId);
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
      return await withRetry(
        () => chatApi.createDirectChat(userId, currentUserId),
        2,
        500,
        { component: 'useChatStore', action: 'createDirectChat', userId: currentUserId },
      );
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
      await withRetry(
        () => chatApi.toggleMuteChat(chatId, newMutedState),
        2,
        500,
        { component: 'useChatStore', action: 'muteChat' },
      );

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
      await withRetry(
        () => chatApi.updateChat(chatId, data),
        2,
        500,
        { component: 'useChatStore', action: 'updateChat' },
      );
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
      await withRetry(
        () => chatApi.removeParticipant(chatId, userId),
        2,
        500,
        { component: 'useChatStore', action: 'removeParticipant' },
      );

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
      await withRetry(
        () => chatApi.promoteAdmin(chatId, userId),
        2,
        500,
        { component: 'useChatStore', action: 'promoteAdmin' },
      );

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
      await withRetry(
        () => chatApi.demoteAdmin(chatId, userId),
        2,
        500,
        { component: 'useChatStore', action: 'demoteAdmin' },
      );

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
      await withRetry(
        () => chatApi.clearChat(chatId),
        2,
        500,
        { component: 'useChatStore', action: 'clearChat' },
      );

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

      await withRetry(
        () => chatApi.leaveGroup(chatId, userId),
        2,
        500,
        { component: 'useChatStore', action: 'leaveGroup' },
      );

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

      await withRetry(
        () => chatApi.addParticipant(chatId, userId),
        2,
        500,
        { component: 'useChatStore', action: 'addParticipant' },
      );

      set(s => ({
        chats: s.chats.map(c =>
          c.id === chatId ? { ...c, participants: [...c.participants, userId] } : c
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
      await chatApi.sendPoll(chatId, senderId, question, options);
      toast.success('Poll sent successfully.');
    } catch (error) {
      logStoreError('sendPoll', error, { chatId, senderId });
      toast.error('Failed to send poll.');
    }
  },

  votePoll: async (chatId, messageId, optionIndex, userId) => {
    if (!isFirestoreAvailable() || !chatId || !messageId || !userId) return;

    try {
      await chatApi.votePoll(chatId, messageId, optionIndex, userId);
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

      await withRetry(
        () => chatApi.pinMessage(chatId, messageId, content),
        2,
        500,
        { component: 'useChatStore', action: 'pinMessage' },
      );

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
      await withRetry(
        () => chatApi.unpinMessage(chatId, messageId),
        2,
        500,
        { component: 'useChatStore', action: 'unpinMessage' },
      );

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
      await withRetry(
        () => chatApi.archiveChat(chatId),
        2,
        500,
        { component: 'useChatStore', action: 'archiveChat' },
      );
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
      await withRetry(
        () => chatApi.unarchiveChat(chatId),
        2,
        500,
        { component: 'useChatStore', action: 'unarchiveChat' },
      );
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
      await withRetry(
        () => chatApi.setDisappearingMessages(chatId, seconds),
        2,
        500,
        { component: 'useChatStore', action: 'setDisappearingMessages' },
      );
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
      await withRetry(
        () => chatApi.lockChat(chatId, lockType, lockValue),
        2,
        500,
        { component: 'useChatStore', action: 'lockChat' },
      );
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
      await withRetry(
        () => chatApi.unlockChat(chatId),
        2,
        500,
        { component: 'useChatStore', action: 'unlockChat' },
      );
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
      const tempId = uuidv4();
      const content = `Contact: ${contactData.name || contactData.username || 'User'}`;
      const optimisticMsg: Message = {
        id: tempId,
        localId: tempId,
        chatId,
        senderId,
        content,
        type: 'contact_card',
        contactCard: contactData,
        timestamp: new Date(),
        deliveryStatus: 'sending',
        retryCount: 0,
      };
      get().addMessage(optimisticMsg);
      set(state => ({
        pendingMessageIds: [...state.pendingMessageIds, tempId],
      }));

      if (!isOnline()) {
        enqueueOfflineMessage({
          chatId,
          senderId,
          content,
          type: 'direct',
          messageType: 'contact_card',
        });
        return;
      }

      await withRetry(
        () => chatApi.sendContactCard(chatId, senderId, contactData),
        2,
        500,
        { component: 'useChatStore', action: 'sendContactCard', userId: senderId },
      );

      set(state => {
        const updatedMessages = { ...state.messages };
        updatedMessages[chatId] = (state.messages[chatId] || []).map(m =>
          m.id === tempId || m.localId === tempId
            ? { ...m, deliveryStatus: 'sent' as const, localId: tempId }
            : m
        );
        return {
          messages: updatedMessages,
          pendingMessageIds: state.pendingMessageIds.filter(id => id !== tempId),
        };
      });
      toast.success('Contact card sent successfully.');
    } catch (error) {
      logStoreError('sendContactCard', error, { chatId, senderId });
      toast.error('Failed to send contact card.');
    }
  },

  exportChat: async (chatId) => {
    if (!isFirestoreAvailable() || !chatId) return null;

    try {
      const result = await withRetry(
        () => chatApi.exportChat(chatId),
        2,
        500,
        { component: 'useChatStore', action: 'exportChat' },
      );
      if (result) toast.success('Chat exported successfully.');
      return result;
    } catch (error) {
      logStoreError('exportChat', error, { chatId });
      toast.error('Failed to export chat.');
      return null;
    }
  },

  getSharedMedia: async (chatId, mediaType) => {
    if (!isFirestoreAvailable() || !chatId) return [];

    try {
      return await withRetry(
        () => chatApi.getSharedMedia(chatId, mediaType),
        2,
        500,
        { component: 'useChatStore', action: 'getSharedMedia' },
      );
    } catch (error) {
      logStoreError('getSharedMedia', error, { chatId, mediaType });
      toast.error('Failed to get shared media.');
      return [];
    }
  },
}));
