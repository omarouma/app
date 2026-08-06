import { create } from 'zustand';
import { toast } from 'sonner';
import {
  isFirestoreAvailable,
  COLLECTIONS,
  addDocToSubcollection,
  querySubcollection,
  updateSubcollectionDoc,
  deleteSubcollectionDoc,
  subscribeToSubcollection,
  serverTimestamp,
} from '@/lib/firestore';
import type { Message, MessageType, PollData, TransferData } from '@/types';
import { checkMessageRateLimit } from '@/hooks/useMessageRateLimiter';

type FirestoreTimestamp = { toDate: () => Date };
function isFirestoreTs(v: unknown): v is FirestoreTimestamp {
  return typeof v === 'object' && v !== null && 'toDate' in v;
}
function toDate(raw: unknown): Date {
  if (isFirestoreTs(raw)) return raw.toDate();
  if (raw) return new Date(raw as string | number | Date);
  return new Date();
}
import { orderBy, limit, startAfter } from '@/lib/firestore';

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
    timestamp: toDate(d.createdAt ?? d.timestamp),
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

interface MessageStore {
  messages: Record<string, Message[]>;
  hasMore: Record<string, boolean>;
  subscribeMessages: (chatId: string, limit?: number) => () => void;
  sendMessage: (chatId: string, senderId: string, content: string, type?: string, mediaUrl?: string, replyTo?: Message | string) => Promise<void>;
  editMessage: (chatId: string, messageId: string, content: string) => Promise<void>;
  deleteMessage: (chatId: string, messageId: string) => Promise<void>;
  deleteForEveryone: (chatId: string, messageId: string) => Promise<void>;
  recallMessage: (chatId: string, messageId: string) => Promise<void>;
  addReaction: (chatId: string, messageId: string, emoji: string, userId: string) => Promise<void>;
  loadOlderMessages: (chatId: string) => Promise<void>;
}

export const useMessageStore = create<MessageStore>((set, get) => ({
  messages: {},
  hasMore: {},
  subscribeMessages: (chatId: string, initialLimit = 100) => {
    if (!chatId) return () => {};

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
              if (m.localId && !seenLocalIds.has(m.localId) && !seenIds.has(m.id)) {
                merged.push(m);
                seenLocalIds.add(m.localId);
              }
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
    // Check rate limit before proceeding
    const rateLimitError = checkMessageRateLimit();
    if (rateLimitError) {
      toast.error(rateLimitError);
      // Still add the message with 'failed' status so user sees it
      const localId = `pending_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      set((s) => ({
        messages: { ...s.messages, [chatId]: [...(s.messages[chatId] ?? []), {
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
          deliveryStatus: 'failed' as Message['deliveryStatus'],
          localId,
        }]},
      }));
      return;
    }
    // Optimistic pending state
    const localId = `pending_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const optimisticMsg: Message = {
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
      deliveryStatus: 'sending',
      localId,
    };
    set((s) => ({
      messages: { ...s.messages, [chatId]: [...(s.messages[chatId] ?? []), optimisticMsg] },
    }));

    // Retry with exponential backoff (max 3 attempts)
    let sent = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
      try {
        const msgData: Record<string, unknown> = {
          chatId,
          senderId,
          content,
          type,
          createdAt: new Date(),
          timestamp: serverTimestamp(),
          read: false,
        };
        if (mediaUrl) msgData.mediaUrl = mediaUrl;
        if (replyTo) msgData.replyTo = typeof replyTo === 'string' ? replyTo : replyTo.id;

        await addDocToSubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, msgData);
        sent = true;

        // Remove optimistic message — real-time subscription adds the confirmed one
        set((s) => ({
          messages: { ...s.messages, [chatId]: (s.messages[chatId] ?? []).filter((m) => m.localId !== localId) },
        }));

        break; // success — exit retry loop
      } catch {
        if (attempt === 2) {
          // All retries exhausted — mark optimistic message as failed
          set((s) => ({
            messages: {
              ...s.messages,
              [chatId]: (s.messages[chatId] ?? []).map((m) =>
                m.localId === localId ? { ...m, deliveryStatus: 'failed' as Message['deliveryStatus'] } : m
              ),
            },
          }));
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
      // Use in-memory state for optimistic update
      const existing = get().messages[_chatId]?.find((m) => m.id === messageId);
      const reactions: Record<string, string[]> = existing
        ? JSON.parse(JSON.stringify(existing.reactions || {}))
        : {};
      const users = reactions[emoji] || [];
      reactions[emoji] = users.includes(userId)
        ? users.filter((id) => id !== userId)
        : [...users, userId];
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
}));