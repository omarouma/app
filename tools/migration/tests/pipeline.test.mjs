// End-to-end test of the export -> import(dry-run) -> reconcile pipeline using
// a local mock of the Supabase PostgREST API. No network, no credentials.
//
// NOTE: the mock server lives in THIS process, so the child scripts must be run
// with the async `execFile` (not `execFileSync`). A synchronous spawn would
// block this process's event loop and the mock could never answer the child's
// HTTP requests, deadlocking the test.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationDir = path.resolve(here, '..');
const fixture = JSON.parse(readFileSync(path.join(migrationDir, 'fixtures', 'supabase-rows.json'), 'utf8'));

function startMockSupabase() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const table = url.pathname.replace('/rest/v1/', '');
    const rows = fixture[table] ?? [];
    const limit = Number(url.searchParams.get('limit') ?? rows.length);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const page = rows.slice(offset, offset + limit);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(page));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function run(script, args, env) {
  const { stdout } = await execFileAsync('node', [path.join(migrationDir, script), ...args], {
    cwd: migrationDir,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return stdout;
}

test('export -> import(dry-run) -> reconcile pipeline', async t => {
  const server = await startMockSupabase();
  const { port } = server.address();
  const env = {
    SUPABASE_URL: `http://127.0.0.1:${port}`,
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  };
  const outDir = mkdtempSync(path.join(tmpdir(), 'gaga-export-'));

  t.after(() => server.close());

  // 1. Export.
  const exportLog = await run('export-supabase.mjs', ['--out', outDir], env);
  assert.match(exportLog, /conversations\.ndjson/);
  const conversations = JSON.parse(`[${readFileSync(path.join(outDir, 'conversations.ndjson'), 'utf8').trim().split('\n').join(',')}]`);
  const messages = JSON.parse(`[${readFileSync(path.join(outDir, 'messages.ndjson'), 'utf8').trim().split('\n').join(',')}]`);
  assert.equal(conversations.length, 2);
  assert.equal(messages.length, 3);
  const manifest = JSON.parse(readFileSync(path.join(outDir, 'manifest.json'), 'utf8').trim());
  assert.equal(manifest.counts.messages, 3);
  assert.equal(manifest.files['messages.ndjson'].count, 3);

  // 2. Import dry-run (no credentials, no writes).
  const importLog = await run('import-firestore.mjs', ['--in', outDir, '--dry-run'], {});
  assert.match(importLog, /Dry-run complete/);

  // 3. Reconcile against an identical "Firestore" dump -> passes.
  const goodDump = mkdtempSync(path.join(tmpdir(), 'gaga-dump-'));
  for (const file of ['conversations.ndjson', 'members.ndjson', 'messages.ndjson', 'receipts.ndjson', 'attachments.ndjson']) {
    copyFileSync(path.join(outDir, file), path.join(goodDump, file));
  }
  const reconcileLog = await run('reconcile.mjs', ['--in', outDir, '--firestore', goodDump, '--sample', '25'], {});
  assert.match(reconcileLog, /RECONCILE PASSED/);

  // 4. Reconcile against a dump missing a message -> fails.
  const badDump = mkdtempSync(path.join(tmpdir(), 'gaga-dump-bad-'));
  for (const file of ['conversations.ndjson', 'members.ndjson', 'receipts.ndjson', 'attachments.ndjson']) {
    copyFileSync(path.join(outDir, file), path.join(badDump, file));
  }
  const messageLines = readFileSync(path.join(outDir, 'messages.ndjson'), 'utf8').trim().split('\n');
  writeFileSync(path.join(badDump, 'messages.ndjson'), `${messageLines.slice(0, -1).join('\n')}\n`);
  await assert.rejects(
    () => run('reconcile.mjs', ['--in', outDir, '--firestore', badDump], {}),
    /RECONCILE FAILED/,
  );
});
