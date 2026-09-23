/**
 * Call events as first-class chat timeline items.
 *
 * A single call session (one `call_history` row) maps to exactly ONE chat
 * timeline item. The item is inserted when the call starts and UPDATED — never
 * re-inserted — as the call progresses. This guarantees the acceptance rule:
 *
 *   one callSessionId → one logical call-history record → one chat timeline item
 *
 * Idempotency is enforced two ways:
 *   1. A lookup by `call_session_id` before insert (fast path).
 *   2. A partial unique index `messages_chat_call_session_uq` on
 *      (chat_id, call_session_id) that collapses any concurrent duplicate.
 */
import {
  COLLECTIONS,
  addDocToSubcollectionIdempotent,
  querySubcollection,
  updateSubcollectionDoc,
  updateDocById,
  getDocById,
  setDocById,
  serverTimestamp,
  isFirestoreAvailable,
  where,
} from '@/lib/firestore';
import type { CallEventData } from '@/types';

/** Deterministic direct-chat id shared by both participants. */
export function directChatIdFor(a: string, b: string): string {
  const participants = [a, b].sort((x, y) => x.localeCompare(y));
  return `dm_${participants.join('_')}`;
}

/** Human-readable fallback text stored on the message row. */
export function callEventPreview(
  callType: 'voice' | 'video',
  status: CallEventData['status'],
): string {
  const kind = callType === 'video' ? 'Video call' : 'Voice call';
  switch (status) {
    case 'missed':
      return `Missed ${kind.toLowerCase()}`;
    case 'declined':
      return `Declined ${kind.toLowerCase()}`;
    case 'cancelled':
      return `Cancelled ${kind.toLowerCase()}`;
    case 'busy':
      return `${kind} — busy`;
    case 'failed':
      return `${kind} failed`;
    default:
      return kind;
  }
}

export interface UpsertCallEventParams {
  callSessionId: string;
  callerId: string;
  calleeId: string;
  callType: 'voice' | 'video';
  status: CallEventData['status'];
  duration?: number;
  endedReason?: string;
}

/** Make sure the deterministic direct chat row exists before writing messages. */
async function ensureDirectChat(chatId: string, a: string, b: string): Promise<void> {
  const existing = await getDocById(COLLECTIONS.CHATS, chatId);
  if (existing) return;
  await setDocById(COLLECTIONS.CHATS, chatId, {
    type: 'direct',
    participants: [a, b],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    unreadCount: 0,
  });
}

/**
 * Upsert exactly ONE call-event message per callSessionId into the direct chat
 * timeline between caller and callee. Best-effort: never throws into the call
 * lifecycle.
 */
export async function upsertCallEventMessage(params: UpsertCallEventParams): Promise<void> {
  if (!isFirestoreAvailable()) return;
  const { callSessionId, callerId, calleeId, callType, status, duration, endedReason } = params;
  if (!callSessionId || !callerId || !calleeId) return;

  const chatId = directChatIdFor(callerId, calleeId);
  const callData: CallEventData = {
    callSessionId,
    callType,
    status,
    duration: typeof duration === 'number' && Number.isFinite(duration) ? duration : undefined,
    endedReason,
    callerId,
    calleeId,
  };
  const preview = callEventPreview(callType, status);

  try {
    await ensureDirectChat(chatId, callerId, calleeId);

    // Fast path: is there already a timeline item for this call session?
    const existing = await querySubcollection<{ id: string }>(
      COLLECTIONS.CHATS,
      chatId,
      COLLECTIONS.MESSAGES,
      [where('callSessionId', '==', callSessionId)],
    );

    if (existing.length > 0) {
      await updateSubcollectionDoc(
        COLLECTIONS.CHATS,
        chatId,
        COLLECTIONS.MESSAGES,
        existing[0].id,
        { callData, content: preview, updatedAt: serverTimestamp() },
      );
    } else {
      await addDocToSubcollectionIdempotent(
        COLLECTIONS.CHATS,
        chatId,
        COLLECTIONS.MESSAGES,
        {
          chatId,
          senderId: callerId,
          content: preview,
          type: 'call',
          callSessionId,
          callData,
          timestamp: serverTimestamp(),
          localId: `call_${callSessionId}`,
          deliveryStatus: 'sent',
        },
        ['chat_id', 'call_session_id'],
      );
    }

    // Keep the conversation list preview in sync.
    await updateDocById(COLLECTIONS.CHATS, chatId, {
      lastMessage: preview,
      lastMessageSenderId: callerId,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // best-effort: a call-event write must never break the call itself
  }
}
