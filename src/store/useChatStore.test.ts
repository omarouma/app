import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chat, Message } from '@/types';
import { useChatStore } from './useChatStore';

const { mockQuerySubcollection, mockDeleteSubcollectionDoc, mockQueryCollection, mockUpdateDocById } = vi.hoisted(() => ({
    mockQuerySubcollection: vi.fn(async () => []),
    mockDeleteSubcollectionDoc: vi.fn(async () => undefined),
    mockQueryCollection: vi.fn(async () => []),
    mockUpdateDocById: vi.fn(async () => undefined),
}));

vi.mock('@/lib/firestore', () => ({
    isFirestoreAvailable: () => true,
    COLLECTIONS: {
        CHATS: 'chats',
        MESSAGES: 'messages',
    },
    querySubcollection: mockQuerySubcollection,
    deleteSubcollectionDoc: mockDeleteSubcollectionDoc,
    queryCollection: mockQueryCollection,
    updateDocById: mockUpdateDocById,
    addDocToCollection: vi.fn(async () => 'doc-1'),
    addDocToSubcollection: vi.fn(async () => 'doc-1'),
    subscribeToCollection: vi.fn(() => () => undefined),
    subscribeToSubcollection: vi.fn(() => () => undefined),
    serverTimestamp: vi.fn(() => new Date()),
    where: vi.fn((field, op, value) => ({ field, op, value })),
    orderBy: vi.fn((field, direction) => ({ field, direction })),
    limit: vi.fn((count) => ({ count })),
    startAfter: vi.fn((value) => ({ value })),
}));

vi.mock('@/services/chatApi', () => ({
    chatApi: {},
    mapMessage: (message: any) => message,
    mapChat: (chat: any) => chat,
}));

vi.mock('@/hooks/useMessageRateLimiter', () => ({
    checkMessageRateLimit: () => null,
}));

vi.mock('@/lib/offlineQueue', () => ({
    isOnline: () => true,
    enqueueOfflineMessage: vi.fn(),
}));

vi.mock('@/lib/sanitize', () => ({
    sanitizeText: (value: string) => value,
}));

vi.mock('@/lib/errorLogger', () => ({
    logStoreError: vi.fn(),
}));

describe('useChatStore', () => {
    beforeEach(() => {
        mockQuerySubcollection.mockResolvedValue([]);
        mockDeleteSubcollectionDoc.mockResolvedValue(undefined);

        useChatStore.setState({
            chats: [] as Chat[],
            archivedChats: [] as Chat[],
            messages: {} as Record<string, Message[]>,
            loadingChats: true,
            hasMore: {},
            totalUnread: 0,
            pendingMessageIds: [],
            lastSendError: undefined,
        });
    });

    it('starts with an empty in-memory store', () => {
        const state = useChatStore.getState();
        expect(state.chats).toEqual([]);
        expect(state.messages).toEqual({});
        expect(state.pendingMessageIds).toEqual([]);
        expect(state.totalUnread).toBe(0);
    });

    it('adds a message to a chat bucket', () => {
        const message: Message = {
            id: 'msg-1',
            chatId: 'chat-1',
            senderId: 'user-1',
            content: 'Hello',
            type: 'text',
            timestamp: new Date(),
        };

        useChatStore.getState().addMessage(message);

        const state = useChatStore.getState();
        expect(state.messages['chat-1']).toHaveLength(1);
        expect(state.messages['chat-1'][0].id).toBe('msg-1');
    });

    it('deduplicates a message when a localId already exists', () => {
        useChatStore.getState().addMessage({
            id: 'temp-1',
            chatId: 'chat-1',
            senderId: 'user-1',
            content: 'Hello',
            type: 'text',
            timestamp: new Date(),
            localId: 'local-123',
            deliveryStatus: 'sending',
        });

        useChatStore.getState().addMessage({
            id: 'server-1',
            chatId: 'chat-1',
            senderId: 'user-1',
            content: 'Hello',
            type: 'text',
            timestamp: new Date(),
            localId: 'local-123',
            deliveryStatus: 'sent',
        });

        const messages = useChatStore.getState().messages['chat-1'];
        expect(messages).toHaveLength(1);
        expect(messages[0].id).toBe('server-1');
        expect(messages[0].deliveryStatus).toBe('sent');
    });

    it('keeps messages isolated to their chat', () => {
        useChatStore.getState().addMessage({
            id: 'msg-1',
            chatId: 'chat-1',
            senderId: 'user-1',
            content: 'Chat 1 message',
            type: 'text',
            timestamp: new Date(),
        });

        useChatStore.getState().addMessage({
            id: 'msg-2',
            chatId: 'chat-2',
            senderId: 'user-1',
            content: 'Chat 2 message',
            type: 'text',
            timestamp: new Date(),
        });

        expect(useChatStore.getState().messages['chat-1']).toHaveLength(1);
        expect(useChatStore.getState().messages['chat-2']).toHaveLength(1);
        expect(useChatStore.getState().messages['chat-1'][0].content).toBe('Chat 1 message');
        expect(useChatStore.getState().messages['chat-2'][0].content).toBe('Chat 2 message');
    });

    it('clears messages for one chat without mutating other chats', async () => {
        useChatStore.getState().addMessage({
            id: 'msg-1',
            chatId: 'chat-1',
            senderId: 'user-1',
            content: 'Message 1',
            type: 'text',
            timestamp: new Date(),
        });

        useChatStore.getState().addMessage({
            id: 'msg-2',
            chatId: 'chat-2',
            senderId: 'user-1',
            content: 'Message 2',
            type: 'text',
            timestamp: new Date(),
        });

        await useChatStore.getState().clearChat('chat-1');

        expect(useChatStore.getState().messages['chat-1']).toEqual([]);
        expect(useChatStore.getState().messages['chat-2']).toHaveLength(1);
    });

    it('queues a message optimistically when sending', async () => {
        const result = await useChatStore.getState().sendMessage('chat-1', 'user-1', 'New message');

        expect(result.success).toBe(true);
        expect(result.id).toBeTruthy();
        expect(useChatStore.getState().messages['chat-1']).toHaveLength(1);
        expect(useChatStore.getState().messages['chat-1'][0].content).toBe('New message');
    });

    it('clears a temporary ID after the message is successfully sent', async () => {
        const result = await useChatStore.getState().sendMessage('chat-1', 'user-1', 'Pending');

        expect(result.success).toBe(true);
        expect(result.id).toBeTruthy();
        expect(useChatStore.getState().pendingMessageIds).toEqual([]);
    });

    it('fetchChats stores active chats and unread totals', async () => {
        mockQueryCollection.mockResolvedValueOnce([
            { id: 'chat-1', participants: ['user-1', 'user-2'], archived: false, unreadCount: 3 },
            { id: 'chat-2', participants: ['user-1', 'user-3'], archived: true, unreadCount: 7 },
        ] as any);

        await useChatStore.getState().fetchChats('user-1');

        const state = useChatStore.getState();
        expect(state.chats).toHaveLength(1);
        expect(state.archivedChats).toHaveLength(1);
        expect(state.totalUnread).toBe(3);
    });
});
