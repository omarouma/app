/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';
import { toast } from 'sonner';
import {
  isFirestoreAvailable,
  COLLECTIONS,
  getDocById,
  setDocById,
  updateDocById,
  deleteDocById,
  addDocToCollection,
  addDocToSubcollection,
  queryCollection,
  querySubcollection,
  updateSubcollectionDoc,
  deleteSubcollectionDoc,
  subscribeToCollection,
  subscribeToSubcollection,
  serverTimestamp,
  increment,
} from '@/lib/firestore';
import type { Chat, Message, MessageType, PollData, TransferData, PinnedMessage } from '@/types';
import { where, orderBy, limit, startAfter } from '@/lib/firestore';

const mapMessage = (d: Record<string, unknown>): Message => ({
  id: d.id as string,
  chatId: (d.chatId as string) || '',
  senderId: (d.senderId as string) || '',
  content: (d.content as string) || '',
  type: ((d.type as MessageType) || 'text') as MessageType,
  mediaUrl: (d.mediaUrl as string) || '',
  timestamp: ((rawTs: any) => rawTs && typeof rawTs === 'object' && 'toDate' in rawTs ? rawTs.toDate() : rawTs ? new Date(rawTs as string) : new Date())(d.createdAt ?? d.timestamp),
  read: (d.read as boolean) || false,
  edited: (d.edited as boolean) || false,
  replyTo: (d.replyTo as string) || undefined,
  reactions: (d.reactions as Record<string, string[]>) || {},
  forwardedFrom: (d.forwardedFrom as string) || undefined,
  pollData: d.pollData as PollData | undefined,
  transferData: d.transferData as TransferData | undefined,
  contactCard: d.contactCard as any || undefined,
  disappearingTimer: (d.disappearingTimer as number) || 0,
  disappearingInitiatedAt: d.disappearingInitiatedAt && typeof d.disappearingInitiatedAt === 'object' && 'toDate' in d.disappearingInitiatedAt
    ? (d.disappearingInitiatedAt as any).toDate()
    : d.disappearingInitiatedAt
    ? new Date(d.disappearingInitiatedAt as string)
    : undefined,
  destroyed: (d.destroyed as boolean) || false,
});

const mapChat = (d: Record<string, unknown>): Chat => ({
  id: d.id as string,
  type: ((d.type as string) === 'group' ? 'group' : 'direct') as 'direct' | 'group',
  participants: (d.participants as string[]) || [],
  name: (d.name as string) || '',
  avatar: (d.avatar as string) || '',
  lastMessage: (d.lastMessage as string) || '',
  lastMessageSenderId: (d.lastMessageSenderId as string) || '',
  lastMessageRead: (d.lastMessageRead as boolean) || false,
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
  subscribeChats: (userId: string) => () => void;
  subscribeMessages: (chatId: string) => () => void;
  sendMessage: (chatId: string, senderId: string, content: string, type?: string, mediaUrl?: string, replyTo?: Message | string) => Promise<void>;
  editMessage: (chatId: string, messageId: string, content: string) => Promise<void>;
  deleteMessage: (chatId: string, messageId: string) => Promise<void>;
  deleteForEveryone: (chatId: string, messageId: string) => Promise<void>;
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
  exportChat: (chatId: string) => Promise<any | null>;
  getSharedMedia: (chatId: string, mediaType?: string) => Promise<Message[]>;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  chats: [],
  archivedChats: [],
  messages: {},
  loadingChats: true,
  hasMore: {},

  subscribeChats: (userId: string) => {
    if (!isFirestoreAvailable()) {
      console.warn('[ChatStore.subscribeChats] Firestore unavailable');
      set({ loadingChats: false, chats: [], archivedChats: [] });
      return () => {};
    }
    set({ loadingChats: true });
    if (!userId) {
      set({ chats: [], archivedChats: [], loadingChats: false });
      return () => {};
    }

    // Initial fetch
    const fetchChats = async () => {
      try {
        const data = await queryCollection(COLLECTIONS.CHATS, [
          where('participants', 'array-contains', userId),
          orderBy('updatedAt', 'desc'),
          limit(50),
        ]);

        const allChats: Chat[] = [];
        const archived: Chat[] = [];
        (data || []).forEach((d) => {
          const chat = mapChat(d);
          if (d.archived) archived.push(chat);
          else allChats.push(chat);
        });
        set({ chats: allChats, archivedChats: archived, loadingChats: false });
      } catch {
        set({ loadingChats: false });
      }
    };

    fetchChats();

    // Real-time subscription
    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeToCollection(COLLECTIONS.CHATS, [where('participants', 'array-contains', userId), orderBy('updatedAt', 'desc')], (data) => {
        const allChats: Chat[] = [];
        const archived: Chat[] = [];
        (data || []).forEach((d) => {
          const chat = mapChat(d);
          if (d.archived) archived.push(chat);
          else allChats.push(chat);
        });
        set({ chats: allChats, archivedChats: archived, loadingChats: false });
      });
    } catch {
      // Subscription failed — data will still be loaded via initial fetch
    }

    return () => { if (unsub) unsub(); };
  },

  subscribeMessages: (chatId: string) => {
    if (!chatId) return () => {};

    const fetchInitial = async () => {
      try {
        const data = await querySubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, [
          orderBy('timestamp', 'asc'),
          limit(50),
        ]);

        const msgs = (data || []).map((d) => mapMessage(d));
        set((s) => ({
          messages: { ...s.messages, [chatId]: msgs },
          hasMore: { ...s.hasMore, [chatId]: (data || []).length >= 50 },
        }));
      } catch {
        // ignore
      }
    };

    fetchInitial();

    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeToSubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, [orderBy('timestamp', 'asc')], (data) => {
        const msgs = (data || []).map((d) => mapMessage(d));
        set((s) => ({
          messages: { ...s.messages, [chatId]: msgs },
        }));
      });
    } catch {
      // ignore
    }

    return () => { if (unsub) unsub(); };
  },

  sendMessage: async (chatId, senderId, content, type = 'text', mediaUrl, replyTo) => {
    if (!isFirestoreAvailable()) {
      console.warn('[ChatStore.sendMessage] Firestore unavailable');
      return;
    }
    try {
      // Ensure chat exists before sending
      const existingChat = await getDocById(COLLECTIONS.CHATS, chatId);
      if (!existingChat) {
        const parts = chatId.split('_');
        if (parts.length >= 3 && parts[0] === 'dm') {
          const participants = parts.slice(1).sort();
          await setDocById(COLLECTIONS.CHATS, chatId, {
            type: 'direct',
            participants,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            unreadCount: 0,
          });
        } else if (parts[0] === 'group') {
          console.warn('Group chat does not exist:', chatId);
          return;
        }
      }

      const msgData: Record<string, unknown> = {
        chatId,
        senderId,
        content,
        type,
        timestamp: serverTimestamp(),
        read: false,
      };
      if (mediaUrl) msgData.mediaUrl = mediaUrl;
      if (replyTo) msgData.replyTo = typeof replyTo === 'string' ? replyTo : replyTo.id;

      await addDocToSubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, msgData);

      // Update chat metadata and increment unread count for recipients
      const chatRow = await getDocById(COLLECTIONS.CHATS, chatId);
      const participants = (chatRow?.participants as string[]) || [];
      const otherParticipants = participants.filter((id: string) => id !== senderId);
      if (otherParticipants.length > 0) {
        await updateDocById(COLLECTIONS.CHATS, chatId, {
          lastMessage: content,
          lastMessageSenderId: senderId,
          lastMessageRead: false,
          updatedAt: serverTimestamp(),
          unreadCount: increment(1),
        });
      } else {
        await updateDocById(COLLECTIONS.CHATS, chatId, {
          lastMessage: content,
          lastMessageSenderId: senderId,
          lastMessageRead: false,
          updatedAt: serverTimestamp(),
        });
      }

      // Create notification for each recipient
      if (otherParticipants.length > 0) {
        try {
          const sender = await getDocById(COLLECTIONS.USERS, senderId);
          const senderName = (sender?.name as string) || 'Someone';
          const chatName = (chatRow?.name as string) || (existingChat?.name as string) || '';
          const notifTitle = chatName ? `${senderName} in ${chatName}` : senderName;
          const notifBody = type === 'text' ? content : `Sent a ${type}`;
          for (const recipientId of otherParticipants) {
            await addDocToCollection(COLLECTIONS.NOTIFICATIONS, {
              userId: recipientId,
              type: 'message',
              title: notifTitle,
              body: notifBody,
              read: false,
              data: { chatId, senderId, senderName, messageType: type },
              timestamp: serverTimestamp(),
            });
          }
        } catch { /* notification creation failed, but message was sent */ }
      }
    } catch {
      return;
    }
  },

  editMessage: async (_chatId, messageId, content) => {
    if (!isFirestoreAvailable()) {
      console.warn('[ChatStore.editMessage] Firestore unavailable');
      return;
    }
    try {
      await updateSubcollectionDoc(COLLECTIONS.CHATS, _chatId, COLLECTIONS.MESSAGES, messageId, {
        content,
        edited: true,
      });
    } catch {
      return;
    }
  },

  deleteMessage: async (_chatId, messageId) => {
    if (!isFirestoreAvailable()) {
      console.warn('[ChatStore.deleteMessage] Firestore unavailable');
      return;
    }
    try {
      await deleteSubcollectionDoc(COLLECTIONS.CHATS, _chatId, COLLECTIONS.MESSAGES, messageId);
    } catch {
      return;
    }
  },

  deleteForEveryone: async (_chatId, messageId) => {
    if (!isFirestoreAvailable()) {
      console.warn('[ChatStore.deleteForEveryone] Firestore unavailable');
      return;
    }
    try {
      await updateSubcollectionDoc(COLLECTIONS.CHATS, _chatId, COLLECTIONS.MESSAGES, messageId, {
        type: 'deleted',
        content: 'This message was deleted',
      });
    } catch {
      return;
    }
  },

  addReaction: async (_chatId, messageId, emoji, userId) => {
    if (!isFirestoreAvailable()) {
      console.warn('[ChatStore.addReaction] Firestore unavailable');
      return;
    }
    try {
      if (!userId) return;
      // Use targeted query with limit for efficiency
      const msgs = await querySubcollection(COLLECTIONS.CHATS, _chatId, COLLECTIONS.MESSAGES, [limit(50)]);
      const found = msgs.find((m) => m.id === messageId);
      if (!found) return;
      const reactions = (found.reactions as Record<string, string[]>) || {};
      const users = reactions[emoji] || [];
      if (!users.includes(userId)) {
        reactions[emoji] = [...users, userId];
        await updateSubcollectionDoc(COLLECTIONS.CHATS, _chatId, COLLECTIONS.MESSAGES, messageId, { reactions });
      }
    } catch {
      return;
    }
  },

  markAsRead: async (chatId, currentUserId?: string) => {
    if (!isFirestoreAvailable()) {
      console.warn('[ChatStore.markAsRead] Firestore unavailable');
      return;
    }
    try {
      await updateDocById(COLLECTIONS.CHATS, chatId, { unreadCount: 0, lastMessageRead: true });
      // Mark all messages sent by others as read using a targeted query
      if (currentUserId) {
        const msgs = await querySubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, [
          where('senderId', '!=', currentUserId),
          where('read', '==', false),
          limit(50),
        ]);
        for (const msg of msgs) {
          await updateSubcollectionDoc(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, msg.id, { read: true });
        }
      }
    } catch {
      return;
    }
  },

  createDirectChat: async (userId, currentUserId) => {
    if (!isFirestoreAvailable()) {
      console.warn('[ChatStore.createDirectChat] Firestore unavailable');
      return null;
    }
    try {
      if (!currentUserId) return null;
      if (currentUserId === userId) return null;

      // Check if either user blocks the other (check blockedUsers collection)
      const blocked1 = await queryCollection(COLLECTIONS.BLOCKED_USERS, []);
      const isBlocked = blocked1.some((b: any) =>
        (b.blockerId === currentUserId && b.blockedId === userId) ||
        (b.blockerId === userId && b.blockedId === currentUserId)
      );
      if (isBlocked) {
        toast.error('Cannot chat with this user');
        return null;
      }

      const participants = [currentUserId, userId].sort();
      const chatId = `dm_${participants.join('_')}`;
      const existing = await getDocById(COLLECTIONS.CHATS, chatId);
      if (existing) return mapChat(existing);

      await setDocById(COLLECTIONS.CHATS, chatId, {
        type: 'direct',
        participants,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        unreadCount: 0,
      });
      return { id: chatId, type: 'direct', participants } as Chat;
    } catch {
      return null;
    }
  },

  loadOlderMessages: async (chatId) => {
    if (!isFirestoreAvailable()) {
      console.warn('[ChatStore.loadOlderMessages] Firestore unavailable');
      return;
    }
    try {
      const current = get().messages[chatId] || [];
      if (current.length === 0) return;
      const oldest = current[0];
      const data = await querySubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, [
        orderBy('timestamp', 'desc'),
        startAfter(oldest.timestamp),
        limit(50),
      ]);

      const older = (data || []).reverse().map((d) => mapMessage(d));
      set((s) => ({
        messages: { ...s.messages, [chatId]: [...older, ...current] },
        hasMore: { ...s.hasMore, [chatId]: (data || []).length >= 50 },
      }));
    } catch {
      return;
    }
  },

  muteChat: async (chatId) => {
    try {
      await updateDocById(COLLECTIONS.CHATS, chatId, { isMuted: true });
    } catch {
      return;
    }
  },

  updateChat: async (chatId, data) => {
    try {
      const payload: Record<string, unknown> = {};
      if (data.name !== undefined) payload.name = data.name;
      if (data.avatar !== undefined) payload.avatar = data.avatar;
      if (data.description !== undefined) payload.description = data.description;
      if (data.isMuted !== undefined) payload.isMuted = data.isMuted;
      if ((data as Record<string, unknown>).archived !== undefined) payload.archived = (data as Record<string, unknown>).archived;
      await updateDocById(COLLECTIONS.CHATS, chatId, payload);
    } catch {
      return;
    }
  },

  removeParticipant: async (chatId, userId) => {
    if (!isFirestoreAvailable()) {
      console.warn('[ChatStore.removeParticipant] Firestore unavailable');
      return;
    }
    try {
      const chat = await getDocById(COLLECTIONS.CHATS, chatId);
      if (!chat) return;
      const participants = ((chat.participants as string[]) || []).filter((p) => p !== userId);
      await updateDocById(COLLECTIONS.CHATS, chatId, { participants });
    } catch {
      return;
    }
  },

  promoteAdmin: async (chatId, userId) => {
    if (!isFirestoreAvailable()) {
      console.warn('[ChatStore.promoteAdmin] Firestore unavailable');
      return;
    }
    try {
      const chat = await getDocById(COLLECTIONS.CHATS, chatId);
      const admins = [...new Set([...((chat?.admins as string[]) || []), userId])];
      await updateDocById(COLLECTIONS.CHATS, chatId, { admins });
    } catch {
      return;
    }
  },

  demoteAdmin: async (chatId, userId) => {
    if (!isFirestoreAvailable()) {
      console.warn('[ChatStore.demoteAdmin] Firestore unavailable');
      return;
    }
    try {
      const chat = await getDocById(COLLECTIONS.CHATS, chatId);
      if (!chat) return;
      const admins = ((chat.admins as string[]) || []).filter((a) => a !== userId);
      await updateDocById(COLLECTIONS.CHATS, chatId, { admins });
    } catch {
      return;
    }
  },

  clearChat: async (chatId) => {
    if (!isFirestoreAvailable()) {
      console.warn('[ChatStore.clearChat] Firestore unavailable');
      return;
    }
    try {
      const msgs = await querySubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, []);
      for (const msg of msgs) {
        await deleteSubcollectionDoc(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, msg.id);
      }
    } catch {
      return;
    }
  },

  leaveGroup: async (chatId, userId) => {
    if (!isFirestoreAvailable()) {
      console.warn('[ChatStore.leaveGroup] Firestore unavailable');
      return;
    }
    try {
      const chat = await getDocById(COLLECTIONS.CHATS, chatId);
      if (!chat) return;
      const participants = (chat.participants || []).filter((p: string) => p !== userId);
      const admins = (chat.admins || []).filter((a: string) => a !== userId);

      if (participants.length === 0) {
        await deleteDocById(COLLECTIONS.CHATS, chatId);
        // Also delete all messages
        const msgs = await querySubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, []);
        for (const msg of msgs) {
          await deleteSubcollectionDoc(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, msg.id);
        }
      } else {
        await updateDocById(COLLECTIONS.CHATS, chatId, { participants, admins, updatedAt: serverTimestamp() });
        await addDocToSubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, {
          chatId,
          senderId: 'system',
          content: 'A member left the group',
          type: 'system',
          timestamp: serverTimestamp(),
        });
      }
    } catch {
      return;
    }
  },

  addParticipant: async (chatId, userId) => {
    if (!isFirestoreAvailable()) {
      console.warn('[ChatStore.addParticipant] Firestore unavailable');
      return;
    }
    try {
      const chat = await getDocById(COLLECTIONS.CHATS, chatId);
      const participants = [...new Set([...((chat?.participants as string[]) || []), userId])];
      await updateDocById(COLLECTIONS.CHATS, chatId, { participants });
    } catch {
      return;
    }
  },

  sendPoll: async (chatId, senderId, question, options) => {
    if (!isFirestoreAvailable()) {
      console.warn('[ChatStore.sendPoll] Firestore unavailable');
      return;
    }
    try {
      await addDocToSubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, {
        chatId,
        senderId,
        content: question,
        type: 'poll',
        pollData: { question, options, votes: {}, totalVotes: 0 },
        timestamp: serverTimestamp(),
      });
    } catch {
      return;
    }
  },

  votePoll: async (chatId, messageId, optionIndex, userId) => {
    if (!isFirestoreAvailable()) {
      console.warn('[ChatStore.votePoll] Firestore unavailable');
      return;
    }
    try {
      if (!chatId || !messageId || !userId) return;
      const msg = await getDocById(COLLECTIONS.MESSAGES, messageId);
      if (!msg || !msg.pollData) return;
      const pollData = msg.pollData as { question: string; options: string[]; votes: Record<string, string[]>; totalVotes: number };
      Object.keys(pollData.votes).forEach((key) => {
        pollData.votes[key] = (pollData.votes[key] || []).filter((id) => id !== userId);
      });
      const key = String(optionIndex);
      pollData.votes[key] = [...(pollData.votes[key] || []), userId];
      pollData.totalVotes = Object.values(pollData.votes).reduce((sum, arr) => sum + (arr as string[]).length, 0);
      await updateSubcollectionDoc(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, messageId, { pollData });
    } catch {
      return;
    }
  },

  pinMessage: async (chatId, messageId, content) => {
    if (!isFirestoreAvailable()) {
      console.warn('[ChatStore.pinMessage] Firestore unavailable');
      return;
    }
    try {
      const chat = await getDocById(COLLECTIONS.CHATS, chatId);
      const pinned = [...((chat?.pinnedMessages as unknown[]) || []), { messageId, content, pinnedBy: 'user', pinnedAt: new Date().toISOString() }];
      await updateDocById(COLLECTIONS.CHATS, chatId, { pinnedMessages: pinned });
    } catch {
      return;
    }
  },

  unpinMessage: async (chatId, messageId) => {
    if (!isFirestoreAvailable()) {
      console.warn('[ChatStore.unpinMessage] Firestore unavailable');
      return;
    }
    try {
      const chat = await getDocById(COLLECTIONS.CHATS, chatId);
      if (!chat) return;
      const pinned = ((chat.pinnedMessages as Array<{ messageId: string }>) || []).filter((p) => p.messageId !== messageId);
      await updateDocById(COLLECTIONS.CHATS, chatId, { pinnedMessages: pinned });
    } catch {
      return;
    }
  },

  archiveChat: async (chatId) => {
    if (!isFirestoreAvailable()) {
      console.warn('[ChatStore.archiveChat] Firestore unavailable');
      return;
    }
    try {
      await updateDocById(COLLECTIONS.CHATS, chatId, { archived: true });
    } catch {
      return;
    }
  },

  unarchiveChat: async (chatId) => {
    if (!isFirestoreAvailable()) {
      console.warn('[ChatStore.unarchiveChat] Firestore unavailable');
      return;
    }
    try {
      await updateDocById(COLLECTIONS.CHATS, chatId, { archived: false });
    } catch {
      return;
    }
  },

  setDisappearingMessages: async (chatId, seconds) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTIONS.CHATS, chatId, { disappearingMessages: seconds });
      toast.success(seconds > 0 ? `Messages will disappear after ${seconds >= 86400 ? `${seconds / 86400}d` : seconds >= 3600 ? `${seconds / 3600}h` : `${seconds / 60}m`}` : 'Disappearing messages turned off');
    } catch {
      toast.error('Failed to update settings');
    }
  },

  lockChat: async (chatId, lockType, lockValue) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTIONS.CHATS, chatId, { chatLocked: true, lockType, lockValue });
      toast.success('Chat locked');
    } catch {
      toast.error('Failed to lock chat');
    }
  },

  unlockChat: async (chatId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTIONS.CHATS, chatId, { chatLocked: false, lockType: null, lockValue: null });
      toast.success('Chat unlocked');
    } catch {
      toast.error('Failed to unlock chat');
    }
  },

  sendContactCard: async (chatId, senderId, contactData) => {
    if (!isFirestoreAvailable()) return;
    try {
      await addDocToSubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, {
        chatId,
        senderId,
        content: `Shared contact: ${contactData.name}`,
        type: 'contact_card',
        contactCard: contactData,
        timestamp: serverTimestamp(),
      });
      await updateDocById(COLLECTIONS.CHATS, chatId, {
        lastMessage: `Shared contact: ${contactData.name}`,
        lastMessageSenderId: senderId,
        lastMessageRead: false,
        updatedAt: serverTimestamp(),
      });
    } catch {
      toast.error('Failed to share contact');
    }
  },

  exportChat: async (chatId) => {
    if (!isFirestoreAvailable()) return null;
    try {
      const msgs = await querySubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, [
        orderBy('timestamp', 'asc'),
      ]);
      const chat = await getDocById(COLLECTIONS.CHATS, chatId);
      const exportData = {
        chatId,
        exportedAt: new Date().toISOString(),
        chatName: chat?.name || 'Chat',
        participants: chat?.participants || [],
        messages: (msgs || []).map((m: any) => ({
          id: m.id,
          senderId: m.senderId,
          content: m.content,
          type: m.type,
          timestamp: m.timestamp?.toDate?.() ? m.timestamp.toDate().toISOString() : new Date(m.timestamp).toISOString(),
        })),
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gaga-chat-export-${chatId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Chat exported successfully');
      return exportData;
    } catch {
      toast.error('Failed to export chat');
      return null;
    }
  },

  getSharedMedia: async (chatId, mediaType) => {
    if (!isFirestoreAvailable()) return [];
    try {
      const types = mediaType ? [mediaType] : ['image', 'video', 'voice', 'file'];
      const results = await Promise.all(
        types.map((type) =>
          querySubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, [
            where('type', '==', type),
            orderBy('timestamp', 'desc'),
            limit(50),
          ])
        )
      );
      return results.flat().map((m: any) => mapMessage(m));
    } catch {
      return [];
    }
  },
}));
