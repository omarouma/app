'use strict';
// Executes real repository methods against controlled pool doubles. This is NOT
// an RDS integration test; run the same scenarios against MySQL before release.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { MySqlDB } = require('../mysql-db');

function migrationPool({ roleExists = true, alterError = null } = {}) {
  const statements = [];
  let released = false;
  const connection = {
    async query(sql) {
      statements.push(sql);
      if (/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i.test(sql)) {
        throw Object.assign(new Error('Unsupported MySQL ADD COLUMN syntax'), { code: 'ER_PARSE_ERROR' });
      }
      if (/^ALTER TABLE/i.test(sql) && alterError) throw alterError;
      return [[], []];
    },
    async execute(sql) {
      assert.match(sql, /information_schema\.COLUMNS/i);
      assert.match(sql, /TABLE_SCHEMA\s*=\s*DATABASE\(\)/i);
      return [roleExists ? [{ present: 1 }] : [], []];
    },
    release() { released = true; }
  };
  return {
    pool: { async getConnection() { return connection; } }, statements,
    released: () => released
  };
}

test('fresh/repeated MySQL schema setup uses supported syntax and releases connection', async () => {
  const fixture = migrationPool();
  await new MySqlDB(fixture.pool).migrate();
  assert.ok(fixture.released());
  assert.equal(fixture.statements.filter(s => /^ALTER TABLE/i.test(s)).length, 0);
  assert.ok(fixture.statements.some(s => /CREATE TABLE IF NOT EXISTS messages/.test(s)));
});

test('legacy chat_members gains role exactly when absent', async () => {
  const fixture = migrationPool({ roleExists: false });
  await new MySqlDB(fixture.pool).migrate();
  assert.equal(fixture.statements.filter(s => /^ALTER TABLE chat_members ADD COLUMN role/i.test(s)).length, 1);
  assert.ok(fixture.released());
});

test('concurrent migrator duplicate-column race is harmless', async () => {
  const fixture = migrationPool({ roleExists: false, alterError: { code: 'ER_DUP_FIELDNAME' } });
  await new MySqlDB(fixture.pool).migrate();
  assert.ok(fixture.released());
});

test('migration does not hide permission or database failures', async () => {
  const error = Object.assign(new Error('alter denied'), { code: 'ER_TABLEACCESS_DENIED_ERROR' });
  const fixture = migrationPool({ roleExists: false, alterError: error });
  await assert.rejects(new MySqlDB(fixture.pool).migrate(), e => e === error);
  assert.ok(fixture.released());
});

test('all new tables explicitly use the same foreign-key string collation', () => {
  const schema = fs.readFileSync(path.join(__dirname, '../cloud/rds-schema.sql'), 'utf8');
  const statements = schema.split(';').map(s => s.trim()).filter(s => /^CREATE TABLE/i.test(s));
  assert.ok(statements.length >= 12);
  for (const sql of statements) assert.match(sql, /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci$/);
});

function messageRow(params) {
  return Object.fromEntries(['id','chat_id','sender_id','text','attachment_url','attachment_type','client_message_id','created_at'].map((key, i) => [key, params[i]]));
}

test('simultaneous retries return one persisted message and one idempotent replay', async () => {
  let row;
  let initialReads = 0;
  let releaseReads;
  const barrier = new Promise(resolve => { releaseReads = resolve; });
  const pool = { async execute(sql, params) {
    if (sql.startsWith('SELECT')) {
      if (initialReads < 2) {
        initialReads++;
        if (initialReads === 2) releaseReads();
        await barrier;
        return [[], []]; // Both clients saw no row before attempting INSERT.
      }
      assert.deepEqual(params, ['chat', 'sender', 'retry-id']);
      return [[row], []];
    }
    if (row) throw Object.assign(new Error('duplicate client id'), { code: 'ER_DUP_ENTRY' });
    row = messageRow(params);
    return [{ affectedRows: 1 }, []];
  } };
  const db = new MySqlDB(pool);
  const results = await Promise.all([1, 2].map(() => db.insertMessage('chat', 'sender', 'Hello', null, null, 'retry-id')));
  assert.equal(results.filter(r => r.inserted).length, 1);
  assert.equal(results[0].message.id, results[1].message.id);
});

test('ordinary database errors are not mistaken for successful retry', async () => {
  const error = Object.assign(new Error('database unavailable'), { code: 'ECONNRESET' });
  const db = new MySqlDB({ async execute(sql) {
    if (sql.startsWith('SELECT')) return [[], []];
    throw error;
  } });
  await assert.rejects(db.insertMessage('c', 'u', 'Hi', null, null, 'retry'), e => e === error);
});

test('unrelated duplicate key without a matching idempotency row still fails', async () => {
  const error = Object.assign(new Error('other unique key'), { code: 'ER_DUP_ENTRY' });
  const db = new MySqlDB({ async execute(sql) {
    if (sql.startsWith('SELECT')) return [[], []];
    throw error;
  } });
  await assert.rejects(db.insertMessage('c', 'u', 'Hi', null, null, 'retry'), e => e === error);
});
