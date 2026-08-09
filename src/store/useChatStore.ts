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
import { checkMessageRateLimit } from '@/hooks/useMessageRateLimiter';
import { enqueueOfflineMessage, isOnline } from '@/lib/offlineQueue';

type FirestoreTimestamp = { toDate: () => Date };
function isFirestoreTs(v: unknown): v is FirestoreTimestamp {
  return typeof v === 'object' && v !== null && 'toDate' in v;
}
function toDate(raw: unknown): Date {
  if (isFirestoreTs(raw)) return raw.toDate();
  if (raw) return new Date(raw as string | number | Date);
  return new Date();
}
import { where, orderBy, limit, startAfter } from '@/lib/firestore';

interface ContactCard {
  userId: string;
  name: string;
  username?: string;
  phone?: string;
  email?: string;
  avatar?: string;
  bio?: string;
}

const mapMessage = (d: Record<string, unknown>): Message => {
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
    timestamp: d.createdAt ? toDate(d.createdAt) : d.timestamp ? toDate(d.timestamp) : new Date(),
    read: (d.read as boolean) || false,
    edited: (d.edited as boolean) || false,
    replyTo: (d.replyTo as string) || undefined,
    reactions: (d.reactions as Record<string, string[]>) || {},
    forwardedFrom: (d.forwardedFrom as string) || undefined,
    pollData: d.pollData as PollData | undefined,
    transferData: d.transferData as TransferData | undefined,
    contactCard,
    disappearingTimer: (d.disappearingTimer as number) || 0,
    disappearingInitiatedAt: d.disappearingInitiatedAt ? toDate(d.disappearingInitiatedAt) : undefined,
    destroyed: (d.destroyed as boolean) || false,
    deliveryStatus: (d.deliveryStatus as Message['deliveryStatus']) || (d.read ? 'read' : d.senderId ? 'sent' : undefined),
    deliveredAt: d.deliveredAt ? toDate(d.deliveredAt) : undefined,
    readAt: d.readAt ? toDate(d.readAt) : undefined,
    retryCount: (d.retryCount as number) || undefined,
    localId: (d.localId as string) || undefined,
  };
};

const mapChat = (d: Record<string, unknown>): Chat => ({
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

// In-memory debounce: track last notification time per (recipientId, chatId) pair
// to avoid a Firestore read on every message send.
const lastNotifSentAt: Record<string, number> = {};
const NOTIF_DEBOUNCE_MS = 30_000;

export const useChatStore = create<ChatStore>((set, get) => ({
  chats: [],
  archivedChats: [],
  messages: {},
  loadingChats: false,
  hasMore: {},
  totalUnread: 0,

  fetchChats: async (_userId?: string) => {
    // no-op: real-time data loaded via subscribeChats
  },

  addMessage: (message: Message) => {
    const { chatId } = message;
    set((s) => ({
      messages: { ...s.messages, [chatId]: [...(s.messages[chatId] ?? []), message] },
    }));
  },

  subscribeChats: (userId: string) => {
    if (!isFirestoreAvailable()) {
      set({ loadingChats: false, chats: [], archivedChats: [] });
      return () => { };
    }
    set({ loadingChats: true });
    if (!userId) {
      set({ chats: [], archivedChats: [], loadingChats: false });
      return () => { };
    }

    // Real-time subscription
    let unsub: (() => void) | null = null;
    const subscribe = () => {
      try {
        unsub = subscribeToCollection(COLLECTIONS.CHATS, [where('participants', 'array-contains', userId), orderBy('updatedAt', 'desc')], (data) => {
          const allChats: Chat[] = [];
          const archived: Chat[] = [];
          (data || []).forEach((d) => {
            const chat = mapChat(d);
            if (d.archived) archived.push(chat);
            else allChats.push(chat);
          });
          const totalUnread = allChats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
          set({ chats: allChats, archivedChats: archived, loadingChats: false, totalUnread });
        });
      } catch (err) {
        console.error("Failed to subscribe to chats, retrying in 5s:", err);
        setTimeout(subscribe, 5000);
      }
    };

    subscribe();

    return () => { if (unsub) unsub(); };
  },

  subscribeMessages: (chatId: string, initialLimit = 100) => {
    if (!chatId) return () => { };

    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeToSubcollection(
        COLLECTIONS.CHATS,
        chatId,
        COLLECTIONS.MESSAGES,
        [orderBy('createdAt', 'desc'), limit(initialLimit)],
        (data) => {
          const raw = data || [];
          set((s) => {
            const existing = s.messages[chatId] || [];
            const merged: Message[] = [];
            const seenIds = new Set<string>();
            const seenLocalIds = new Set<string>();

            for (let i = raw.length - 1; i >= 0; i--) {
              const m = mapMessage(raw[i]);
              if (seenIds.has(m.id)) continue;
              seenIds.add(m.id);
              if (m.localId) seenLocalIds.add(m.localId);
              merged.push(m);
            }

            for (const m of existing) {
              if (seenIds.has(m.id)) continue;
              if (m.localId && seenLocalIds.has(m.localId)) continue;
              merged.push(m);
              if (m.localId) seenLocalIds.add(m.localId);
            }

            return {
              messages: { ...s.messages, [chatId]: merged },
              hasMore: { ...s.hasMore, [chatId]: raw.length >= initialLimit },
            };
          });
        },
      );
    } catch {
      // ignore
    }

    return () => { if (unsub) unsub(); };
  },

  sendMessage: async (chatId, senderId, content, type = 'text', mediaUrl, replyTo) => {
    if (!isFirestoreAvailable()) return;
    const rateLimitError = checkMessageRateLimit();
    if (rateLimitError) {
      toast.error(rateLimitError);
      const localId = `pending_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const failedMsg: Message = {
        id: localId,
        chatId,
        senderId,
        content,
        type: (type as Message['type']) || 'text',
        mediaUrl: mediaUrl || '',
        timestamp: new Date(),
        read: false,
        edited: false,
        reactions: {},
        deliveryStatus: 'failed',
        localId,
      };
      set((s) => ({ messages: { ...s.messages, [chatId]: [...(s.messages[chatId] ?? []), failedMsg] } }));
      enqueueOfflineMessage({
        type: 'direct', chatId, senderId, content,
        messageType: type, mediaUrl,
        replyTo: typeof replyTo === 'string' ? replyTo : replyTo?.id,
      });
      return;
    }

    const localId = `pending_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const optimisticMsg: Message = {
      id: localId, chatId, senderId, content,
      type: (type as Message['type']) || 'text',
      mediaUrl: mediaUrl || '',
      timestamp: new Date(),
      read: false, edited: false, reactions: {},
      deliveryStatus: isOnline() ? 'sending' : 'pending',
      retryCount: 0,
      localId,
    };
    set((s) => ({ messages: { ...s.messages, [chatId]: [...(s.messages[chatId] ?? []), optimisticMsg] } }));

    // Short-circuit: if browser says offline, push to queue and keep
    // pending/sending status so user sees the queued state.
    if (!isOnline()) {
      enqueueOfflineMessage({
        type: 'direct', chatId, senderId, content,
        messageType: type, mediaUrl,
        replyTo: typeof replyTo === 'string' ? replyTo : replyTo?.id,
      });
      return;
    }

    let sent = false;
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
      try {
        const msgData: Record<string, unknown> = {
          chatId, senderId, content, type,
          createdAt: serverTimestamp(),
          read: false,
        };
        if (mediaUrl) msgData.mediaUrl = mediaUrl;
        if (replyTo) msgData.replyTo = typeof replyTo === 'string' ? replyTo : replyTo.id;

        await addDocToSubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, msgData);
        sent = true;

        set((s) => ({
          messages: { ...s.messages, [chatId]: (s.messages[chatId] ?? []).filter((m) => m.localId !== localId) },
        }));

        const cachedChat = get().chats.find((c) => c.id === chatId);
        const participants = cachedChat?.participants ?? [];
        const otherParticipants = participants.filter((id: string) => id !== senderId);
        await updateDocById(COLLECTIONS.CHATS, chatId, {
          lastMessage: content,
          lastMessageSenderId: senderId,
          updatedAt: serverTimestamp(),
          ...(otherParticipants.length > 0 ? { unreadCount: increment(1) } : {}),
        });

        if (otherParticipants.length > 0) {
          try {
            const sender = await getDocById(COLLECTIONS.USERS, senderId);
            const senderName = (sender?.name as string) || 'Someone';
            const chatName = cachedChat?.name || '';
            const notifTitle = chatName ? `${senderName} in ${chatName}` : senderName;
            const notifBody = type === 'text' ? content : `Sent a ${type}`;
            for (const recipientId of otherParticipants) {
              const debounceKey = `${recipientId}:${chatId}`;
              const lastSent = lastNotifSentAt[debounceKey] ?? 0;
              if (Date.now() - lastSent < NOTIF_DEBOUNCE_MS) continue;
              lastNotifSentAt[debounceKey] = Date.now();
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
          } catch { /* non-fatal */ }
        }
break;
      } catch {
        const isLast = attempt === maxAttempts - 1;
        set((s) => ({
          messages: {
            ...s.messages,
            [chatId]: (s.messages[chatId] ?? []).map((m) =>
              m.localId === localId
                ? { ...m, retryCount: attempt + 1, deliveryStatus: isLast ? 'failed' : 'sending' }
                : m
            ),
          },
        }));
        if (isLast) {
          // Route to offline queue so we auto-retry when network comes back.
          enqueueOfflineMessage({
            type: 'direct', chatId, senderId, content,
            messageType: type, mediaUrl,
            replyTo: typeof replyTo === 'string' ? replyTo : replyTo?.id,
          });
          toast.error('Message queued. Will send automatically when online.', {
            action: { label: 'OK', onClick: () => { } },
          });
        }
      }
    }
    if (!sent) return;
  },

  editMessage: async (_chatId, messageId, content) => {
    if (!isFirestoreAvailable()) return;
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
    if (!isFirestoreAvailable()) return;
    try {
      await deleteSubcollectionDoc(COLLECTIONS.CHATS, _chatId, COLLECTIONS.MESSAGES, messageId);
    } catch {
      return;
    }
  },

  deleteForEveryone: async (_chatId, messageId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateSubcollectionDoc(COLLECTIONS.CHATS, _chatId, COLLECTIONS.MESSAGES, messageId, {
        type: 'deleted',
        content: 'This message was deleted',
      });
    } catch {
      return;
    }
  },

  recallMessage: async (chatId, messageId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateSubcollectionDoc(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, messageId, {
        type: 'recalled',
        content: 'This message has been recalled',
        edited: true,
      });
    } catch (error) {
      console.error("Failed to recall message:", error);
      toast.error("Failed to recall message. Please try again.");
    }
  },

  addReaction: async (_chatId, messageId, emoji, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      if (!userId) return;
      // Optimistic update from in-memory state first
      const existing = get().messages[_chatId]?.find((m) => m.id === messageId);
      const reactions: Record<string, string[]> = existing
        ? JSON.parse(JSON.stringify(existing.reactions || {}))
        : {};
      const users = reactions[emoji] || [];
      reactions[emoji] = users.includes(userId)
        ? users.filter((id) => id !== userId)
        : [...users, userId];
      // Optimistic UI update
      set((s) => ({
        messages: {
          ...s.messages,
          [_chatId]: (s.messages[_chatId] ?? []).map((m) =>
            m.id === messageId ? { ...m, reactions } : m
          ),
        },
      }));
      await updateSubcollectionDoc(COLLECTIONS.CHATS, _chatId, COLLECTIONS.MESSAGES, messageId, { reactions });
    } catch {
      return;
    }
  },

  markAsRead: async (chatId, currentUserId?: string) => {
    if (!isFirestoreAvailable()) return;
    try {
      // Reset chat-level unread counter
      await updateDocById(COLLECTIONS.CHATS, chatId, { unreadCount: 0, lastMessageRead: true });
      if (currentUserId) {
        // Optimistic update in memory
        set((s) => ({
          messages: {
            ...s.messages,
            [chatId]: (s.messages[chatId] ?? []).map((m) =>
              m.senderId !== currentUserId && !m.read ? { ...m, read: true } : m
            ),
          },
        }));
        // Bulk update via Supabase directly — avoids N individual RPC calls
        const { getSupabaseSafe } = await import('@/lib/supabase');
        const supabase = getSupabaseSafe();
        if (supabase) {
          await supabase
            .from('messages')
            .update({ read: true })
            .eq('chat_id', chatId)
            .eq('read', false)
            .neq('sender_id', currentUserId);
        }
      }
    } catch {
      return;
    }
  },

  createDirectChat: async (userId, currentUserId) => {
    if (!isFirestoreAvailable()) return null;
    try {
      if (!currentUserId) return null;
      if (currentUserId === userId) return null;

      // Check block in both directions with targeted queries (no full-collection scan)
      const [blockedByMe, blockedByThem] = await Promise.all([
        queryCollection(COLLECTIONS.BLOCKED_USERS, [where('blockerId', '==', currentUserId), where('blockedId', '==', userId), limit(1)]),
        queryCollection(COLLECTIONS.BLOCKED_USERS, [where('blockerId', '==', userId), where('blockedId', '==', currentUserId), limit(1)]),
      ]);
      if ((blockedByMe?.length ?? 0) > 0 || (blockedByThem?.length ?? 0) > 0) {
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
    if (!isFirestoreAvailable()) return;
    try {
      const current = get().messages[chatId] || [];
      if (current.length === 0) return;
      const oldest = current[0];
      const data = await querySubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, [
        orderBy('createdAt', 'desc'),
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
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTIONS.CHATS, chatId, { isMuted: true });
    } catch {
      return;
    }
  },

  updateChat: async (chatId, data) => {
    if (!isFirestoreAvailable()) return;
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
    if (!isFirestoreAvailable()) return;
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
    if (!isFirestoreAvailable()) return;
    try {
      const chat = await getDocById(COLLECTIONS.CHATS, chatId);
      const admins = [...new Set([...((chat?.admins as string[]) || []), userId])];
      await updateDocById(COLLECTIONS.CHATS, chatId, { admins });
    } catch {
      return;
    }
  },

  demoteAdmin: async (chatId, userId) => {
    if (!isFirestoreAvailable()) return;
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
    if (!isFirestoreAvailable()) return;
    try {
      const msgs = await querySubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, []);
      await Promise.all(
        msgs.map((msg) => deleteSubcollectionDoc(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, msg.id))
      );
    } catch {
      return;
    }
  },

  leaveGroup: async (chatId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      const chat = await getDocById(COLLECTIONS.CHATS, chatId);
      if (!chat) return;
      const participants = (chat.participants || []).filter((p: string) => p !== userId);
      const admins = (chat.admins || []).filter((a: string) => a !== userId);

      if (participants.length === 0) {
        await deleteDocById(COLLECTIONS.CHATS, chatId);
        // Also delete all messages
        const msgs = await querySubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, []);
        await Promise.all(
          msgs.map((msg) => deleteSubcollectionDoc(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, msg.id))
        );
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
    if (!isFirestoreAvailable()) return;
    try {
      const chat = await getDocById(COLLECTIONS.CHATS, chatId);
      const participants = [...new Set([...((chat?.participants as string[]) || []), userId])];
      await updateDocById(COLLECTIONS.CHATS, chatId, { participants });
    } catch {
      return;
    }
  },

  sendPoll: async (chatId, senderId, question, options) => {
    if (!isFirestoreAvailable()) return;
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
    if (!isFirestoreAvailable()) return;
    try {
      if (!chatId || !messageId || !userId) return;
      // Use in-memory state first, fall back to DB query
      const inMem = get().messages[chatId]?.find((m) => m.id === messageId);
      const found = inMem ? [inMem as unknown as Record<string, unknown>] : await querySubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, [
        where('id', '==', messageId),
        limit(1),
      ]);
      const msg = found?.[0];
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
    if (!isFirestoreAvailable()) return;
    try {
      const chat = await getDocById(COLLECTIONS.CHATS, chatId);
      const pinned = [...((chat?.pinnedMessages as unknown[]) || []), { messageId, content, pinnedBy: 'user', pinnedAt: new Date().toISOString() }];
      await updateDocById(COLLECTIONS.CHATS, chatId, { pinnedMessages: pinned });
    } catch {
      return;
    }
  },

  unpinMessage: async (chatId, messageId) => {
    if (!isFirestoreAvailable()) return;
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
      // Hash the PIN before storing — never store plaintext PINs
      let storedValue = lockValue;
      if (lockType === 'pin' && lockValue) {
        const encoder = new TextEncoder();
        const data = encoder.encode(lockValue);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        storedValue = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      }
      await updateDocById(COLLECTIONS.CHATS, chatId, { chatLocked: true, lockType, lockValue: storedValue });
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
        orderBy('createdAt', 'asc'),
      ]);
      const chat = await getDocById(COLLECTIONS.CHATS, chatId);
      const exportData = {
        chatId,
        exportedAt: new Date().toISOString(),
        chatName: chat?.name || 'Chat',
        participants: chat?.participants || [],
        messages: (msgs || []).map((m: Record<string, unknown>) => ({
          id: m.id,
          senderId: m.senderId,
          content: m.content,
          type: m.type,
          timestamp: toDate(m.timestamp).toISOString(),
        })),
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gaga-chat-export-${chatId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`;
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
            orderBy('createdAt', 'desc'),
            limit(50),
          ])
        )
      );
      return results.flat().map((m: Record<string, unknown>) => mapMessage(m));
    } catch {
      return [];
    }
  },
}));