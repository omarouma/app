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
