import { describe, expect, it } from 'vitest';
import {
    validateSendMessageParams,
    validateMessage,
    validateChat,
} from './validation';

describe('validation schemas', () => {
    describe('validateSendMessageParams', () => {
        it('accepts valid message parameters', () => {
            const result = validateSendMessageParams({
                chatId: 'chat-1',
                senderId: 'user-1',
                content: 'Hello world',
                type: 'text',
            });

            expect(result.success).toBe(true);
        });

        it('rejects empty content', () => {
            const result = validateSendMessageParams({
                chatId: 'chat-1',
                senderId: 'user-1',
                content: '',
            });

            expect(result.success).toBe(false);
        });

        it('rejects missing chatId', () => {
            const result = validateSendMessageParams({
                chatId: '',
                senderId: 'user-1',
                content: 'Hello',
            });

            expect(result.success).toBe(false);
        });

        it('rejects missing senderId', () => {
            const result = validateSendMessageParams({
                chatId: 'chat-1',
                senderId: '',
                content: 'Hello',
            });

            expect(result.success).toBe(false);
        });

        it('accepts mediaUrl when provided', () => {
            const result = validateSendMessageParams({
                chatId: 'chat-1',
                senderId: 'user-1',
                content: 'Check this out',
                type: 'image',
                mediaUrl: 'https://example.com/image.jpg',
            });

            expect(result.success).toBe(true);
        });

        it('accepts replyTo message ID', () => {
            const result = validateSendMessageParams({
                chatId: 'chat-1',
                senderId: 'user-1',
                content: 'Reply',
                replyTo: 'msg-previous',
            });

            expect(result.success).toBe(true);
        });
    });

    describe('validateMessage', () => {
        it('accepts valid message object', () => {
            const result = validateMessage({
                id: 'msg-1',
                chatId: 'chat-1',
                senderId: 'user-1',
                content: 'Hello',
                type: 'text',
                timestamp: new Date(),
            });

            expect(result.success).toBe(true);
        });

        it('rejects message without required fields', () => {
            const result = validateMessage({
                id: 'msg-1',
            });

            expect(result.success).toBe(false);
        });

        it('accepts message with reactions', () => {
            const result = validateMessage({
                id: 'msg-1',
                chatId: 'chat-1',
                senderId: 'user-1',
                content: 'Hello',
                type: 'text',
                timestamp: new Date(),
                reactions: { '👍': ['user-2', 'user-3'] },
            });

            expect(result.success).toBe(true);
        });

        it('accepts message with pollData', () => {
            const result = validateMessage({
                id: 'msg-1',
                chatId: 'chat-1',
                senderId: 'user-1',
                content: 'Poll question?',
                type: 'poll',
                timestamp: new Date(),
                pollData: {
                    question: 'What color?',
                    options: [{ text: 'Red', votes: [] }, { text: 'Blue', votes: [] }],
                    totalVotes: 0,
                },
            });

            expect(result.success).toBe(true);
        });
    });

    describe('validateChat', () => {
        it('accepts valid chat object', () => {
            const result = validateChat({
                id: 'chat-1',
                type: 'direct',
                participants: ['user-1', 'user-2'],
            });

            expect(result.success).toBe(true);
        });

        it('rejects chat without participants', () => {
            const result = validateChat({
                id: 'chat-1',
                type: 'direct',
                participants: [],
            });

            expect(result.success).toBe(false);
        });

        it('accepts group chat with metadata', () => {
            const result = validateChat({
                id: 'chat-1',
                type: 'group',
                participants: ['user-1', 'user-2', 'user-3'],
                name: 'Team Discussion',
                description: 'Our team chat',
            });

            expect(result.success).toBe(true);
        });
    });
});
