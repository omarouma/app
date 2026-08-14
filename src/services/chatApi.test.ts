import { beforeEach, describe, expect, it, vi } from 'vitest';

const { addDocToSubcollectionMock, updateDocByIdMock, isFirestoreAvailableMock } = vi.hoisted(() => ({
    addDocToSubcollectionMock: vi.fn(),
    updateDocByIdMock: vi.fn(),
    isFirestoreAvailableMock: vi.fn(() => true),
}));

vi.mock('@/lib/firestore', () => ({
    isFirestoreAvailable: isFirestoreAvailableMock,
    COLLECTIONS: {
        CHATS: 'chats',
        MESSAGES: 'messages',
    },
    updateDocById: updateDocByIdMock,
    addDocToCollection: vi.fn(),
    addDocToSubcollection: addDocToSubcollectionMock,
    queryCollection: vi.fn(),
    querySubcollection: vi.fn(),
    updateSubcollectionDoc: vi.fn(),
    deleteSubcollectionDoc: vi.fn(),
    subscribeToCollection: vi.fn(),
    subscribeToSubcollection: vi.fn(),
    serverTimestamp: () => 'server-timestamp',
    where: (...args: unknown[]) => args,
    orderBy: (...args: unknown[]) => args,
    limit: (...args: unknown[]) => args,
    startAfter: (...args: unknown[]) => args,
}));

vi.mock('@/hooks/useMessageRateLimiter', () => ({
    checkMessageRateLimit: () => null,
}));

vi.mock('@/lib/offlineQueue', () => ({
    isOnline: () => true,
}));

vi.mock('@/lib/sanitize', () => ({
    sanitizeText: (value: string) => value,
}));

vi.mock('@/lib/errorLogger', () => ({
    logStoreError: vi.fn(),
}));

vi.mock('uuid', () => ({
    v4: () => 'local-uuid-123',
}));

import { chatApi, mapChat, mapMessage } from './chatApi';
import { useChatStore } from '@/store/useChatStore';

describe('chatApi mapping', () => {
    it('maps a Firestore message row into a typed app message', () => {
        const createdAt = new Date('2024-01-02T03:04:05.000Z');

        const message = mapMessage({
            id: 'msg-1',
            chatId: 'chat-1',
            senderId: 'user-1',
            content: 'hello',
            type: 'text',
            timestamp: { toDate: () => createdAt },
            read: true,
            edited: true,
            replyTo: 'msg-0',
            reactions: { '👍': ['user-1'] },
            pollData: { question: 'Q?', options: [{ text: 'A', votes: ['user-1'] }], totalVotes: 1 },
            contactCard: {
                userId: 'user-2',
                name: 'Jane Doe',
                username: 'janedoe',
            },
            deliveryStatus: 'read',
            retryCount: 2,
            localId: 'local-456',
        } as any);

        expect(message.id).toBe('msg-1');
        expect(message.chatId).toBe('chat-1');
        expect(message.senderId).toBe('user-1');
        expect(message.content).toBe('hello');
        expect(message.type).toBe('text');
        expect(message.timestamp).toEqual(createdAt);
        expect(message.read).toBe(true);
        expect(message.replyTo).toBe('msg-0');
        expect(message.reactions).toEqual({ '👍': ['user-1'] });
        expect(message.contactCard?.name).toBe('Jane Doe');
        expect(message.localId).toBe('local-456');
        expect(message.deliveryStatus).toBe('read');
        expect(message.retryCount).toBe(2);
    });

    it('maps chat metadata with pinned messages and archived state', () => {
        const chat = mapChat({
            id: 'chat-1',
            type: 'group',
            participants: ['u1', 'u2'],
            name: 'Team chat',
            archived: true,
            pinned: true,
            pinnedMessages: [{ messageId: 'msg-1', text: 'Pinned update', pinnedBy: 'u1', pinnedAt: '2024-01-02T03:04:05.000Z' }],
            unreadCount: 3,
        } as any);

        expect(chat.id).toBe('chat-1');
        expect(chat.type).toBe('group');
        expect(chat.archived).toBe(true);
        expect(chat.pinned).toBe(true);
        expect(chat.pinnedMessages).toHaveLength(1);
        expect(chat.pinnedMessages?.[0].messageId).toBe('msg-1');
        expect(chat.unreadCount).toBe(3);
    });
});

describe('chatApi.sendContactCard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        addDocToSubcollectionMock.mockResolvedValue('server-doc-id');
    });

    it('uses the contact_card message type expected by the UI', async () => {
        await chatApi.sendContactCard('chat-1', 'user-1', {
            userId: 'user-2',
            name: 'Jane Doe',
            username: 'janedoe',
            phone: '+123456789',
        });

        expect(addDocToSubcollectionMock).toHaveBeenCalledWith(
            'chats',
            'chat-1',
            'messages',
            expect.objectContaining({
                chatId: 'chat-1',
                senderId: 'user-1',
                type: 'contact_card',
                contactCard: expect.objectContaining({ userId: 'user-2', name: 'Jane Doe' }),
            }),
        );
    });
});

describe('chatApi.sendMessage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        addDocToSubcollectionMock.mockResolvedValue('server-doc-id');
        useChatStore.setState({ messages: {}, pendingMessageIds: [] });
    });

    it('creates a message doc with a local UUID and marks it sent', async () => {
        const result = await chatApi.sendMessage({
            chatId: 'chat-1',
            senderId: 'user-1',
            content: 'Hello there',
        });

        expect(result).toEqual({ success: true, id: 'server-doc-id' });
        expect(addDocToSubcollectionMock).toHaveBeenCalledWith(
            'chats',
            'chat-1',
            'messages',
            expect.objectContaining({
                chatId: 'chat-1',
                senderId: 'user-1',
                content: 'Hello there',
                localId: 'local-uuid-123',
                deliveryStatus: 'sent',
            }),
        );
        expect(updateDocByIdMock).toHaveBeenCalledWith(
            'chats',
            'chat-1',
            expect.objectContaining({
                lastMessage: 'Hello there',
                lastMessageSenderId: 'user-1',
            }),
        );
    });

    it('rejects message with empty content', async () => {
        const result = await chatApi.sendMessage({
            chatId: 'chat-1',
            senderId: 'user-1',
            content: '',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Validation failed');
        expect(addDocToSubcollectionMock).not.toHaveBeenCalled();
    });

    it('includes reply reference when provided', async () => {
        await chatApi.sendMessage({
            chatId: 'chat-1',
            senderId: 'user-1',
            content: 'Reply to that',
            replyTo: 'msg-previous',
        });

        expect(addDocToSubcollectionMock).toHaveBeenCalledWith(
            'chats',
            'chat-1',
            'messages',
            expect.objectContaining({ replyTo: 'msg-previous' }),
        );
    });

    it('includes mediaUrl when sending media message', async () => {
        await chatApi.sendMessage({
            chatId: 'chat-1',
            senderId: 'user-1',
            content: 'Image caption',
            type: 'image',
            mediaUrl: 'https://example.com/image.jpg',
        });

        expect(addDocToSubcollectionMock).toHaveBeenCalledWith(
            'chats',
            'chat-1',
            'messages',
            expect.objectContaining({
                type: 'image',
                mediaUrl: 'https://example.com/image.jpg',
            }),
        );
    });

    it('deduplicates optimistic messages by localId when the server confirms the same send', () => {
        useChatStore.getState().addMessage({
            id: 'temp-1',
            chatId: 'chat-1',
            senderId: 'user-1',
            content: 'Hello',
            type: 'text',
            timestamp: new Date(),
            deliveryStatus: 'sending',
            localId: 'temp-1',
        });

        useChatStore.getState().addMessage({
            id: 'server-1',
            chatId: 'chat-1',
            senderId: 'user-1',
            content: 'Hello',
            type: 'text',
            timestamp: new Date(),
            deliveryStatus: 'sent',
            localId: 'temp-1',
        });

        expect(useChatStore.getState().messages['chat-1']).toHaveLength(1);
        expect(useChatStore.getState().messages['chat-1'][0]).toMatchObject({
            id: 'server-1',
            localId: 'temp-1',
            deliveryStatus: 'sent',
        });
    });

    it('handles Firestore unavailable gracefully', async () => {
        isFirestoreAvailableMock.mockReturnValueOnce(false);

        const result = await chatApi.sendMessage({
            chatId: 'chat-1',
            senderId: 'user-1',
            content: 'Hello',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Firestore unavailable');
    });
});

describe('chatApi.sendPoll', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        addDocToSubcollectionMock.mockResolvedValue('poll-msg-id');
    });

    it('creates poll message with options', async () => {
        await chatApi.sendPoll('chat-1', 'user-1', 'Favorite color?', ['Red', 'Blue', 'Green']);

        expect(addDocToSubcollectionMock).toHaveBeenCalledWith(
            'chats',
            'chat-1',
            'messages',
            expect.objectContaining({
                type: 'poll',
                pollData: expect.objectContaining({
                    question: 'Favorite color?',
                    options: expect.arrayContaining([
                        expect.objectContaining({ text: 'Red' }),
                        expect.objectContaining({ text: 'Blue' }),
                        expect.objectContaining({ text: 'Green' }),
                    ]),
                }),
            }),
        );
    });
});

describe('chatApi.markAsRead', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('marks all unread messages as read for current user', async () => {
        const { querySubcollection } = await import('@/lib/firestore');
        vi.mocked(querySubcollection).mockResolvedValueOnce([{
            id: 'msg-1',
            senderId: 'user-2',
            deliveryStatus: 'sent',
        }, {
            id: 'msg-2',
            senderId: 'user-3',
            deliveryStatus: 'sent',
        }] as any);

        await chatApi.markAsRead('chat-1', 'user-1');

        expect(updateDocByIdMock).toHaveBeenCalledWith(
            'chats',
            'chat-1',
            expect.objectContaining({ unreadCount: 0 }),
        );
    });
});
