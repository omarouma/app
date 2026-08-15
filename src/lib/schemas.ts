/**
 * Validation Schemas using Zod
 * Provides runtime validation for critical data flows
 */

import { z } from 'zod';

/**
 * Message validation schema
 * Ensures messages are properly formatted and safe to send
 */
export const MessageSchema = z.object({
  content: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(5000, 'Message is too long (max 5000 characters)')
    .transform((v) => v.trim()),
  type: z
    .enum(['text', 'voice', 'image', 'video', 'file', 'location', 'contact'])
    .default('text'),
  replyTo: z.string().optional(),
  mediaUrl: z.string().url('Invalid media URL').optional(),
  senderId: z.string().min(1, 'Sender ID is required'),
  timestamp: z.date().optional().default(() => new Date()),
});

export type Message = z.infer<typeof MessageSchema>;

/**
 * Call navigation state validation
 * Ensures all required call parameters are present before initiating call
 */
export const CallNavigationStateSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  mode: z.enum(['voice', 'video']).optional(),
  callType: z.enum(['voice', 'video']).optional(),
  isOutgoing: z.boolean().optional().default(false),
  displayName: z.string().optional(),
  avatar: z.string().url().optional(),
});

export type CallNavigationState = z.infer<typeof CallNavigationStateSchema>;

/**
 * Phone contact schema
 * Validates contacts imported from phone
 */
export const PhoneContactSchema = z.object({
  id: z.string(),
  name: z
    .string()
    .min(1, 'Contact name is required')
    .max(100, 'Name is too long')
    .transform((v) => v.trim()),
  email: z.string().email().optional(),
  phone: z
    .string()
    .regex(/^[0-9+\-\s()]*$/, 'Invalid phone number format')
    .optional(),
  avatar: z.string().url().optional(),
});

export type PhoneContact = z.infer<typeof PhoneContactSchema>;

/**
 * GaGa Chat user profile from Firestore
 * Validates user data structure
 */
export const UserProfileSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  avatar: z.string().url().optional(),
  status: z.enum(['online', 'away', 'offline']).default('offline'),
  lastSeen: z.date().optional(),
  bio: z.string().max(500).optional(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

/**
 * Notification filter state validation
 * Ensures notification filters are properly structured
 */
export const NotificationFilterSchema = z.object({
  type: z
    .enum([
      'all',
      'message',
      'call',
      'reaction',
      'mention',
      'group_invite',
      'friend_request',
      'money_received',
      'group_call',
      'post_like',
      'comment',
      'friend_removed',
      'blocked_interaction',
    ])
    .default('all'),
  selectedIds: z.array(z.string()).default([]),
  searchQuery: z.string().max(100).default(''),
});

export type NotificationFilter = z.infer<typeof NotificationFilterSchema>;

/**
 * Group chat creation schema
 * Validates group chat parameters
 */
export const GroupChatSchema = z.object({
  name: z.string().min(1, 'Group name is required').max(100),
  description: z.string().max(500).optional(),
  members: z.array(z.string().min(1)).min(2, 'At least 2 members required'),
  avatar: z.string().url().optional(),
  isPrivate: z.boolean().default(false),
});

export type GroupChat = z.infer<typeof GroupChatSchema>;

/**
 * API response validation
 * Validates Firestore query results
 */
export const FirestoreDocSchema = z.object({
  id: z.string(),
  data: z.record(z.string(), z.unknown()),
  timestamp: z.date().optional(),
});

/**
 * Validates array of Firestore documents
 */
export const FirestoreCollectionSchema = z.array(FirestoreDocSchema);

/**
 * Safe validation function with error handling
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @param throwOnError - Whether to throw or return null on validation failure
 * @returns Validated data or null on error
 */
export function validateData<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  throwOnError = false
): T | null {
  try {
    return schema.parse(data);
  } catch (err) {
    if (throwOnError) {
      if (err instanceof z.ZodError) {
        const message = err.issues
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', ');
        throw new Error(`Validation error: ${message}`);
      }
      throw err;
    }
    console.warn('Validation error:', err);
    return null;
  }
}

/**
 * Validates and parses message input
 * @param input - Raw input data
 * @returns Validated message or throws error
 */
export function validateMessage(input: unknown): Message {
  const result = MessageSchema.safeParse(input);
  if (!result.success) {
    const firstError = result.error.issues[0];
    throw new Error(firstError.message);
  }
  return result.data;
}

/**
 * Validates navigation state for call pages
 * @param input - Raw navigation state
 * @returns Validated call state or null
 */
export function validateCallNavigationState(input: unknown): CallNavigationState | null {
  return validateData(CallNavigationStateSchema, input);
}

/**
 * Validates phone contact
 * @param input - Raw contact data
 * @returns Validated contact or throws error
 */
export function validatePhoneContact(input: unknown): PhoneContact {
  return PhoneContactSchema.parse(input);
}

/**
 * Batch validates multiple phone contacts
 * @param inputs - Array of raw contact data
 * @returns Array of validated contacts, filtering out invalid ones
 */
export function validatePhoneContacts(inputs: unknown[]): PhoneContact[] {
  return inputs
    .map((input) => validateData(PhoneContactSchema, input))
    .filter((contact) => contact !== null) as PhoneContact[];
}

/**
 * Validates user profile
 * @param input - Raw profile data
 * @returns Validated profile or null
 */
export function validateUserProfile(input: unknown): UserProfile | null {
  return validateData(UserProfileSchema, input);
}
