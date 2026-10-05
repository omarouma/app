#!/usr/bin/env node
// GaGa Chat — Firestore history import (idempotent).
//
// Reads the NDJSON produced by `export-supabase.mjs` and writes it to Firestore
// with `{ merge: true }`, keyed on the ORIGINAL id. Re-running is always safe:
// the same document is overwritten in place, never duplicated. Timestamps come
// from the export, never from import time.
//
//   GOOGLE_APPLICATION_CREDENTIALS=./oumagachat-firebase-adminsdk.json \
//     node tools/migration/import-firestore.mjs --in ./migration-out
//
// Add --dry-run to validate the input and print counts without touching
// Firestore (no credentials required).
import path from 'node:path';
import { compact, log, parseArgs, readNdjson, toDate } from './lib/util.mjs';

const args = parseArgs();
const inDir = path.resolve(args.in ?? './migration-out');
const dryRun = args['dry-run'] === true;

function toFirestoreMessage(record, attachments) {
  return compact({
    senderId: record.senderId,
    type: record.type,
    text: record.text,
    clientMessageId: record.clientMessageId,
    serverTs: toDate(record.serverTs),
    clientTs: toDate(record.clientTs),
    replyToId: record.replyToId,
    forwardedFrom: record.forwardedFrom,
    status: record.status,
    editedAt: toDate(record.editedAt),
    deletedAt: toDate(record.deletedAt),
    attachments: attachments.map(attachment => compact({
      objectId: attachment.objectId,
      url: attachment.url,
      name: attachment.name,
      mime: attachment.mime,
      size: attachment.size,
      width: attachment.width,
      height: attachment.height,
      durationMs: attachment.durationMs,
      state: attachment.state,
    })),
  });
}

function groupBy(records, keyFn) {
  const map = new Map();
  for (const record of records) {
    const key = keyFn(record);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(record);
  }
  return map;
}

async function main() {
  const conversations = await readNdjson(path.join(inDir, 'conversations.ndjson'));
  const members = await readNdjson(path.join(inDir, 'members.ndjson'));
  const messages = await readNdjson(path.join(inDir, 'messages.ndjson'));
  const receipts = await readNdjson(path.join(inDir, 'receipts.ndjson'));
  const attachments = await readNdjson(path.join(inDir, 'attachments.ndjson'));
  const callHistory = await readNdjson(path.join(inDir, 'call_history.ndjson'));

  const attachmentsByMessage = groupBy(attachments, record => record.messageId);
  const counts = {
    conversations: conversations.length,
    members: members.length,
    messages: messages.length,
    receipts: receipts.length,
    attachments: attachments.length,
    callHistory: callHistory.length,
  };

  // Validate the invariants that make the import safe before writing anything.
  const problems = [];
  const seenChats = new Set(conversations.map(record => record.id));
  for (const message of messages) {
    if (!message.id || !message.chatId) problems.push(`message missing id/chatId: ${JSON.stringify(message).slice(0, 120)}`);
    else if (!seenChats.has(message.chatId)) problems.push(`message ${message.id} references unknown chat ${message.chatId}`);
  }
  for (const member of members) {
    if (!member.chatId || !member.userId) problems.push(`member missing chatId/userId`);
  }
  for (const receipt of receipts) {
    if (!receipt.chatId || !receipt.messageId || !receipt.userId) problems.push(`receipt missing keys`);
  }
  if (problems.length) {
    process.stderr.write(`import aborted: ${problems.length} integrity problem(s)\n`);
    for (const problem of problems.slice(0, 20)) process.stderr.write(`  - ${problem}\n`);
    process.exit(1);
  }

  log(`Import plan (${dryRun ? 'dry-run' : 'live'}) from ${inDir}`);
  for (const [name, count] of Object.entries(counts)) log(`  ${name}: ${count}`);

  if (dryRun) {
    log('Dry-run complete — no Firestore writes performed.');
    return;
  }

  const { getDb, createBatchWriter } = await import('./lib/firestore.mjs');
  const db = await getDb();
  const writer = createBatchWriter(db);

  for (const record of conversations) {
    await writer.set('chats', record.id, compact({
      type: record.type,
      title: record.title,
      photoUrl: record.photoUrl,
      createdBy: record.createdBy,
      createdAt: toDate(record.createdAt),
      lastMessageAt: toDate(record.lastMessageAt),
      lastMessagePreview: record.lastMessagePreview,
      lastMessageSenderId: record.lastMessageSenderId,
      participants: record.participants ?? [],
      memberCount: record.memberCount ?? (record.participants ?? []).length,
    }));
  }

  for (const record of members) {
    await writer.set(`chats/${record.chatId}/members`, record.userId, compact({
      role: record.role,
      joinedAt: toDate(record.joinedAt),
      notificationPref: record.notificationPref,
      archived: record.archived,
      pinned: record.pinned,
      lastReadMessageId: record.lastReadMessageId,
      lastReadAt: toDate(record.lastReadAt),
    }));
  }

  for (const record of messages) {
    const attached = attachmentsByMessage.get(record.id) ?? [];
    await writer.set(`chats/${record.chatId}/messages`, record.id, toFirestoreMessage(record, attached));
    for (const reaction of record.reactions ?? []) {
      if (!reaction?.uid) continue;
      await writer.set(`chats/${record.chatId}/messages/${record.id}/reactions`, reaction.uid, {
        emoji: reaction.emoji ?? '👍',
        at: toDate(record.serverTs) ?? new Date(),
      });
    }
  }

  for (const record of receipts) {
    await writer.set(`chats/${record.chatId}/messages/${record.messageId}/receipts`, record.userId, compact({
      state: record.state ?? 'read',
      at: toDate(record.at),
    }));
  }

  for (const record of callHistory) {
    await writer.set('call_history', record.id, compact({
      callerId: record.callerId,
      calleeId: record.calleeId,
      participantIds: record.participantIds ?? [],
      chatId: record.chatId,
      type: record.type,
      status: record.status,
      roomId: record.roomId,
      startedAt: toDate(record.startedAt),
      endedAt: toDate(record.endedAt),
      durationMs: record.durationMs,
      createdAt: toDate(record.createdAt),
    }));
  }

  await writer.flush();
  log(`Imported ${writer.written} documents into Firestore (idempotent, merge semantics).`);
}

main().catch(error => {
  process.stderr.write(`import failed: ${error.stack ?? error.message}\n`);
  process.exit(1);
});
