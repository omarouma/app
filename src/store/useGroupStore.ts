/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';
import {
  isFirestoreAvailable,
  COLLECTIONS,
  getDocById,
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
} from '@/lib/firestore';
import type { Chat, Message, GroupData } from '@/types';
import { where, orderBy, limit } from '@/lib/firestore';

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
    set({ loading: true });
    if (!userId) {
      set({ groups: [], loading: false });
      return () => {};
    }
    if (!isFirestoreAvailable()) {
      set({ groups: [], loading: false });
      return () => {};
    }

    const fetchGroups = async () => {
      try {
        const data = await queryCollection(COLLECTIONS.CHATS, [
          where('type', '==', 'group'),
          where('participants', 'array-contains', userId),
          orderBy('updatedAt', 'desc'),
          limit(50),
        ]);

        const groups: Chat[] = (data || []).map((d: any) => ({
          id: d.id,
          type: 'group',
          participants: d.participants || [],
          name: d.name || 'Group',
          avatar: d.avatar || '',
          lastMessage: d.lastMessage || '',
          updatedAt: d.updatedAt || '',
          unreadCount: d.unreadCount || 0,
          isMuted: d.isMuted || false,
          admins: d.admins || [],
          createdBy: d.createdBy || '',
          description: d.description || '',
        }));

        set({ groups, loading: false });
      } catch {
        set({ loading: false });
      }
    };

    fetchGroups();

    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeToCollection(COLLECTIONS.CHATS, [
        where('type', '==', 'group'),
        where('participants', 'array-contains', userId),
        orderBy('updatedAt', 'desc'),
      ], (data) => {
        const groups: Chat[] = (data || []).map((d: any) => ({
          id: d.id,
          type: 'group',
          participants: d.participants || [],
          name: d.name || 'Group',
          avatar: d.avatar || '',
          lastMessage: d.lastMessage || '',
          updatedAt: d.updatedAt || '',
          unreadCount: d.unreadCount || 0,
          isMuted: d.isMuted || false,
          admins: d.admins || [],
          createdBy: d.createdBy || '',
          description: d.description || '',
        }));
        set({ groups, loading: false });
      });
    } catch {
      // ignore
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
        await deleteDocById(COLLECTIONS.CHATS, groupId);
        const msgs = await querySubcollection(COLLECTIONS.CHATS, groupId, COLLECTIONS.MESSAGES, []);
        for (const msg of msgs) {
          await deleteSubcollectionDoc(COLLECTIONS.CHATS, groupId, COLLECTIONS.MESSAGES, msg.id);
        }
      } else {
        await updateDocById(COLLECTIONS.CHATS, groupId, { participants, admins, updatedAt: serverTimestamp() });
        await addDocToSubcollection(COLLECTIONS.CHATS, groupId, COLLECTIONS.MESSAGES, {
          chatId: groupId,
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
      await updateDocById(COLLECTIONS.CHATS, groupId, {
        lastMessage: content,
        updatedAt: serverTimestamp(),
        unreadCount: { _increment: 1 },
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
      const msgs = await querySubcollection(COLLECTIONS.CHATS, _groupId, COLLECTIONS.MESSAGES, []);
      const found = msgs.find((m: any) => m.id === messageId);
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
    if (!groupId) return () => {};
    if (!isFirestoreAvailable()) { return () => {}; }

    const mapMsg = (d: Record<string, unknown>): Message => ({
      id: d.id as string,
      chatId: groupId,
      senderId: (d.senderId as string) || '',
      content: (d.content as string) || '',
      type: (d.type as Message['type']) || 'text',
      mediaUrl: (d.mediaUrl as string) || '',
      timestamp: ((rawTs: any) => rawTs && typeof rawTs === 'object' && 'toDate' in rawTs ? rawTs.toDate() : rawTs ? new Date(rawTs as string) : new Date())(d.createdAt ?? d.timestamp),
      read: (d.read as boolean) || false,
      edited: (d.edited as boolean) || false,
      reactions: (d.reactions as Record<string, string[]>) || {},
      replyTo: (d.replyTo as string) || undefined,
      forwardedFrom: (d.forwardedFrom as string) || undefined,
      pollData: d.pollData as Message['pollData'],
      transferData: d.transferData as Message['transferData'],
    });

    const fetchInitial = async () => {
      try {
        const data = await querySubcollection(COLLECTIONS.CHATS, groupId, COLLECTIONS.MESSAGES, [
          orderBy('timestamp', 'asc'),
          limit(50),
        ]);

        const msgs: Message[] = (data || []).map((d: any) => mapMsg(d));
        set((s) => ({ groupMessages: { ...s.groupMessages, [groupId]: msgs } }));
      } catch {
        // ignore
      }
    };

    fetchInitial();

    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeToSubcollection(COLLECTIONS.CHATS, groupId, COLLECTIONS.MESSAGES, [orderBy('timestamp', 'asc')], (data) => {
        const msgs: Message[] = (data || []).map((d: any) => mapMsg(d));
        set((s) => ({ groupMessages: { ...s.groupMessages, [groupId]: msgs } }));
      });
    } catch {
      // ignore
    }

    return () => { if (unsub) unsub(); };
  },

  deleteGroup: async (groupId) => {
    if (!isFirestoreAvailable()) { return; }
    try {
      const msgs = await querySubcollection(COLLECTIONS.CHATS, groupId, COLLECTIONS.MESSAGES, []);
      for (const msg of msgs) {
        await deleteSubcollectionDoc(COLLECTIONS.CHATS, groupId, COLLECTIONS.MESSAGES, msg.id);
      }
      await deleteDocById(COLLECTIONS.CHATS, groupId);
    } catch {
      return;
    }
  },
}));
