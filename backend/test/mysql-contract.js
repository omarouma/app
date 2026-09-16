'use strict';
const assert = require('assert');
const { MySqlDB } = require('../mysql-db');

const required = [
  'migrate','close','insertUser','userById','userByPhone','userByUsername','updateUser','setLastSeen',
  'addContact','removeContact','contactsFor','chatById','isMember','members','chatFor','findOrCreateDm',
  'chatsFor','messages','insertMessage','markRead','deleteChat','createRefreshSession',
  'refreshSessionByHash','sessionById','isSessionActive','rotateRefreshSession','revokeSessionFamily',
  'revokeFamilyBySession','upsertDevice','removeDevice','deviceTokensFor','insertMedia','mediaById',
  'markMediaReady','insertCall','callById','endCall','friendRequestByPair','createFriendRequest',
  'friendRequestsFor','acceptFriendRequest','rejectFriendRequest'
];
for (const name of required) assert.equal(typeof MySqlDB.prototype[name], 'function', `missing ${name}`);
assert.equal(typeof MySqlDB.connect, 'function');
console.log(`  PASS MySQL repository contract (${required.length} methods)`);

(async () => {
  const calls = [];
  const db = new MySqlDB({ execute: async (sql, args) => {
    calls.push({ sql, args });
    return [[{ id: 'b', created_at: 100 }, { id: 'a', created_at: 100 }]];
  }});
  const rows = await db.messages('chat', 100, 50, 'c');
  assert.deepEqual(calls[0].args, ['chat', 100, 100, 'c', 50]);
  assert.match(calls[0].sql, /m.created_at = \? AND m.id < \?/);
  assert.match(calls[0].sql, /ORDER BY m.created_at DESC,m.id DESC/);
  assert.deepEqual(rows.map(row => row.id), ['a', 'b']);
  await db.messages('chat', 101, 50);
  assert.deepEqual(calls[1].args, ['chat', 101, 50]);
  console.log('  PASS MySQL stable message cursor query (mock pool, not live RDS)');
})().catch(error => { console.error(error); process.exitCode = 1; });
