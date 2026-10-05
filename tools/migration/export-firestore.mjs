#!/usr/bin/env node
// GaGa Chat — Firestore history export (inverse of import).
//
// Reproduces the SAME NDJSON shape as `export-supabase.mjs` by reading Firestore
// back out. Used by `reconcile.mjs` to diff the two stores and, during rollback,
// to recover messages written after cutover before re-cutting the release.
//
//   GOOGLE_APPLICATION_CREDENTIALS=./oumagachat-firebase-adminsdk.json \
//     node tools/migration/export-firestore.mjs --out ./firestore-out
import path from 'node:path';
import { asArray, compact, ensureDir, fileHash, log, parseArgs, writeNdjson } from './lib/util.mjs';

const args = parseArgs();
const outDir = path.resolve(args.out ?? './firestore-out');
const pageSize = Number(args['page-size'] ?? 500);

function millis(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

/** Pages a Firestore query without loading the whole collection into memory. */
async function readAll(query, batch = pageSize) {
  const out = [];
  let cursor = null;
  for (;;) {
    let page = query.limit(batch);
    if (cursor) page = page.startAfter(cursor);
    const snapshot = await page.get();
    if (snapshot.empty) break;
    for (const doc of snapshot.docs) out.push(doc);
    if (snapshot.size < batch) break;
    cursor = snapshot.docs[snapshot.docs.length - 1];
  }
  return out;
}

async function main() {
  const { getDb } = await import('./lib/firestore.mjs');
  const db = await getDb();
  await ensureDir(outDir);
  log(`Exporting Firestore history to ${outDir}`);

  const conversations = [];
  const members = [];
  const messages = [];
  const receipts = [];
  const attachments = [];
  const callHistory = [];

  const chatDocs = await readAll(db.collection('chats'));
  for (const chatDoc of chatDocs) {
    const chat = chatDoc.data() ?? {};
    conversations.push(compact({
      id: chatDoc.id,
      type: chat.type ?? 'dm',
      title: chat.title ?? null,
      photoUrl: chat.photoUrl ?? null,
      description: chat.description ?? null,
      createdBy: chat.createdBy ?? null,
      createdAt: millis(chat.createdAt),
      lastMessageAt: millis(chat.lastMessageAt),
      lastMessagePreview: chat.lastMessagePreview ?? null,
      lastMessageSenderId: chat.lastMessageSenderId ?? null,
      participants: asArray(chat.participants).map(String),
      memberCount: chat.memberCount ?? asArray(chat.participants).length,
    }));

    for (const memberDoc of await readAll(db.collection('chats').doc(chatDoc.id).collection('members'))) {
      const member = memberDoc.data() ?? {};
      members.push(compact({
        chatId: chatDoc.id,
        userId: memberDoc.id,
        role: member.role ?? 'member',
        joinedAt: millis(member.joinedAt),
        notificationPref: member.notificationPref ?? 'all',
        archived: member.archived ?? false,
        pinned: member.pinned ?? false,
        lastReadMessageId: member.lastReadMessageId ?? null,
        lastReadAt: millis(member.lastReadAt),
      }));
    }

    for (const messageDoc of await readAll(db.collection('chats').doc(chatDoc.id).collection('messages'))) {
      const message = messageDoc.data() ?? {};
      const reactionDocs = await readAll(db.collection('chats').doc(chatDoc.id).collection('messages').doc(messageDoc.id).collection('reactions'));
      const reactions = reactionDocs.map(reactionDoc => ({
        uid: reactionDoc.id,
        emoji: reactionDoc.data()?.emoji ?? '👍',
      }));
      messages.push(compact({
        id: messageDoc.id,
        chatId: chatDoc.id,
        senderId: message.senderId ?? null,
        type: message.type ?? 'text',
        text: message.text ?? null,
        clientMessageId: message.clientMessageId ?? null,
        serverTs: millis(message.serverTs),
        clientTs: millis(message.clientTs),
        replyToId: message.replyToId ?? null,
        forwardedFrom: message.forwardedFrom ?? null,
        status: message.status ?? null,
        editedAt: millis(message.editedAt),
        deletedAt: millis(message.deletedAt),
        reactions,
      }));

      asArray(message.attachments).forEach((attachment, index) => {
        attachments.push(compact({
          messageId: messageDoc.id,
          chatId: chatDoc.id,
          index,
          objectId: attachment.objectId ?? null,
          url: attachment.url ?? null,
          name: attachment.name ?? null,
          mime: attachment.mime ?? null,
          size: attachment.size ?? null,
          width: attachment.width ?? null,
          height: attachment.height ?? null,
          durationMs: attachment.durationMs ?? null,
          state: attachment.state ?? 'ready',
        }));
      });

      for (const receiptDoc of await readAll(db.collection('chats').doc(chatDoc.id).collection('messages').doc(messageDoc.id).collection('receipts'))) {
        receipts.push(compact({
          chatId: chatDoc.id,
          messageId: messageDoc.id,
          userId: receiptDoc.id,
          state: receiptDoc.data()?.state ?? 'read',
          at: millis(receiptDoc.data()?.at),
        }));
      }
    }
  }

  for (const callDoc of await readAll(db.collection('call_history'))) {
    const call = callDoc.data() ?? {};
    callHistory.push(compact({
      id: callDoc.id,
      callerId: call.callerId ?? null,
      calleeId: call.calleeId ?? null,
      participantIds: asArray(call.participantIds).map(String),
      chatId: call.chatId ?? null,
      type: call.type ?? null,
      status: call.status ?? null,
      roomId: call.roomId ?? null,
      startedAt: millis(call.startedAt),
      endedAt: millis(call.endedAt),
      durationMs: call.durationMs ?? null,
      createdAt: millis(call.createdAt),
    }));
  }

  const files = {
    'conversations.ndjson': conversations,
    'members.ndjson': members,
    'messages.ndjson': messages,
    'receipts.ndjson': receipts,
    'attachments.ndjson': attachments,
    'call_history.ndjson': callHistory,
  };
  for (const [name, records] of Object.entries(files)) {
    const file = path.join(outDir, name);
    await writeNdjson(file, records);
    log(`  ${name}  ${records.length} records  ${(await fileHash(file)).slice(0, 12)}…`);
  }
}

main().catch(error => {
  process.stderr.write(`export-firestore failed: ${error.stack ?? error.message}\n`);
  process.exit(1);
});
