#!/usr/bin/env node
// GaGa Chat — Supabase history export (read-only).
//
// Produces a self-describing, transport-neutral snapshot of every conversation,
// message, membership, read receipt and attachment, plus a manifest of row
// counts and SHA-256 hashes. Stable ids and original timestamps are preserved
// verbatim; nothing is rewritten or re-keyed.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node tools/migration/export-supabase.mjs --out ./migration-out
import path from 'node:path';
import {
  countBy, ensureDir, fileHash, log, parseArgs, writeNdjson,
} from './lib/util.mjs';
import { fetchAllOptional } from './lib/supabase.mjs';
import {
  SOURCE_TABLES, toAttachments, toCallHistory, toConversation, toMembers, toMessage, toReceipt,
} from './lib/map.mjs';

const args = parseArgs();
const outDir = path.resolve(args.out ?? './migration-out');
const pageSize = Number(args['page-size'] ?? 1000);

async function main() {
  await ensureDir(outDir);
  log(`Exporting Supabase history to ${outDir}`);

  const tables = {};
  for (const spec of SOURCE_TABLES) {
    tables[spec.table] = await fetchAllOptional(spec.table, { order: spec.order, pageSize });
    log(`  ${spec.table}: ${tables[spec.table].length} rows`);
  }

  const conversations = tables.chats.map(toConversation);
  const members = tables.chats.flatMap(toMembers);
  const messages = tables.messages.map(toMessage);
  const receipts = tables.chat_reads.map(toReceipt).filter(Boolean);
  const attachments = tables.messages.flatMap(toAttachments);
  const callHistory = tables.call_history.map(toCallHistory);

  const files = {
    'conversations.ndjson': conversations,
    'members.ndjson': members,
    'messages.ndjson': messages,
    'receipts.ndjson': receipts,
    'attachments.ndjson': attachments,
    'call_history.ndjson': callHistory,
  };

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: 'supabase',
    outDir,
    tables: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])),
    counts: {
      conversations: conversations.length,
      members: members.length,
      messages: messages.length,
      receipts: receipts.length,
      attachments: attachments.length,
      callHistory: callHistory.length,
    },
    messagesByChat: countBy(messages, message => message.chatId),
    files: {},
  };

  for (const [name, records] of Object.entries(files)) {
    const file = path.join(outDir, name);
    await writeNdjson(file, records);
    manifest.files[name] = { count: records.length, sha256: await fileHash(file) };
  }

  await writeNdjson(path.join(outDir, 'manifest.json'), [manifest]);
  log('Wrote:');
  for (const [name, meta] of Object.entries(manifest.files)) {
    log(`  ${name}  ${meta.count} records  ${meta.sha256.slice(0, 12)}…`);
  }
  log(`  manifest.json`);
}

main().catch(error => {
  process.stderr.write(`export failed: ${error.stack ?? error.message}\n`);
  process.exit(1);
});
