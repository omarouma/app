
import { create } from 'zustand';
import {
  isFirestoreAvailable,
  COLLECTIONS,
  getDocById,
  updateDocById,
  deleteDocById,
  addDocToCollection,
  addDocToSubcollection,
  querySubcollection,
  updateSubcollectionDoc,
  deleteSubcollectionDoc,
  subscribeToCollection,
  subscribeToSubcollection,
  serverTimestamp,
  increment,
} from '@/lib/firestore';
import type { Chat, Message, GroupData } from '@/types';
import { where, orderBy, limit } from '@/lib/firestore';

type FirestoreTimestamp = { toDate: () => Date };
function isFirestoreTs(v: unknown): v is FirestoreTimestamp {
  return typeof v === 'object' && v !== null && 'toDate' in v;
}
function toDate(raw: unknown): Date {
  if (isFirestoreTs(raw)) return raw.toDate();
  if (raw) return new Date(raw as string | number | Date);
  return new Date();
}

interface GroupStore {
  groups: Chat[];
  currentGroup: GroupData | null;
  groupMessages: Record<string, Message[]>;
  loading: boolean;
  subscribeGroups: (userId: string) => () => void;
  createGroup: (name: string, description: string, participantIds: string[], createdBy: string) => Promise<string | null>;
  addParticipant: (groupId: string, userId: string) => Promise<void>;
  removeParticipant: (groupId: string, userId: string) => Promise<void>;
  promoteAdmin: (groupId: string, userId: string) => Promise<void>;
  leaveGroup: (groupId: string, userId: string) => Promise<void>;
  updateGroup: (groupId: string, data: Partial<GroupData>) => Promise<void>;
  sendGroupMessage: (groupId: string, senderId: string, content: string, type?: string, mediaUrl?: string, replyTo?: string) => Promise<void>;
  subscribeGroupMessages: (groupId: string) => () => void;
  deleteGroupMessage: (groupId: string, messageId: string) => Promise<void>;
  deleteGroupMessageForEveryone: (groupId: string, messageId: string) => Promise<void>;
  editGroupMessage: (groupId: string, messageId: string, content: string) => Promise<void>;
  addGroupReaction: (groupId: string, messageId: string, emoji: string, userId: string) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
}

export const useGroupStore = create<GroupStore>((set) => ({
  groups: [],
  currentGroup: null,
  groupMessages: {},
  loading: true,

  subscribeGroups: (userId: string) => {
    if (!userId) { set({ groups: [], loading: false }); return () => {}; }
    if (!isFirestoreAvailable()) { set({ groups: [], loading: false }); return () => {}; }
    set({ loading: true });

    // Single real-time subscription — no redundant initial fetch
    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeToCollection(
        COLLECTIONS.CHATS,
        [
          where('type', '==', 'group'),
          where('participants', 'array-contains', userId),
          orderBy('updatedAt', 'desc'),
          limit(50),
        ],
        (data) => {
          const groups: Chat[] = (data || []).map((d: Record<string, unknown>) => ({
            id: d.id as string,
            type: 'group',
            participants: (d.participants as string[]) || [],
            name: (d.name as string) || 'Group',
            avatar: (d.avatar as string) || '',
            lastMessage: (d.lastMessage as string | Message) || '',
            updatedAt: toDate(d.updatedAt),
            unreadCount: (d.unreadCount as number) || 0,
            isMuted: (d.isMuted as boolean) || false,
            admins: (d.admins as string[]) || [],
            createdBy: (d.createdBy as string) || '',
            description: (d.description as string) || '',
          }));
          set({ groups, loading: false });
        },
      );
    } catch {
      set({ loading: false });
    }

    return () => { if (unsub) unsub(); };
  },

  createGroup: async (name, description, participantIds, createdBy) => {
    if (!isFirestoreAvailable()) { return null; }
    try {
      const groupId = await addDocToCollection(COLLECTIONS.CHATS, {
        type: 'group',
        name,
        description,
        participants: [...new Set([...participantIds, createdBy])],
        admins: [createdBy],
        createdBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        unreadCount: 0,
      });

      await addDocToSubcollection(COLLECTIONS.CHATS, groupId, COLLECTIONS.MESSAGES, {
        chatId: groupId,
        senderId: 'system',
        content: `Group "${name}" created`,
        type: 'system',
        timestamp: serverTimestamp(),
      });

      return groupId;
    } catch (err) {
      console.error('Create group error:', err);
      return null;
    }
  },

  addParticipant: async (groupId, userId) => {
    if (!isFirestoreAvailable()) { return; }
    try {
      const chat = await getDocById(COLLECTIONS.CHATS, groupId);
      const participants = [...new Set([...(chat?.participants || []), userId])];
      await updateDocById(COLLECTIONS.CHATS, groupId, { participants, updatedAt: serverTimestamp() });
    } catch {
      return;
    }
  },

  removeParticipant: async (groupId, userId) => {
    if (!isFirestoreAvailable()) { return; }
    try {
      const chat = await getDocById(COLLECTIONS.CHATS, groupId);
      if (!chat) return;
      const participants = (chat.participants || []).filter((p: string) => p !== userId);
      const admins = (chat.admins || []).filter((a: string) => a !== userId);
      await updateDocById(COLLECTIONS.CHATS, groupId, { participants, admins, updatedAt: serverTimestamp() });
    } catch {
      return;
    }
  },

  promoteAdmin: async (groupId, userId) => {
    if (!isFirestoreAvailable()) { return; }
    try {
      const chat = await getDocById(COLLECTIONS.CHATS, groupId);
      const admins = [...new Set([...(chat?.admins || []), userId])];
      await updateDocById(COLLECTIONS.CHATS, groupId, { admins, updatedAt: serverTimestamp() });
    } catch {
      return;
    }
  },

  leaveGroup: async (groupId, userId) => {
    if (!isFirestoreAvailable()) { return; }
    try {
      const chat = await getDocById(COLLECTIONS.CHATS, groupId);
      if (!chat) return;
      const participants = (chat.participants || []).filter((p: string) => p !== userId);
      const admins = (chat.admins || []).filter((a: string) => a !== userId);

      if (participants.length === 0) {
        const msgs = await querySubcollection(COLLECTIONS.CHATS, groupId, COLLECTIONS.MESSAGES, []);
        await Promise.all([
          deleteDocById(COLLECTIONS.CHATS, groupId),
          ...msgs.map((msg) => deleteSubcollectionDoc(COLLECTIONS.CHATS, groupId, COLLECTIONS.MESSAGES, msg.id)),
        ]);
      } else {
        await Promise.all([
          updateDocById(COLLECTIONS.CHATS, groupId, { participants, admins, updatedAt: serverTimestamp() }),
          addDocToSubcollection(COLLECTIONS.CHATS, groupId, COLLECTIONS.MESSAGES, {
            chatId: groupId,
            senderId: 'system',
            content: 'A member left the group',
            type: 'system',
            timestamp: serverTimestamp(),
          }),
        ]);
      }
    } catch {
      return;
    }
  },

  updateGroup: async (groupId, data) => {
    if (!isFirestoreAvailable()) { return; }
    try {
      const payload: Record<string, unknown> = {};
      if (data.name !== undefined) payload.name = data.name;
      if (data.description !== undefined) payload.description = data.description;
      if (data.avatar !== undefined) payload.avatar = data.avatar;
      payload.updatedAt = serverTimestamp();
      await updateDocById(COLLECTIONS.CHATS, groupId, payload);
    } catch {
      return;
    }
  },

  sendGroupMessage: async (groupId, senderId, content, type = 'text', mediaUrl, replyTo) => {
    if (!isFirestoreAvailable()) { return; }
    try {
      const msgData: Record<string, unknown> = {
        chatId: groupId,
        senderId,
        content,
        type,
        timestamp: serverTimestamp(),
        read: false,
      };
      if (mediaUrl) msgData.mediaUrl = mediaUrl;
      if (replyTo) msgData.replyTo = replyTo;

      await addDocToSubcollection(COLLECTIONS.CHATS, groupId, COLLECTIONS.MESSAGES, msgData);
      const safeContent = typeof content === 'string' ? content.slice(0, 4000) : '';
      await updateDocById(COLLECTIONS.CHATS, groupId, {
        lastMessage: safeContent,
        updatedAt: serverTimestamp(),
        unreadCount: increment(1),
      });
    } catch {
      return;
    }
  },

  deleteGroupMessage: async (_groupId, messageId) => {
    if (!isFirestoreAvailable()) { return; }
    try {
      await deleteSubcollectionDoc(COLLECTIONS.CHATS, _groupId, COLLECTIONS.MESSAGES, messageId);
    } catch {
      return;
    }
  },

  deleteGroupMessageForEveryone: async (_groupId, messageId) => {
    if (!isFirestoreAvailable()) { return; }
    try {
      await updateSubcollectionDoc(COLLECTIONS.CHATS, _groupId, COLLECTIONS.MESSAGES, messageId, {
        type: 'deleted',
        content: 'This message was deleted',
      });
    } catch {
      return;
    }
  },

  editGroupMessage: async (_groupId, messageId, content) => {
    if (!isFirestoreAvailable()) { return; }
    try {
      await updateSubcollectionDoc(COLLECTIONS.CHATS, _groupId, COLLECTIONS.MESSAGES, messageId, { content, edited: true });
    } catch {
      return;
    }
  },

  addGroupReaction: async (_groupId, messageId, emoji, userId) => {
    if (!isFirestoreAvailable()) { return; }
    try {
      if (!userId) return;
      const found = await getDocById(`${COLLECTIONS.CHATS}/${_groupId}/${COLLECTIONS.MESSAGES}`, messageId);
      if (!found) return;
      const reactions = (found.reactions as Record<string, string[]>) || {};
      const users = reactions[emoji] || [];
      if (!users.includes(userId)) {
        reactions[emoji] = [...users, userId];
        await updateSubcollectionDoc(COLLECTIONS.CHATS, _groupId, COLLECTIONS.MESSAGES, messageId, { reactions });
      }
    } catch {
      return;
    }
  },

  subscribeGroupMessages: (groupId: string) => {
    if (!groupId || !isFirestoreAvailable()) return () => {};

    const mapMsg = (d: Record<string, unknown>): Message => ({
      id: d.id as string,
      chatId: groupId,
      senderId: (d.senderId as string) || '',
      content: (d.content as string) || '',
      type: (d.type as Message['type']) || 'text',
      mediaUrl: (d.mediaUrl as string) || '',
      timestamp: toDate(d.createdAt ?? d.timestamp),
      read: (d.read as boolean) || false,
      edited: (d.edited as boolean) || false,
      reactions: (d.reactions as Record<string, string[]>) || {},
      replyTo: (d.replyTo as string) || undefined,
      forwardedFrom: (d.forwardedFrom as string) || undefined,
      pollData: d.pollData as Message['pollData'],
      transferData: d.transferData as Message['transferData'],
    });

    // Single real-time subscription — no redundant initial fetch.
    // Fetch newest-first (bounded) then reverse for chronological UI, with id dedupe.
    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeToSubcollection(
        COLLECTIONS.CHATS,
        groupId,
        COLLECTIONS.MESSAGES,
        [orderBy('createdAt', 'desc'), limit(100)],
        (data) => {
          const raw = data || [];
          const msgs: Message[] = [];
          const seen = new Set<string>();
          // Server messages come back newest-first → reverse for display
          for (let i = raw.length - 1; i >= 0; i--) {
            const m = mapMsg(raw[i]);
            if (seen.has(m.id)) continue;
            seen.add(m.id);
            msgs.push(m);
          }
          set((s) => ({ groupMessages: { ...s.groupMessages, [groupId]: msgs } }));
        },
      );
    } catch {
      // ignore
    }

    return () => { if (unsub) unsub(); };
  },

  deleteGroup: async (groupId) => {
    if (!isFirestoreAvailable()) { return; }
    try {
      const msgs = await querySubcollection(COLLECTIONS.CHATS, groupId, COLLECTIONS.MESSAGES, []);
      await Promise.all([
        deleteDocById(COLLECTIONS.CHATS, groupId),
        ...msgs.map((msg) => deleteSubcollectionDoc(COLLECTIONS.CHATS, groupId, COLLECTIONS.MESSAGES, msg.id)),
      ]);
    } catch {
      return;
    }
  },
}));