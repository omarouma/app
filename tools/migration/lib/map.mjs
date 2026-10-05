// Supabase row -> Firestore record mapping.
//
// The output shape is the transport-neutral NDJSON contract shared by every
// tool: `export-supabase` writes it, `import-firestore` reads it, and
// `export-firestore` reproduces it so `reconcile` can diff the two stores
// field-for-field. Timestamps are always epoch millis in NDJSON and are turned
// into Firestore Timestamps only at the import boundary.
import { asArray, asString, compact, toMillis } from './util.mjs';

const DM_TYPES = new Set(['dm', 'direct', 'private', '1:1', 'one_to_one', 'single']);
const GROUP_TYPES = new Set(['group', 'channel', 'room']);
const SAVED_TYPES = new Set(['saved', 'self', 'notes', 'personal']);

export function normaliseChatType(value) {
  const type = String(value ?? '').toLowerCase();
  if (SAVED_TYPES.has(type)) return 'saved';
  if (GROUP_TYPES.has(type)) return 'group';
  if (DM_TYPES.has(type)) return 'dm';
  return 'dm';
}

export function normaliseMessageType(value) {
  const type = String(value ?? '').toLowerCase();
  if (!type) return 'text';
  if (type === 'audio') return 'voice';
  return type;
}

/** Supabase `chats` row -> `chats/{id}` document. */
export function toConversation(row) {
  const participants = asArray(row.participants).map(String).filter(Boolean);
  const updated = toMillis(row.updated_at ?? row.created_at);
  return {
    id: String(row.id),
    data: compact({
      type: normaliseChatType(row.type),
      title: row.name ?? row.title ?? null,
      photoUrl: row.avatar ?? row.photo_url ?? null,
      description: row.description ?? null,
      createdBy: row.created_by ?? null,
      createdAt: toMillis(row.created_at),
      lastMessageAt: updated,
      lastMessagePreview: row.last_message ?? null,
      lastMessageSenderId: row.last_message_sender_id ?? null,
      participants,
      memberCount: participants.length,
    }),
  };
}

/** Supabase `chats` row -> one `chats/{id}/members/{uid}` document per participant. */
export function toMembers(row) {
  const participants = asArray(row.participants).map(String).filter(Boolean);
  const admins = new Set(asArray(row.admins).map(String));
  const createdBy = row.created_by ? String(row.created_by) : null;
  const joinedAt = toMillis(row.created_at);
  const notificationPref = row.is_muted === true ? 'none' : 'all';
  return participants.map(userId => ({
    chatId: String(row.id),
    userId,
    data: compact({
      role: userId === createdBy ? 'owner' : admins.has(userId) ? 'admin' : 'member',
      joinedAt,
      notificationPref,
      archived: row.archived === true,
      pinned: row.pinned === true,
    }),
  }));
}

/** Supabase `messages` row -> `chats/{chatId}/messages/{id}` document. */
export function toMessage(row) {
  const created = toMillis(row.created_at);
  const updated = toMillis(row.updated_at);
  const edited = updated !== null && created !== null && updated !== created ? updated : null;
  return {
    id: String(row.id),
    chatId: String(row.chat_id),
    data: compact({
      senderId: asString(row.sender_id),
      type: normaliseMessageType(row.type),
      text: row.content ?? null,
      clientMessageId: row.local_id ?? null,
      serverTs: created,
      clientTs: created,
      replyToId: row.reply_to ?? null,
      forwardedFrom: row.forwarded_from ?? null,
      status: row.delivery_status ?? null,
      editedAt: edited,
      deletedAt: row.destroyed === true ? (updated ?? created) : null,
      reactions: toReactions(row),
    }),
  };
}

/** Supabase `reactions` JSON map (emoji -> [uids]) -> `[{uid, emoji}]`. */
export function toReactions(row) {
  const reactions = row.reactions;
  if (!reactions || typeof reactions !== 'object') return [];
  const out = [];
  for (const [emoji, users] of Object.entries(reactions)) {
    for (const uid of asArray(users)) {
      if (uid) out.push({ uid: String(uid), emoji });
    }
  }
  return out;
}

/** Supabase `chat_reads` row -> a `receipts/{uid}` projection on the read message. */
export function toReceipt(row) {
  const messageId = row.last_read_message_id ?? null;
  if (!messageId) return null;
  return {
    chatId: String(row.chat_id),
    messageId: String(messageId),
    userId: String(row.user_id),
    state: 'read',
    at: toMillis(row.last_read_at),
  };
}

/** Supabase `messages` row -> zero or more attachment records. */
export function toAttachments(row) {
  // `media_url` is usually a duplicate of `media_urls[0]`, so collapse by URL
  // (order-preserving) to avoid writing duplicate attachment documents.
  const urls = [];
  const seen = new Set();
  const push = (url) => {
    if (!url) return;
    const key = String(url);
    if (seen.has(key)) return;
    seen.add(key);
    urls.push(key);
  };
  push(row.media_url);
  for (const url of asArray(row.media_urls)) push(url);
  if (!urls.length) return [];
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return urls.map((url, index) => compact({
    messageId: String(row.id),
    chatId: String(row.chat_id),
    index,
    objectId: index === 0 ? (meta.object_id ?? meta.objectId ?? null) : null,
    url: String(url),
    name: meta.name ?? meta.file_name ?? null,
    mime: meta.mime ?? meta.content_type ?? null,
    size: meta.size ?? meta.bytes ?? null,
    width: meta.width ?? null,
    height: meta.height ?? null,
    durationMs: meta.duration_ms ?? meta.durationMs ?? null,
    state: 'ready',
  }));
}

/** Supabase `call_history` row -> `call_history/{id}` document (best-effort). */
export function toCallHistory(row) {
  const participants = asArray(row.participant_ids).map(String).filter(Boolean);
  const started = toMillis(row.started_at ?? row.created_at);
  const ended = toMillis(row.ended_at);
  const durationSeconds = typeof row.duration === 'number' ? row.duration : null;
  return {
    id: String(row.id),
    data: compact({
      callerId: asString(row.caller_id),
      calleeId: asString(row.callee_id),
      participantIds: participants.length ? participants : [row.caller_id, row.callee_id].filter(Boolean).map(String),
      chatId: row.chat_id ?? null,
      type: normaliseMessageType(row.type) === 'text' ? 'voice' : String(row.type ?? 'voice'),
      status: row.status ?? null,
      roomId: row.room_id ?? null,
      startedAt: started,
      endedAt: ended,
      durationMs: durationSeconds === null ? null : durationSeconds * 1000,
      createdAt: toMillis(row.created_at),
    }),
  };
}

/** The Supabase tables this migration reads, with their export file names. */
export const SOURCE_TABLES = [
  { table: 'chats', file: 'conversations.ndjson', order: 'created_at' },
  { table: 'messages', file: 'messages.ndjson', order: 'created_at' },
  { table: 'chat_reads', file: 'receipts.ndjson', order: 'chat_id' },
  { table: 'call_history', file: 'call_history.ndjson', order: 'created_at' },
];
