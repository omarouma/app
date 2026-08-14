/**
 * Zod Validation Schemas for Chat API
 *
 * These schemas provide runtime type safety and validation for all data
 * crossing the API boundary. They catch invalid/malicious input early
 * and provide clear error messages for debugging.
 */

import { z } from 'zod';

// ============================================================
// Primitive Schemas
// ============================================================

export const MessageTypeSchema = z.enum([
    'text',
    'image',
    'video',
    'voice',
    'file',
    'sticker',
    'poll',
    'system',
    'money_transfer',
    'location',
    'deleted',
    'contact_card',
    'broadcast',
]);

export const DeliveryStatusSchema = z.enum([
    'pending',
    'sending',
    'sent',
    'delivered',
    'read',
    'failed',
]);

export const ChatTypeSchema = z.enum(['direct', 'group']);

export const CurrencySchema = z.enum(['coins', 'USD', 'BDT', 'RMB', 'INR']);

export const LockTypeSchema = z.enum(['pin', 'biometric']);

// ============================================================
// Message & Related Schemas
// ============================================================

export const PollOptionSchema = z.object({
    text: z.string().min(1).max(200),
    votes: z.array(z.string()).default([]),
});

export const PollDataSchema = z.object({
    question: z.string().min(1).max(500),
    options: z.array(PollOptionSchema).min(2).max(10),
    votes: z.record(z.string(), z.array(z.string())).optional(),
    totalVotes: z.number().int().min(0).default(0),
});

export const TransferDataSchema = z.object({
    amount: z.number().positive(),
    currency: CurrencySchema,
    fromUserId: z.string().min(1),
    toUserId: z.string().min(1),
    status: z.enum(['pending', 'completed', 'failed']),
    note: z.string().max(500).optional(),
});

export const ContactCardDataSchema = z.object({
    userId: z.string().min(1),
    name: z.string().min(1).max(100),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    avatar: z.string().url().optional(),
    username: z.string().optional(),
    bio: z.string().max(500).optional(),
});

export const PinnedMessageSchema = z.object({
    messageId: z.string().min(1),
    text: z.string().max(200),
    pinnedBy: z.string().min(1),
    pinnedAt: z.string().or(z.date()),
});

export const MessageSchema = z.object({
    id: z.string().min(1),
    chatId: z.string().min(1),
    senderId: z.string().min(1),
    content: z.string(),
    type: MessageTypeSchema,
    mediaUrl: z.string().optional(),
    timestamp: z.date(),
    read: z.boolean().default(false),
    edited: z.boolean().default(false),
    replyTo: z.string().optional(),
    reactions: z.record(z.string(), z.array(z.string())).default({}),
    forwardedFrom: z.string().optional(),
    pollData: PollDataSchema.optional(),
    transferData: TransferDataSchema.optional(),
    contactCard: ContactCardDataSchema.optional(),
    disappearingTimer: z.number().int().min(0).default(0),
    disappearingInitiatedAt: z.date().optional(),
    destroyed: z.boolean().default(false),
    deliveryStatus: DeliveryStatusSchema.optional(),
    deliveredAt: z.date().optional(),
    readAt: z.date().optional(),
    retryCount: z.number().int().min(0).optional(),
    localId: z.string().optional(),
});

// ============================================================
// Chat Schemas
// ============================================================

export const ChatSchema = z.object({
    id: z.string().min(1),
    type: ChatTypeSchema,
    participants: z.array(z.string().min(1)).min(1),
    name: z.string().max(200).optional(),
    avatar: z.string().url().optional(),
    lastMessage: z.string().optional(),
    lastMessageSenderId: z.string().optional(),
    lastMessageRead: z.boolean().optional(),
    updatedAt: z.string().or(z.date()).optional(),
    unreadCount: z.number().int().min(0).default(0),
    isMuted: z.boolean().default(false),
    admins: z.array(z.string().min(1)).default([]),
    createdBy: z.string().optional(),
    archived: z.boolean().default(false),
    pinned: z.boolean().default(false),
    pinnedMessages: z.array(PinnedMessageSchema).default([]),
    description: z.string().max(500).optional(),
    disappearingMessages: z.number().int().min(0).default(0),
    chatLocked: z.boolean().default(false),
    lockType: LockTypeSchema.optional(),
    lockValue: z.string().optional(),
});

// ============================================================
// API Request/Response Schemas
// ============================================================

export const SendMessageParamsSchema = z.object({
    chatId: z.string().min(1),
    senderId: z.string().min(1),
    content: z.string().min(1).max(4096),
    type: MessageTypeSchema.default('text'),
    mediaUrl: z.string().url().optional(),
    replyTo: z.string().or(MessageSchema).optional(),
});

export const SendMessageResultSchema = z.object({
    success: z.boolean(),
    id: z.string(),
    error: z.string().optional(),
});

export const VotePollParamsSchema = z.object({
    chatId: z.string().min(1),
    messageId: z.string().min(1),
    optionIndex: z.number().int().min(0),
    userId: z.string().min(1),
});

export const ReactionParamsSchema = z.object({
    chatId: z.string().min(1),
    messageId: z.string().min(1),
    emoji: z.string().min(1).max(10),
    userId: z.string().min(1),
});

export const PinMessageParamsSchema = z.object({
    chatId: z.string().min(1),
    messageId: z.string().min(1),
    content: z.string().max(200),
});

export const CreateDirectChatParamsSchema = z.object({
    userId: z.string().min(1),
    currentUserId: z.string().min(1),
});

export const UpdateChatParamsSchema = z.object({
    chatId: z.string().min(1),
    data: ChatSchema.partial(),
});

export const SendContactCardParamsSchema = z.object({
    chatId: z.string().min(1),
    senderId: z.string().min(1),
    contactData: ContactCardDataSchema,
});

export const SendPollParamsSchema = z.object({
    chatId: z.string().min(1),
    senderId: z.string().min(1),
    question: z.string().min(1).max(500),
    options: z.array(z.string().min(1).max(200)).min(2).max(10),
});

/**
 * Safely parse poll creation params.
 */
export function validateSendPollParams(input: unknown) {
    return SendPollParamsSchema.safeParse(input);
}

// ============================================================
// Safe Parse Wrappers
// ============================================================

/**
 * Safely parse and validate a SendMessageParams input.
 * Returns { success, data, error } tuple.
 */
export function validateSendMessageParams(input: unknown) {
    return SendMessageParamsSchema.safeParse(input);
}

/**
 * Safely parse and validate a Message.
 */
export function validateMessage(input: unknown) {
    return MessageSchema.safeParse(input);
}

/**
 * Safely parse and validate a Chat.
 */
export function validateChat(input: unknown) {
    return ChatSchema.safeParse(input);
}

/**
 * Safely parse and validate poll voting.
 */
export function validateVotePoll(input: unknown) {
    return VotePollParamsSchema.safeParse(input);
}

/**
 * Safely parse and validate contact card send.
 */
export function validateSendContactCard(input: unknown) {
    return SendContactCardParamsSchema.safeParse(input);
}
