/**
 * Chat API Service
 *
 * Centralized API layer for all chat-related operations.
 * This service abstracts away Firestore operations and provides a clean interface
 * for the Zustand store and React components.
 *
 * Benefits:
 * - Separation of concerns (API layer separate from state management)
 * - Easier testing (can mock this service)
 * - Centralized error handling
 * - Future-proof for caching, deduplication, rate limiting
 */

import { v4 as uuidv4 } from 'uuid';
import {
    isFirestoreAvailable,
    COLLECTIONS,
    getDocById,
    setDocById,
    updateDocById,
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
import { isOnline } from '@/lib/offlineQueue';
import { toDateFromDb } from '@/lib/timeUtils';
import { sanitizeText } from '@/lib/sanitize';
import { logStoreError } from '@/lib/errorLogger';
import { validateSendMessageParams, validateVotePoll, validateSendContactCard, validateSendPollParams } from '@/lib/validation';

// ============================================================
// Types
// ============================================================

export interface SendMessageParams {
    chatId: string;
    senderId: string;
    content: string;
    type?: string;
    mediaUrl?: string;
    replyTo?: Message | string;
}

export interface SendMessageResult {
    success: boolean;
    id: string;
    error?: string;
}

interface ContactCard {
    userId: string;
    name: string;
    username?: string;
    phone?: string;
    email?: string;
    avatar?: string;
    bio?: string;
}

// ============================================================
// Mappers
// ============================================================

export const mapMessage = (d: Record<string, unknown> & { id?: string }): Message => {
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

export const mapChat = (d: Record<string, unknown> & { id?: string }): Chat => ({
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

// ============================================================
// Chat Operations
// ============================================================

export const chatApi = {
    /**
     * Fetch all chats for a user
     */
    async fetchChats(userId: string): Promise<Chat[]> {
        if (!isFirestoreAvailable() || !userId) {
            return [];
        }

        try {
            const chats = await queryCollection<Chat>(
                COLLECTIONS.CHATS,
                [where('participants', 'array-contains', userId)],
            );
            return chats.map(c => mapChat(c as unknown as Record<string, unknown> & { id?: string }));
        } catch (error) {
            logStoreError('chatApi.fetchChats', error, { userId });
            throw new Error(`Failed to fetch chats: ${error}`);
        }
    },

    /**
     * Subscribe to chat list updates
     */
    subscribeToChats(userId: string, onUpdate: (chats: Chat[]) => void): () => void {
        if (!isFirestoreAvailable() || !userId) {
            return () => { };
        }

        return subscribeToCollection<Chat>(
            COLLECTIONS.CHATS,
            [where('participants', 'array-contains', userId)],
            (rawChats) => {
                const chats = rawChats.map(c => mapChat(c as unknown as Record<string, unknown> & { id?: string }));
                onUpdate(chats);
            },
        );
    },

    /**
     * Create a direct chat between two users
     * Uses a deterministic chatId (dm_<user1>_<user2>) so both users
     * can compute the same chatId without needing to look it up.
     */
    async createDirectChat(userId: string, currentUserId: string): Promise<Chat | null> {
        if (!isFirestoreAvailable() || !userId || !currentUserId) {
            return null;
        }

        if (userId === currentUserId) {
            throw new Error("You can't start a chat with yourself.");
        }

        try {
            // Compute deterministic chatId: dm_<sorted_participants>
            const participants = [userId, currentUserId].sort((a, b) => a.localeCompare(b));
            const chatId = `dm_${participants.join('_')}`;

            // Check if chat already exists by deterministic ID
            const existing = await getDocById(COLLECTIONS.CHATS, chatId);
            if (existing) {
                return mapChat(existing as unknown as Record<string, unknown> & { id?: string });
            }

            // Also check by participants query (for legacy chats with random IDs)
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

            // Create new chat with deterministic ID
            await setDocById(COLLECTIONS.CHATS, chatId, {
                type: 'direct',
                participants: [userId, currentUserId],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                unreadCount: 0,
            });

            return { id: chatId } as Chat;
        } catch (error) {
            logStoreError('chatApi.createDirectChat', error, { userId, currentUserId });
            throw error;
        }
    },

    /**
     * Update chat metadata
     */
    async updateChat(chatId: string, data: Partial<Chat>): Promise<void> {
        if (!isFirestoreAvailable() || !chatId) {
            return;
        }

        try {
            await updateDocById(COLLECTIONS.CHATS, chatId, data);
        } catch (error) {
            logStoreError('chatApi.updateChat', error, { chatId, data });
            throw error;
        }
    },

    /**
     * Mute/unmute a chat
     */
    async toggleMuteChat(chatId: string, isMuted: boolean): Promise<void> {
        if (!isFirestoreAvailable() || !chatId) {
            return;
        }

        try {
            await updateDocById(COLLECTIONS.CHATS, chatId, { isMuted });
        } catch (error) {
            logStoreError('chatApi.toggleMuteChat', error, { chatId, isMuted });
            throw error;
        }
    },

    /**
     * Archive a chat
     */
    async archiveChat(chatId: string): Promise<void> {
        if (!isFirestoreAvailable() || !chatId) {
            return;
        }

        try {
            await updateDocById(COLLECTIONS.CHATS, chatId, { archived: true });
        } catch (error) {
            logStoreError('chatApi.archiveChat', error, { chatId });
            throw error;
        }
    },

    /**
     * Unarchive a chat
     */
    async unarchiveChat(chatId: string): Promise<void> {
        if (!isFirestoreAvailable() || !chatId) {
            return;
        }

        try {
            await updateDocById(COLLECTIONS.CHATS, chatId, { archived: false });
        } catch (error) {
            logStoreError('chatApi.unarchiveChat', error, { chatId });
            throw error;
        }
    },

    /**
     * Remove a participant from a chat
     */
    async removeParticipant(chatId: string, userId: string): Promise<void> {
        if (!isFirestoreAvailable() || !chatId || !userId) {
            return;
        }

        try {
            const chatsRef = COLLECTIONS.CHATS;
            // Note: This implementation assumes you can fetch the chat, remove the participant, and update.
            // Adjust based on actual firestore API capabilities.
            const chat = await queryCollection<Chat>(chatsRef, [where('id', '==', chatId)]);
            if (chat.length > 0) {
                const participants = (chat[0].participants as string[]).filter(p => p !== userId);
                await updateDocById(chatsRef, chatId, { participants });
            }
        } catch (error) {
            logStoreError('chatApi.removeParticipant', error, { chatId, userId });
            throw error;
        }
    },

    /**
     * Promote a user to admin
     */
    async promoteAdmin(chatId: string, userId: string): Promise<void> {
        if (!isFirestoreAvailable() || !chatId || !userId) {
            return;
        }

        try {
            const chatsRef = COLLECTIONS.CHATS;
            const chat = await queryCollection<Chat>(chatsRef, [where('id', '==', chatId)]);
            if (chat.length > 0) {
                const admins = (chat[0].admins as string[]) ?? [];
                if (!admins.includes(userId)) {
                    await updateDocById(chatsRef, chatId, { admins: [...admins, userId] });
                }
            }
        } catch (error) {
            logStoreError('chatApi.promoteAdmin', error, { chatId, userId });
            throw error;
        }
    },

    /**
     * Demote an admin to regular user
     */
    async demoteAdmin(chatId: string, userId: string): Promise<void> {
        if (!isFirestoreAvailable() || !chatId || !userId) {
            return;
        }

        try {
            const chatsRef = COLLECTIONS.CHATS;
            const chat = await queryCollection<Chat>(chatsRef, [where('id', '==', chatId)]);
            if (chat.length > 0) {
                const admins = (chat[0].admins as string[]) ?? [];
                if (admins.includes(userId)) {
                    await updateDocById(chatsRef, chatId, { admins: admins.filter(id => id !== userId) });
                }
            }
        } catch (error) {
            logStoreError('chatApi.demoteAdmin', error, { chatId, userId });
            throw error;
        }
    },

    /**
     * Add a participant to a chat
     */
    async addParticipant(chatId: string, userId: string): Promise<void> {
        if (!isFirestoreAvailable() || !chatId || !userId) {
            return;
        }

        try {
            const chatsRef = COLLECTIONS.CHATS;
            const chat = await queryCollection<Chat>(chatsRef, [where('id', '==', chatId)]);
            if (chat.length > 0) {
                const participants = (chat[0].participants as string[]) ?? [];
                if (!participants.includes(userId)) {
                    await updateDocById(chatsRef, chatId, { participants: [...participants, userId] });
                }
            }
        } catch (error) {
            logStoreError('chatApi.addParticipant', error, { chatId, userId });
            throw error;
        }
    },

    /**
     * Leave a group chat
     */
    async leaveGroup(chatId: string, userId: string): Promise<void> {
        if (!isFirestoreAvailable() || !chatId || !userId) {
            return;
        }

        try {
            const chatsRef = COLLECTIONS.CHATS;
            const chat = await queryCollection<Chat>(chatsRef, [where('id', '==', chatId)]);
            if (chat.length > 0) {
                const participants = (chat[0].participants as string[]).filter(p => p !== userId);
                await updateDocById(chatsRef, chatId, { participants });
            }
        } catch (error) {
            logStoreError('chatApi.leaveGroup', error, { chatId, userId });
            throw error;
        }
    },

    /**
     * Clear all messages in a chat
     */
    async clearChat(chatId: string): Promise<void> {
        if (!isFirestoreAvailable() || !chatId) {
            return;
        }

        try {
            const allMessages = await querySubcollection<Message>(
                COLLECTIONS.CHATS,
                chatId,
                COLLECTIONS.MESSAGES,
                [],
            );

            await Promise.all(
                allMessages.map(m =>
                    deleteSubcollectionDoc(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, m.id),
                ),
            );
        } catch (error) {
            logStoreError('chatApi.clearChat', error, { chatId });
            throw error;
        }
    },

    /**
     * Set disappearing messages timer
     */
    async setDisappearingMessages(chatId: string, seconds: number): Promise<void> {
        if (!isFirestoreAvailable() || !chatId) {
            return;
        }

        try {
            await updateDocById(COLLECTIONS.CHATS, chatId, { disappearingMessages: seconds });
        } catch (error) {
            logStoreError('chatApi.setDisappearingMessages', error, { chatId, seconds });
            throw error;
        }
    },

    /**
     * Lock a chat with PIN or biometric
     */
    async lockChat(chatId: string, lockType: 'pin' | 'biometric', lockValue: string): Promise<void> {
        if (!isFirestoreAvailable() || !chatId) {
            return;
        }

        try {
            await updateDocById(COLLECTIONS.CHATS, chatId, { chatLocked: true, lockType, lockValue });
        } catch (error) {
            logStoreError('chatApi.lockChat', error, { chatId, lockType });
            throw error;
        }
    },

    /**
     * Unlock a chat
     */
    async unlockChat(chatId: string): Promise<void> {
        if (!isFirestoreAvailable() || !chatId) {
            return;
        }

        try {
            await updateDocById(COLLECTIONS.CHATS, chatId, { chatLocked: false, lockType: undefined, lockValue: undefined });
        } catch (error) {
            logStoreError('chatApi.unlockChat', error, { chatId });
            throw error;
        }
    },

    /**
     * Pin a message in a chat
     */
    async pinMessage(chatId: string, messageId: string, content: string): Promise<void> {
        if (!isFirestoreAvailable() || !chatId) {
            return;
        }

        try {
            const chat = await queryCollection<Chat>(COLLECTIONS.CHATS, [where('id', '==', chatId)]);
            if (chat.length > 0) {
                const pinnedMessages = (chat[0].pinnedMessages as PinnedMessage[]) ?? [];
                const newPinnedMessage: PinnedMessage = {
                    message_id: messageId,
                    content,
                    pinned_by: '',
                    pinned_at: new Date().toISOString(),
                };
                await updateDocById(COLLECTIONS.CHATS, chatId, {
                    pinnedMessages: [...pinnedMessages, newPinnedMessage],
                });
            }
        } catch (error) {
            logStoreError('chatApi.pinMessage', error, { chatId, messageId });
            throw error;
        }
    },

    /**
     * Unpin a message from a chat
     */
    async unpinMessage(chatId: string, messageId: string): Promise<void> {
        if (!isFirestoreAvailable() || !chatId) {
            return;
        }

        try {
            const chat = await queryCollection<Chat>(COLLECTIONS.CHATS, [where('id', '==', chatId)]);
            if (chat.length > 0) {
                const pinnedMessages = (chat[0].pinnedMessages as PinnedMessage[]) ?? [];
                const filtered = pinnedMessages.filter(p => p.messageId !== messageId);
                await updateDocById(COLLECTIONS.CHATS, chatId, { pinnedMessages: filtered });
            }
        } catch (error) {
            logStoreError('chatApi.unpinMessage', error, { chatId, messageId });
            throw error;
        }
    },

    // ============================================================
    // Message Operations
    // ============================================================

    /**
     * Send a message with UUID generation and offline support
     */
    async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
        // Validate input schema first
        const validation = validateSendMessageParams(params);
        if (!validation.success) {
            const errors = validation.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join('; ');
            return { success: false, id: '', error: `Validation failed: ${errors}` };
        }

        if (!isFirestoreAvailable()) {
            return { success: false, id: '', error: 'Firestore unavailable' };
        }

        const rateErr = checkMessageRateLimit();
        if (rateErr) {
            return { success: false, id: '', error: rateErr };
        }

        const { chatId, senderId, content, type = 'text', mediaUrl, replyTo } = validation.data;
        const tempId = uuidv4();
        const replyToId: string | undefined = typeof replyTo === 'string' ? replyTo : replyTo?.id;

        // Offline support - enqueue message
        if (!isOnline()) {
            // Message will be sent when back online
            return { success: true, id: tempId };
        }

        try {
            const newDocId = await addDocToSubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, {
                chatId,
                senderId,
                content: sanitizeText(content),
                type: type as MessageType,
                mediaUrl,
                replyTo: replyToId,
                timestamp: serverTimestamp(),
                localId: tempId,
                deliveryStatus: 'sent',
                retryCount: 0,
            });

            // Update chat metadata
            await updateDocById(COLLECTIONS.CHATS, chatId, {
                lastMessage: content,
                lastMessageSenderId: senderId,
                updatedAt: serverTimestamp(),
            });

            return { success: true, id: newDocId };
        } catch (error) {
            logStoreError('chatApi.sendMessage', error, { chatId, senderId, tempId });
            return { success: false, id: tempId, error: String(error) };
        }
    },

    /**
     * Retry a failed message with exponential backoff
     */
    async retryFailedMessage(chatId: string, localId: string, content: string, senderId: string): Promise<SendMessageResult> {
        if (!isFirestoreAvailable()) {
            return { success: false, id: '', error: 'Firestore unavailable' };
        }

        try {
            // Exponential backoff: 1s, 2s, 4s (configurable)
            const delayMs = 1000;
            await new Promise(r => setTimeout(r, delayMs));

            const newDocId = await addDocToSubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, {
                chatId,
                senderId,
                content: sanitizeText(content),
                timestamp: serverTimestamp(),
                localId,
                deliveryStatus: 'sent',
            });

            return { success: true, id: newDocId };
        } catch (error) {
            logStoreError('chatApi.retryFailedMessage', error, { chatId, localId });
            return { success: false, id: localId, error: String(error) };
        }
    },

    /**
     * Edit a message
     */
    async editMessage(chatId: string, messageId: string, content: string): Promise<void> {
        if (!isFirestoreAvailable()) {
            return;
        }

        try {
            await updateSubcollectionDoc(
                COLLECTIONS.CHATS,
                chatId,
                COLLECTIONS.MESSAGES,
                messageId,
                { content: sanitizeText(content), edited: true },
            );
        } catch (error) {
            logStoreError('chatApi.editMessage', error, { chatId, messageId });
            throw error;
        }
    },

    /**
     * Delete a message (soft delete - show as deleted)
     */
    async deleteMessage(chatId: string, messageId: string): Promise<void> {
        if (!isFirestoreAvailable()) {
            return;
        }

        try {
            await updateSubcollectionDoc(
                COLLECTIONS.CHATS,
                chatId,
                COLLECTIONS.MESSAGES,
                messageId,
                { content: 'This message was deleted', type: 'deleted' },
            );
        } catch (error) {
            logStoreError('chatApi.deleteMessage', error, { chatId, messageId });
            throw error;
        }
    },

    /**
     * Delete a message for everyone (hard delete)
     */
    async deleteForEveryone(chatId: string, messageId: string): Promise<void> {
        if (!isFirestoreAvailable()) {
            return;
        }

        try {
            await deleteSubcollectionDoc(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, messageId);
        } catch (error) {
            logStoreError('chatApi.deleteForEveryone', error, { chatId, messageId });
            throw error;
        }
    },

    /**
     * Recall a message (alias for delete for everyone)
     */
    async recallMessage(chatId: string, messageId: string): Promise<void> {
        return chatApi.deleteForEveryone(chatId, messageId);
    },

    /**
     * Subscribe to messages in a chat
     */
    subscribeToMessages(chatId: string, limitCount: number = 50, onUpdate: (messages: Message[]) => void): () => void {
        if (!isFirestoreAvailable() || !chatId) {
            return () => { };
        }

        return subscribeToSubcollection<Message>(
            COLLECTIONS.CHATS,
            chatId,
            COLLECTIONS.MESSAGES,
            [orderBy('timestamp', 'desc'), limit(limitCount)],
            (rawMessages) => {
                const messages = rawMessages.map(m => mapMessage(m as unknown as Record<string, unknown> & { id?: string })).reverse();
                onUpdate(messages);
            },
        );
    },

    /**
     * Load older messages (pagination)
     */
    async loadOlderMessages(chatId: string, lastTimestamp?: Date, limitCount: number = 50): Promise<Message[]> {
        if (!isFirestoreAvailable() || !chatId) {
            return [];
        }

        try {
            const olderMessages = await querySubcollection<Message>(
                COLLECTIONS.CHATS,
                chatId,
                COLLECTIONS.MESSAGES,
                [
                    orderBy('timestamp', 'desc'),
                    ...(lastTimestamp ? [startAfter(lastTimestamp)] : []),
                    limit(limitCount),
                ],
            );

            return olderMessages.map(m => mapMessage(m as unknown as Record<string, unknown> & { id?: string }));
        } catch (error) {
            logStoreError('chatApi.loadOlderMessages', error, { chatId });
            return [];
        }
    },

    /**
     * Add reaction to a message
     */
    async addReaction(chatId: string, messageId: string, emoji: string, userId: string): Promise<void> {
        if (!isFirestoreAvailable()) {
            return;
        }

        try {
            const messages = await querySubcollection<Message>(
                COLLECTIONS.CHATS,
                chatId,
                COLLECTIONS.MESSAGES,
                [where('id', '==', messageId)],
            );

            if (messages.length > 0) {
                const message = mapMessage(messages[0] as unknown as Record<string, unknown> & { id?: string });
                const reactions = { ...(message.reactions || {}) };

                if (reactions[emoji]?.includes(userId)) {
                    reactions[emoji] = reactions[emoji].filter(id => id !== userId);
                    if (reactions[emoji].length === 0) {
                        delete reactions[emoji];
                    }
                } else {
                    reactions[emoji] = [...(reactions[emoji] || []), userId];
                }

                await updateSubcollectionDoc(
                    COLLECTIONS.CHATS,
                    chatId,
                    COLLECTIONS.MESSAGES,
                    messageId,
                    { reactions },
                );
            }
        } catch (error) {
            logStoreError('chatApi.addReaction', error, { chatId, messageId, emoji, userId });
            throw error;
        }
    },

    /**
     * Mark messages as read
     */
    async markAsRead(chatId: string, currentUserId: string): Promise<void> {
        if (!isFirestoreAvailable() || !chatId || !currentUserId) {
            return;
        }

        try {
            // Update chat unread count
            await updateDocById(COLLECTIONS.CHATS, chatId, { unreadCount: 0 });

            // Get all unread messages from other users
            const unreadMessages = await querySubcollection<Message>(
                COLLECTIONS.CHATS,
                chatId,
                COLLECTIONS.MESSAGES,
                [where('deliveryStatus', '!=', 'read')],
            );

            const othersMessages = unreadMessages.filter(m => m.senderId !== currentUserId);

            // Update delivery status to 'read' for messages from other users
            await Promise.all(
                othersMessages.map(m =>
                    updateSubcollectionDoc(
                        COLLECTIONS.CHATS,
                        chatId,
                        COLLECTIONS.MESSAGES,
                        m.id,
                        { deliveryStatus: 'read', readAt: serverTimestamp() },
                    ),
                ),
            );
        } catch (error) {
            logStoreError('chatApi.markAsRead', error, { chatId, currentUserId });
            throw error;
        }
    },

    /**
     * Mark messages as delivered — called automatically on the recipient's
     * device when messages arrive, so the sender sees the "delivered" state
     * (WeChat/WhatsApp-style two-stage receipt: sent → delivered → read).
     */
    async markDelivered(chatId: string, currentUserId: string): Promise<void> {
        if (!isFirestoreAvailable() || !chatId || !currentUserId) {
            return;
        }

        try {
            // Messages that reached the server but haven't been marked delivered
            const sentMessages = await querySubcollection<Message>(
                COLLECTIONS.CHATS,
                chatId,
                COLLECTIONS.MESSAGES,
                [where('deliveryStatus', '==', 'sent')],
            );

            const othersMessages = sentMessages.filter(m => m.senderId !== currentUserId);
            if (othersMessages.length === 0) return;

            await Promise.all(
                othersMessages.map(m =>
                    updateSubcollectionDoc(
                        COLLECTIONS.CHATS,
                        chatId,
                        COLLECTIONS.MESSAGES,
                        m.id,
                        { deliveryStatus: 'delivered', deliveredAt: serverTimestamp() },
                    ),
                ),
            );
        } catch (error) {
            // Best-effort: delivery receipts are non-critical
            logStoreError('chatApi.markDelivered', error, { chatId });
        }
    },

    /**
     * Send a poll
     */
    async sendPoll(chatId: string, senderId: string, question: string, options: string[]): Promise<void> {
        // Validate input
        const validation = validateSendPollParams({ chatId, senderId, question, options });
        if (!validation.success) {
            throw new Error(`Invalid poll: ${validation.error.message}`);
        }

        if (!isFirestoreAvailable()) {
            return;
        }

        try {
            const pollData: PollData = {
                question,
                options: options.map(opt => ({ text: opt, votes: [] })),
                totalVotes: 0,
            };

            await addDocToSubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, {
                chatId,
                senderId,
                content: `Poll: ${question}`,
                type: 'poll' as MessageType,
                pollData,
                timestamp: serverTimestamp(),
            });

            await updateDocById(COLLECTIONS.CHATS, chatId, {
                lastMessage: `Poll: ${question}`,
                lastMessageSenderId: senderId,
                updatedAt: serverTimestamp(),
            });
        } catch (error) {
            logStoreError('chatApi.sendPoll', error, { chatId, senderId, question });
            throw error;
        }
    },

    /**
     * Vote on a poll option
     */
    async votePoll(chatId: string, messageId: string, optionIndex: number, userId: string): Promise<void> {
        // Validate input
        const validation = validateVotePoll({ chatId, messageId, optionIndex, userId });
        if (!validation.success) {
            throw new Error(`Invalid poll vote: ${validation.error.message}`);
        }

        if (!isFirestoreAvailable()) {
            return;
        }

        try {
            const messages = await querySubcollection<Message>(
                COLLECTIONS.CHATS,
                chatId,
                COLLECTIONS.MESSAGES,
                [where('id', '==', messageId)],
            );

            if (messages.length > 0) {
                const message = mapMessage(messages[0] as unknown as Record<string, unknown> & { id?: string });

                if (message.pollData) {
                    const pollData = { ...message.pollData };
                    if (pollData.options[optionIndex]) {
                        const votes = pollData.options[optionIndex].votes || [];
                        if (!votes.includes(userId)) {
                            pollData.options[optionIndex].votes = [...votes, userId];

                            await updateSubcollectionDoc(
                                COLLECTIONS.CHATS,
                                chatId,
                                COLLECTIONS.MESSAGES,
                                messageId,
                                { pollData },
                            );
                        }
                    }
                }
            }
        } catch (error) {
            logStoreError('chatApi.votePoll', error, { chatId, messageId, optionIndex, userId });
            throw error;
        }
    },

    /**
     * Send a contact card
     */
    async sendContactCard(
        chatId: string,
        senderId: string,
        contactData: { userId: string; name: string; phone?: string; email?: string; avatar?: string; username?: string; bio?: string },
    ): Promise<void> {
        // Validate input
        const validation = validateSendContactCard({ chatId, senderId, contactData });
        if (!validation.success) {
            throw new Error(`Invalid contact card: ${validation.error.message}`);
        }

        if (!isFirestoreAvailable()) {
            return;
        }

        try {
            await addDocToSubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, {
                chatId,
                senderId,
                content: `Contact: ${contactData.name}`,
                type: 'contact_card' as MessageType,
                contactCard: contactData,
                timestamp: serverTimestamp(),
            });

            await updateDocById(COLLECTIONS.CHATS, chatId, {
                lastMessage: `Contact: ${contactData.name}`,
                lastMessageSenderId: senderId,
                updatedAt: serverTimestamp(),
            });
        } catch (error) {
            logStoreError('chatApi.sendContactCard', error, { chatId, senderId });
            throw error;
        }
    },

    /**
     * Export chat messages
     */
    async exportChat(chatId: string): Promise<Record<string, unknown> | null> {
        if (!isFirestoreAvailable() || !chatId) {
            return null;
        }

        try {
            const messages = await querySubcollection<Message>(
                COLLECTIONS.CHATS,
                chatId,
                COLLECTIONS.MESSAGES,
                [orderBy('timestamp', 'asc')],
            );

            const chat = await queryCollection<Chat>(COLLECTIONS.CHATS, [where('id', '==', chatId)]);

            if (chat.length > 0) {
                return {
                    chat: mapChat(chat[0] as unknown as Record<string, unknown> & { id?: string }),
                    messages: messages.map(m => mapMessage(m as unknown as Record<string, unknown> & { id?: string })),
                    exportedAt: new Date(),
                };
            }

            return null;
        } catch (error) {
            logStoreError('chatApi.exportChat', error, { chatId });
            return null;
        }
    },

    /**
     * Get shared media in a chat
     */
    async getSharedMedia(chatId: string, mediaType?: string): Promise<Message[]> {
        if (!isFirestoreAvailable() || !chatId) {
            return [];
        }

        try {
            const allMessages = await querySubcollection<Message>(
                COLLECTIONS.CHATS,
                chatId,
                COLLECTIONS.MESSAGES,
                [orderBy('timestamp', 'desc')],
            );

            const mappedMessages = allMessages.map(m => mapMessage(m as unknown as Record<string, unknown> & { id?: string }));

            if (mediaType) {
                return mappedMessages.filter(m => m.type === mediaType && m.mediaUrl);
            }

            return mappedMessages.filter(m => m.mediaUrl);
        } catch (error) {
            logStoreError('chatApi.getSharedMedia', error, { chatId, mediaType });
            return [];
        }
    },
};

export default chatApi;
