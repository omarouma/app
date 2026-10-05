#!/usr/bin/env node
// GaGa Chat — reconciliation gate.
//
// Compares the Supabase export against a Firestore export and fails (non-zero
// exit) on any divergence: missing/extra conversations, per-conversation message
// count mismatches, sender-distribution drift, missing/duplicate message ids in
// the sampled conversations, and attachment-reference mismatches.
//
//   node tools/migration/reconcile.mjs --in ./migration-out --firestore ./firestore-out --sample 25
import path from 'node:path';
import { log, parseArgs, readNdjson } from './lib/util.mjs';

const args = parseArgs();
const sourceDir = path.resolve(args.in ?? './migration-out');
const targetDir = path.resolve(args.firestore ?? './firestore-out');
const sampleSize = Number(args.sample ?? 25);

function groupBy(records, keyFn) {
  const map = new Map();
  for (const record of records) {
    const key = keyFn(record);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(record);
  }
  return map;
}

function distribution(records, keyFn) {
  const counts = {};
  for (const record of records) {
    const key = String(keyFn(record));
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function diffKeys(expected, actual) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return {
    missing: expected.filter(id => !actualSet.has(id)),
    extra: actual.filter(id => !expectedSet.has(id)),
  };
}

async function load(dir) {
  return {
    conversations: await readNdjson(path.join(dir, 'conversations.ndjson')),
    members: await readNdjson(path.join(dir, 'members.ndjson')),
    messages: await readNdjson(path.join(dir, 'messages.ndjson')),
    receipts: await readNdjson(path.join(dir, 'receipts.ndjson')),
    attachments: await readNdjson(path.join(dir, 'attachments.ndjson')),
  };
}

async function main() {
  const source = await load(sourceDir);
  const target = await load(targetDir);
  const problems = [];

  // 1. Conversation sets must match exactly.
  const conversationDiff = diffKeys(
    source.conversations.map(record => record.id),
    target.conversations.map(record => record.id),
  );
  if (conversationDiff.missing.length) problems.push(`conversations missing in Firestore: ${conversationDiff.missing.slice(0, 10).join(', ')}`);
  if (conversationDiff.extra.length) problems.push(`unexpected conversations in Firestore: ${conversationDiff.extra.slice(0, 10).join(', ')}`);

  // 2. Global counts must match.
  for (const key of ['messages', 'members', 'receipts', 'attachments']) {
    if (source[key].length !== target[key].length) {
      problems.push(`${key} count mismatch: source=${source[key].length} firestore=${target[key].length}`);
    }
  }

  // 3. Per-conversation message counts, sender distribution and id integrity.
  const sourceMessages = groupBy(source.messages, record => record.chatId);
  const targetMessages = groupBy(target.messages, record => record.chatId);
  const chatIds = new Set([...sourceMessages.keys(), ...targetMessages.keys()]);
  const sampled = [...chatIds].slice(0, sampleSize);

  for (const chatId of chatIds) {
    const expected = sourceMessages.get(chatId) ?? [];
    const actual = targetMessages.get(chatId) ?? [];
    if (expected.length !== actual.length) {
      problems.push(`chat ${chatId}: message count source=${expected.length} firestore=${actual.length}`);
      continue;
    }
    const senderDiff = distribution(expected, m => m.senderId);
    const senderActual = distribution(actual, m => m.senderId);
    for (const sender of new Set([...Object.keys(senderDiff), ...Object.keys(senderActual)])) {
      if ((senderDiff[sender] ?? 0) !== (senderActual[sender] ?? 0)) {
        problems.push(`chat ${chatId}: sender ${sender} count source=${senderDiff[sender] ?? 0} firestore=${senderActual[sender] ?? 0}`);
      }
    }
  }

  // 4. Message ids in the sampled conversations: no missing, no duplicates.
  for (const chatId of sampled) {
    const expected = sourceMessages.get(chatId) ?? [];
    const actual = targetMessages.get(chatId) ?? [];
    const idDiff = diffKeys(expected.map(m => m.id), actual.map(m => m.id));
    if (idDiff.missing.length) problems.push(`chat ${chatId}: ${idDiff.missing.length} message(s) missing in Firestore`);
    if (idDiff.extra.length) problems.push(`chat ${chatId}: ${idDiff.extra.length} unexpected message(s) in Firestore`);
    const seen = new Set();
    for (const message of actual) {
      if (seen.has(message.id)) problems.push(`chat ${chatId}: duplicate message id ${message.id}`);
      seen.add(message.id);
    }
  }

  // 5. Attachment references must resolve to the same messages.
  const sourceAttachments = groupBy(source.attachments, record => record.messageId);
  const targetAttachments = groupBy(target.attachments, record => record.messageId);
  for (const messageId of new Set([...sourceAttachments.keys(), ...targetAttachments.keys()])) {
    const expected = (sourceAttachments.get(messageId) ?? []).map(a => a.url).sort();
    const actual = (targetAttachments.get(messageId) ?? []).map(a => a.url).sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      problems.push(`message ${messageId}: attachment references differ (source=${expected.length} firestore=${actual.length})`);
    }
  }

  log(`Reconcile: ${source.conversations.length} conversations, ${source.messages.length} messages, ${source.attachments.length} attachments`);
  log(`  sampled ${sampled.length} conversation(s) for id/duplicate checks`);

  if (problems.length) {
    process.stderr.write(`\nRECONCILE FAILED — ${problems.length} problem(s):\n`);
    for (const problem of problems.slice(0, 50)) process.stderr.write(`  - ${problem}\n`);
    process.exit(1);
  }
  log('\nRECONCILE PASSED — export and Firestore agree.');
}

main().catch(error => {
  process.stderr.write(`reconcile failed: ${error.stack ?? error.message}\n`);
  process.exit(1);
});
