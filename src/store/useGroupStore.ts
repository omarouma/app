
import { create } from 'zustand';
import { toast } from 'sonner';
import {
  isFirestoreAvailable,
  COLLECTIONS,
  getDocById,
  updateDocById,
  deleteDocById,
  addDocToCollection,
  addDocToSubcollection,
  querySubcollection,
  queryCollection,
  updateSubcollectionDoc,
  deleteSubcollectionDoc,
  subscribeToCollection,
  subscribeToSubcollection,
  serverTimestamp,
  increment,
} from '@/lib/firestore';
import type { Chat, Message, GroupData, PollData, PinnedMessage } from '@/types';
import { where, orderBy, limit } from '@/lib/firestore';
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

interface GroupStore {
  groups: Chat[];
  currentGroup: GroupData | null;
  groupMessages: Record<string, Message[]>;
  loading: boolean;
  subscribeGroups: (userId: string) => () => void;
  createGroup: (name: string, description: string, participantIds: string[], createdBy: string) => Promise<string | null>;
  addParticipant: (groupId: string, userId: string, actorId?: string) => Promise<void>;
  removeParticipant: (groupId: string, userId: string, actorId?: string) => Promise<void>;
  promoteAdmin: (groupId: string, userId: string) => Promise<void>;
  demoteAdmin: (groupId: string, userId: string) => Promise<boolean>;
  leaveGroup: (groupId: string, userId: string) => Promise<void>;
  updateGroup: (groupId: string, data: Partial<GroupData>, actorId?: string) => Promise<void>;
  toggleGroupMute: (groupId: string, muted: boolean) => Promise<void>;
  updateGroupSettings: (groupId: string, settings: NonNullable<GroupData['settings']>) => Promise<void>;
  createInviteLink: (groupId: string) => Promise<string | null>;
  revokeInviteLink: (groupId: string) => Promise<void>;
  joinGroupByInvite: (code: string, userId: string) => Promise<string | null>;
  sendGroupMessage: (groupId: string, senderId: string, content: string, type?: string, mediaUrl?: string, replyTo?: string) => Promise<void>;
  subscribeGroupMessages: (groupId: string) => () => void;
  deleteGroupMessage: (groupId: string, messageId: string) => Promise<void>;
  deleteGroupMessageForEveryone: (groupId: string, messageId: string) => Promise<void>;
  editGroupMessage: (groupId: string, messageId: string, content: string) => Promise<void>;
  addGroupReaction: (groupId: string, messageId: string, emoji: string, userId: string) => Promise<void>;
  pinGroupMessage: (groupId: string, messageId: string, content: string, pinnedBy: string) => Promise<void>;
  unpinGroupMessage: (groupId: string, messageId: string) => Promise<void>;
  sendGroupPoll: (groupId: string, senderId: string, question: string, options: string[]) => Promise<void>;
  voteGroupPoll: (groupId: string, messageId: string, optionIndex: number, userId: string) => Promise<void>;
  forwardGroupMessage: (groupId: string, senderId: string, original: Message) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
}

export const useGroupStore = create<GroupStore>((set) => ({
  groups: [],
  currentGroup: null,
  groupMessages: {},
  loading: true,

  subscribeGroups: (userId: string) => {
    if (!userId) { set({ groups: [], loading: false }); return () => { }; }
    if (!isFirestoreAvailable()) { set({ groups: [], loading: false }); return () => { }; }
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
            inviteCode: (d.inviteCode as string) || undefined,
            settings: (d.settings as Chat['settings']) || undefined,
            pinnedMessages: (d.pinnedMessages as Chat['pinnedMessages']) || [],
          }));
          set({ groups, loading: false });

          // Overlay authoritative per-user unread counts (server RPC).
          void (async () => {
            try {
              const { chatApi } = await import('@/services/chatApi');
              const unreadMap = await chatApi.fetchUnreadCounts(userId);
              if (!unreadMap || Object.keys(unreadMap).length === 0) return;
              set((s) => ({
                groups: s.groups.map((g) =>
                  unreadMap[g.id] !== undefined ? { ...g, unreadCount: unreadMap[g.id] } : g
                ),
              }));
            } catch { /* unread overlay is best-effort */ }
          })();
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

  addParticipant: async (groupId, userId, actorId) => {
    if (!isFirestoreAvailable()) { return; }
    try {
      const chat = await getDocById(COLLECTIONS.CHATS, groupId);
      if (!chat) return;
      const participants = [...new Set([...(chat.participants || []), userId])];
      await updateDocById(COLLECTIONS.CHATS, groupId, { participants, updatedAt: serverTimestamp() });
      await addDocToSubcollection(COLLECTIONS.CHATS, groupId, COLLECTIONS.MESSAGES, {
        chatId: groupId,
        senderId: 'system',
        content: actorId ? 'A member was added to the group' : 'A member joined the group',
        type: 'system',
        timestamp: serverTimestamp(),
      });
    } catch {
      return;
    }
  },

  removeParticipant: async (groupId, userId, actorId) => {
    if (!isFirestoreAvailable()) { return; }
    try {
      const chat = await getDocById(COLLECTIONS.CHATS, groupId);
      if (!chat) return;
      const participants = (chat.participants || []).filter((p: string) => p !== userId);
      const admins = (chat.admins || []).filter((a: string) => a !== userId);
      await updateDocById(COLLECTIONS.CHATS, groupId, { participants, admins, updatedAt: serverTimestamp() });
      await addDocToSubcollection(COLLECTIONS.CHATS, groupId, COLLECTIONS.MESSAGES, {
        chatId: groupId,
        senderId: 'system',
        content: actorId ? 'A member was removed from the group' : 'A member left the group',
        type: 'system',
        timestamp: serverTimestamp(),
      });
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
      await addDocToSubcollection(COLLECTIONS.CHATS, groupId, COLLECTIONS.MESSAGES, {
        chatId: groupId,
        senderId: 'system',
        content: 'A member was promoted to admin',
        type: 'system',
        timestamp: serverTimestamp(),
      });
    } catch {
      return;
    }
  },

  demoteAdmin: async (groupId, userId) => {
    if (!isFirestoreAvailable()) { return false; }
    try {
      const chat = await getDocById(COLLECTIONS.CHATS, groupId);
      if (!chat) return false;
      const admins = (chat.admins || []) as string[];
      // Ownership rule: the group creator can never be demoted, and the last
      // remaining admin cannot be demoted (a group must always have an admin).
      if (userId === chat.createdBy) return false;
      if (admins.length <= 1) return false;
      const nextAdmins = admins.filter((a) => a !== userId);
      await updateDocById(COLLECTIONS.CHATS, groupId, { admins: nextAdmins, updatedAt: serverTimestamp() });
      await addDocToSubcollection(COLLECTIONS.CHATS, groupId, COLLECTIONS.MESSAGES, {
        chatId: groupId,
        senderId: 'system',
        content: 'A member is no longer an admin',
        type: 'system',
        timestamp: serverTimestamp(),
      });
      return true;
    } catch {
      return false;
    }
  },

  leaveGroup: async (groupId, userId) => {
    if (!isFirestoreAvailable()) { return; }
    try {
      const chat = await getDocById(COLLECTIONS.CHATS, groupId);
      if (!chat) return;
      const participants = (chat.participants || []).filter((p: string) => p !== userId);
      let admins = (chat.admins || []).filter((a: string) => a !== userId);

      if (participants.length === 0) {
        const msgs = await querySubcollection(COLLECTIONS.CHATS, groupId, COLLECTIONS.MESSAGES, []);
        await Promise.all([
          deleteDocById(COLLECTIONS.CHATS, groupId),
          ...msgs.map((msg) => deleteSubcollectionDoc(COLLECTIONS.CHATS, groupId, COLLECTIONS.MESSAGES, msg.id)),
        ]);
        return;
      }

      // Ownership rule: if the last admin leaves, promote the longest-standing
      // remaining member so the group is never left without an admin.
      if (admins.length === 0) {
        admins = [participants[0]];
      }

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
    } catch {
      return;
    }
  },

  updateGroup: async (groupId, data, actorId) => {
    if (!isFirestoreAvailable()) { return; }
    try {
      const payload: Record<string, unknown> = {};
      if (data.name !== undefined) payload.name = data.name;
      if (data.description !== undefined) payload.description = data.description;
      if (data.avatar !== undefined) payload.avatar = data.avatar;
      payload.updatedAt = serverTimestamp();
      await updateDocById(COLLECTIONS.CHATS, groupId, payload);

      // Emit a system message describing what changed (name / photo / description).
      let change = '';
      if (data.name !== undefined) change = 'Group name was changed';
      else if (data.avatar !== undefined) change = 'Group photo was changed';
      else if (data.description !== undefined) change = 'Group description was updated';
      if (change && actorId) {
        await addDocToSubcollection(COLLECTIONS.CHATS, groupId, COLLECTIONS.MESSAGES, {
          chatId: groupId,
          senderId: 'system',
          content: change,
          type: 'system',
          timestamp: serverTimestamp(),
        });
      }
    } catch {
      return;
    }
  },

  toggleGroupMute: async (groupId, muted) => {
    if (!isFirestoreAvailable()) { return; }
    try {
      await updateDocById(COLLECTIONS.CHATS, groupId, { isMuted: muted });
    } catch {
      return;
    }
  },

  updateGroupSettings: async (groupId, settings) => {
    if (!isFirestoreAvailable()) { return; }
    try {
      await updateDocById(COLLECTIONS.CHATS, groupId, { settings, updatedAt: serverTimestamp() });
    } catch {
      return;
    }
  },

  createInviteLink: async (groupId) => {
    if (!isFirestoreAvailable()) { return null; }
    try {
      const code = `${groupId.slice(0, 8)}${Math.random().toString(36).slice(2, 10)}`;
      await updateDocById(COLLECTIONS.CHATS, groupId, { inviteCode: code, updatedAt: serverTimestamp() });
      return code;
    } catch {
      return null;
    }
  },

  revokeInviteLink: async (groupId) => {
    if (!isFirestoreAvailable()) { return; }
    try {
      await updateDocById(COLLECTIONS.CHATS, groupId, { inviteCode: null, updatedAt: serverTimestamp() });
    } catch {
      return;
    }
  },

  joinGroupByInvite: async (code, userId) => {
    if (!isFirestoreAvailable() || !code) { return null; }
    try {
      const results = await queryCollection<Chat>(COLLECTIONS.CHATS, [where('inviteCode', '==', code), limit(1)]);
      const group = results?.[0];
      if (!group) return null;
      const participants = [...new Set([...(group.participants || []), userId])];
      await updateDocById(COLLECTIONS.CHATS, group.id, { participants, updatedAt: serverTimestamp() });
      await addDocToSubcollection(COLLECTIONS.CHATS, group.id, COLLECTIONS.MESSAGES, {
        chatId: group.id,
        senderId: 'system',
        content: 'A member joined via invite link',
        type: 'system',
        timestamp: serverTimestamp(),
      });
      return group.id;
    } catch {
      return null;
    }
  },

  sendGroupMessage: async (groupId, senderId, content, type = 'text', mediaUrl, replyTo) => {
    if (!isFirestoreAvailable()) return;
    const localId = `pending_g_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const optimisticMsg: Message = {
      id: localId,
      chatId: groupId,
      senderId,
      content,
      type: (type as Message['type']) || 'text',
      mediaUrl: mediaUrl || '',
      timestamp: new Date(),
      read: false,
      edited: false,
      reactions: {},
      deliveryStatus: isOnline() ? 'sending' : 'pending',
      retryCount: 0,
      localId,
      replyTo: typeof replyTo === 'string' ? replyTo : replyTo,
    };
    set((s) => ({
      groupMessages: { ...s.groupMessages, [groupId]: [...(s.groupMessages[groupId] ?? []), optimisticMsg] },
    }));

    // If offline, push to queue and keep optimistic pending state
    if (!isOnline()) {
      enqueueOfflineMessage({
        type: 'group', chatId: groupId, senderId, content,
        messageType: type, mediaUrl, replyTo: typeof replyTo === 'string' ? replyTo : replyTo,
      });
      return;
    }

    let sent = false;
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
      try {
        const msgData: Record<string, unknown> = {
          chatId: groupId, senderId, content, type,
          timestamp: serverTimestamp(),
          read: false,
        };
        if (mediaUrl) msgData.mediaUrl = mediaUrl;
        if (replyTo) msgData.replyTo = typeof replyTo === 'string' ? replyTo : replyTo;

        await addDocToSubcollection(COLLECTIONS.CHATS, groupId, COLLECTIONS.MESSAGES, msgData);

        set((s) => ({
          groupMessages: {
            ...s.groupMessages,
            [groupId]: (s.groupMessages[groupId] ?? []).filter((m) => m.localId !== localId),
          },
        }));

        const safeContent = typeof content === 'string' ? content.slice(0, 4000) : '';
        await updateDocById(COLLECTIONS.CHATS, groupId, {
          lastMessage: safeContent,
          updatedAt: serverTimestamp(),
          unreadCount: increment(1),
        });
sent = true;
        break;
      } catch {
        const isLast = attempt === maxAttempts - 1;
        set((s) => ({
          groupMessages: {
            ...s.groupMessages,
            [groupId]: (s.groupMessages[groupId] ?? []).map((m) =>
              m.localId === localId
                ? { ...m, retryCount: attempt + 1, deliveryStatus: isLast ? 'failed' : 'sending' }
                : m
            ),
          },
        }));
        if (isLast) {
          enqueueOfflineMessage({
            type: 'group', chatId: groupId, senderId, content,
            messageType: type, mediaUrl, replyTo: typeof replyTo === 'string' ? replyTo : replyTo,
          });
          toast.error('Group message queued. Will send automatically when online.');
        }
      }
    }
    if (!sent) return;
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

  pinGroupMessage: async (_groupId, messageId, content, pinnedBy) => {
    if (!isFirestoreAvailable()) { return; }
    try {
      const chat = await getDocById(COLLECTIONS.CHATS, _groupId);
      if (!chat) return;
      const existing = (chat.pinnedMessages as PinnedMessage[]) || [];
      if (existing.some((p) => (p.messageId || p.message_id) === messageId)) return;
      const entry: PinnedMessage = {
        message_id: messageId,
        messageId,
        content,
        pinned_by: pinnedBy,
        pinnedBy,
        pinned_at: new Date().toISOString(),
        pinnedAt: new Date().toISOString(),
      };
      await updateDocById(COLLECTIONS.CHATS, _groupId, { pinnedMessages: [...existing, entry] });
    } catch {
      return;
    }
  },

  unpinGroupMessage: async (_groupId, messageId) => {
    if (!isFirestoreAvailable()) { return; }
    try {
      const chat = await getDocById(COLLECTIONS.CHATS, _groupId);
      if (!chat) return;
      const existing = (chat.pinnedMessages as PinnedMessage[]) || [];
      const next = existing.filter((p) => (p.messageId || p.message_id) !== messageId);
      await updateDocById(COLLECTIONS.CHATS, _groupId, { pinnedMessages: next });
    } catch {
      return;
    }
  },

  sendGroupPoll: async (groupId, senderId, question, options) => {
    if (!isFirestoreAvailable() || !groupId || !senderId) return;
    const cleanQuestion = question.trim();
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!cleanQuestion || cleanOptions.length < 2) {
      toast.error('A poll needs a question and at least two options.');
      return;
    }
    try {
      const pollData: PollData = {
        question: cleanQuestion,
        options: cleanOptions.map((text) => ({ text, votes: [] })),
        totalVotes: 0,
      };
      await addDocToSubcollection(COLLECTIONS.CHATS, groupId, COLLECTIONS.MESSAGES, {
        chatId: groupId,
        senderId,
        content: `Poll: ${cleanQuestion}`,
        type: 'poll',
        pollData,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      await updateDocById(COLLECTIONS.CHATS, groupId, {
        lastMessage: `Poll: ${cleanQuestion}`,
        updatedAt: serverTimestamp(),
      });
      toast.success('Poll sent.');
    } catch {
      toast.error('Failed to send poll.');
    }
  },

  voteGroupPoll: async (groupId, messageId, optionIndex, userId) => {
    if (!isFirestoreAvailable() || !groupId || !messageId || !userId) return;
    try {
      const found = await getDocById(`${COLLECTIONS.CHATS}/${groupId}/${COLLECTIONS.MESSAGES}`, messageId);
      if (!found) return;
      const pollData = found.pollData as PollData | undefined;
      if (!pollData || !pollData.options[optionIndex]) return;
      const options = pollData.options.map((opt, idx) => {
        const votes = (opt.votes || []).filter((v) => v !== userId);
        if (idx === optionIndex) votes.push(userId);
        return { ...opt, votes };
      });
      const totalVotes = options.reduce((sum, opt) => sum + (opt.votes?.length || 0), 0);
      await updateSubcollectionDoc(COLLECTIONS.CHATS, groupId, COLLECTIONS.MESSAGES, messageId, {
        pollData: { ...pollData, options, totalVotes },
      });
    } catch {
      return;
    }
  },

  forwardGroupMessage: async (groupId, senderId, original) => {
    if (!isFirestoreAvailable() || !groupId || !senderId) return;
    try {
      const msgData: Record<string, unknown> = {
        chatId: groupId,
        senderId,
        content: original.content,
        type: original.type,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
        read: false,
        forwardedFrom: original.senderId,
      };
      if (original.mediaUrl) msgData.mediaUrl = original.mediaUrl;
      if (original.pollData) msgData.pollData = original.pollData;
      if (original.contactCard) msgData.contactCard = original.contactCard;
      await addDocToSubcollection(COLLECTIONS.CHATS, groupId, COLLECTIONS.MESSAGES, msgData);
      await updateDocById(COLLECTIONS.CHATS, groupId, {
        lastMessage: typeof original.content === 'string' ? original.content.slice(0, 4000) : '',
        updatedAt: serverTimestamp(),
      });
      toast.success('Message forwarded.');
    } catch {
      toast.error('Failed to forward message.');
    }
  },

  subscribeGroupMessages: (groupId: string, initialLimit = 100) => {
    if (!groupId || !isFirestoreAvailable()) return () => { };

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
      deliveryStatus: (d.deliveryStatus as Message['deliveryStatus']) || (d.read ? 'read' : d.senderId ? 'sent' : undefined),
      localId: (d.localId as string) || undefined,
      retryCount: (d.retryCount as number) || undefined,
    });

    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeToSubcollection(
        COLLECTIONS.CHATS,
        groupId,
        COLLECTIONS.MESSAGES,
        [orderBy('createdAt', 'desc'), limit(initialLimit)],
        (data) => {
          const raw = data || [];
          set((s) => {
            const existing = s.groupMessages[groupId] || [];
            const merged: Message[] = [];
            const seenIds = new Set<string>();
            const seenLocalIds = new Set<string>();

            for (let i = raw.length - 1; i >= 0; i--) {
              const m = mapMsg(raw[i]);
              if (seenIds.has(m.id)) continue;
              seenIds.add(m.id);
              if (m.localId) seenLocalIds.add(m.localId);
              merged.push(m);
            }

            // Preserve ALL existing messages not matched in the server window —
            // this keeps paginated older history and optimistic pending items.
            for (const m of existing) {
              if (seenIds.has(m.id)) continue;
              if (m.localId && seenLocalIds.has(m.localId)) continue;
              merged.push(m);
              if (m.localId) seenLocalIds.add(m.localId);
            }

            return { groupMessages: { ...s.groupMessages, [groupId]: merged } };
          });
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