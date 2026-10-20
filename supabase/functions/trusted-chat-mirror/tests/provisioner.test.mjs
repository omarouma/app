import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHandler, makeReconciler, normalizeAuthoritativeChat, ProjectionError,
} from '../mirror.mjs';

const SECRET = 'dev-only-mock-service-role-not-real';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const CHAT = 'chat_test-001';
const OLD = '2026-10-20T10:00:00.123456+00:00';
const NEW = '2026-10-20T10:00:00.123457+00:00';
const row = (extra = {}) => ({
  id: CHAT, type: 'direct', participants: [A, B], updated_at: OLD, ...extra,
});
function fakeStore(initialRow = row(), initialDoc = null) {
  let source = initialRow, mirror = initialDoc, writes = [];
  const loadChat = async chatId => {
    assert.equal(chatId, CHAT);
    return source;
  };
  const readMirror = async () => mirror;
  const writeMirror = async (_chatId, desired, lastVersion) => {
    if ((mirror?.updateTime ?? null) !== lastVersion) return 'conflict';
    mirror = { ...desired, updateTime: 'test-update-' + (writes.length + 1) };
    writes.push(desired);
    return 'ok';
  };
  return {
    reconcile: makeReconciler({ loadChat, readMirror, writeMirror,
      clock: () => '2026-10-20T10:00:01Z' }),
    get mirror() { return mirror; },
    get writes() { return writes; },
    set source(value) { source = value; },
    set mirror(value) { mirror = value; },
  };
}
function invoke(handler, payload, auth = SECRET, method = 'POST') {
  return handler(new Request('https://edge.example/functions/v1/trusted-chat-mirror', {
    method,
    headers: { 'Content-Type': 'application/json',
      ...(auth === null ? {} : { Authorization: `Bearer ${auth}` }) },
    ...(method === 'POST' ? { body: JSON.stringify(payload) } : {}),
  }));
}

test('strict service-role auth; user JWT, missing key and GET cannot provision', async () => {
  let callCount = 0;
  const handler = createHandler({ serviceKey: SECRET, reconcile: async () => { callCount++; return {}; } });
  assert.equal((await invoke(handler, { chat_id: CHAT }, null)).status, 401);
  assert.equal((await invoke(handler, { chat_id: CHAT }, 'user-jwt')).status, 401);
  assert.equal((await invoke(handler, { chat_id: CHAT }, SECRET, 'GET')).status, 405);
  assert.equal(callCount, 0);
  const unconfigured = createHandler({ serviceKey: '', reconcile: async () => ({}) });
  assert.equal((await invoke(unconfigured, { chat_id: CHAT })).status, 503);
});

test('rejects caller-specified memberships, project path, extra fields and malformed IDs', async () => {
  let count = 0;
  const handler = createHandler({ serviceKey: SECRET, reconcile: async () => { count++; return {}; } });
  for (const bad of [
    { chat_id: CHAT, participants: [C] },
    { chat_id: CHAT, type: 'group' },
    { chat_id: CHAT, firebase_project: 'attacker-project' },
    { chat_id: '../chats/private' },
    { chat_id: '' }, [], null, {}, { chat_id: 1 },
  ]) {
    assert.equal((await invoke(handler, bad)).status, 400);
  }
  assert.equal(count, 0);
});

test('authoritative direct chat comes from Supabase, ignoring client membership', async () => {
  const store = fakeStore(row({ participants: [B, A] }));
  const response = await invoke(createHandler({ serviceKey: SECRET, reconcile: store.reconcile }),
    { chat_id: CHAT });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'created');
  assert.deepEqual(store.mirror.participants, [A, B]);
  assert.equal(store.mirror.type, 'direct'); // real production type, not "dm"
  assert.equal(store.mirror.mirrorDeleted, false);
  assert.equal(store.writes.length, 1);
});

test('group type, membership removal and idempotent repeat are handled', async () => {
  const store = fakeStore(row({ type: 'group', participants: [A, B, C] }));
  assert.equal((await store.reconcile(CHAT)).status, 'created');
  store.source = row({ type: 'group', participants: [A, C], updated_at: NEW });
  assert.equal((await store.reconcile(CHAT)).status, 'updated');
  assert.deepEqual(store.mirror.participants, [A, C]);
  assert.equal((await store.reconcile(CHAT)).status, 'unchanged');
  assert.equal(store.writes.length, 2);
});

test('deletion revokes Firebase access via a tombstone, not a new membership list', async () => {
  const store = fakeStore();
  await store.reconcile(CHAT);
  store.source = null;
  assert.equal((await store.reconcile(CHAT)).status, 'revoked');
  assert.deepEqual(store.mirror.participants, []);
  assert.equal(store.mirror.type, 'deleted');
  assert.equal(store.mirror.mirrorDeleted, true);
  assert.equal((await store.reconcile(CHAT)).status, 'already_revoked');
  store.source = row({ updated_at: NEW });
  await assert.rejects(() => store.reconcile(CHAT), e =>
    e instanceof ProjectionError && e.code === 'CHAT_ID_TOMBSTONED' && e.status === 409);
});

test('verified missing chat creates a tombstone even before mirror exists', async () => {
  const store = fakeStore(null);
  assert.equal((await store.reconcile(CHAT)).status, 'revoked');
  assert.equal(store.writes.length, 1);
  assert.equal(store.mirror.mirrorDeleted, true);
  assert.deepEqual(store.mirror.participants, []);
});

test('failed Supabase source query never revokes Firebase users', async () => {
  const errors = makeReconciler({
    loadChat: async () => { throw new Error('network failure'); },
    readMirror: async () => ({ participants: [A, B], type: 'direct' }),
    writeMirror: async () => { throw new Error('MUST_NOT_WRITE'); },
  });
  await assert.rejects(errors(CHAT), /network failure/);
});

test('a previous Firestore document without sourceVersion is safely corrected', async () => {
  const store = fakeStore(row(), {
    participants: [A, C], type: 'direct', updateTime: 'legacy-version', mirrorDeleted: false,
  });
  assert.equal((await store.reconcile(CHAT)).status, 'updated');
  assert.deepEqual(store.mirror.participants, [A, B]);
});

test('stale events do not overwrite newer authoritative source microseconds', async () => {
  const store = fakeStore(row(), {
    participants: [A, B], type: 'group', updateTime: 'next',
    mirrorDeleted: false, sourceUpdatedAt: NEW,
  });
  assert.equal((await store.reconcile(CHAT)).status, 'newer_mirror_kept');
  assert.equal(store.writes.length, 0);
});

test('a Firestore precondition race retries both database and mirror reads', async () => {
  let loads = 0, reads = 0, writes = 0;
  let mirror = { participants: [A, B], type: 'direct', sourceUpdatedAt: OLD,
    updateTime: 'f1', mirrorDeleted: false };
  const reconcile = makeReconciler({
    loadChat: async () => {
      loads++;
      return row({ type: 'group', participants: [A, C], updated_at: NEW });
    },
    readMirror: async () => { reads++; return mirror; },
    writeMirror: async (_, desired, version) => {
      writes++;
      if (writes === 1) {
        mirror = { ...mirror, updateTime: 'f2' }; // competing write
        return 'conflict';
      }
      assert.equal(version, 'f2');
      mirror = { ...desired, updateTime: 'f3' };
      return 'ok';
    },
  });
  assert.equal((await reconcile(CHAT)).status, 'updated');
  assert.equal(loads, 2);
  assert.equal(reads, 2);
  assert.equal(writes, 2);
  assert.deepEqual(mirror.participants, [A, C]);
});

test('persistent CAS collisions fail closed and require durable retry', async () => {
  const reconcile = makeReconciler({
    loadChat: async () => row(),
    readMirror: async () => null,
    writeMirror: async () => 'conflict',
  });
  await assert.rejects(reconcile(CHAT), e => e.code === 'CONCURRENT_MIRROR_WRITE_RETRY');
});

test('bad source type, UUID, duplicate membership and timestamp are rejected', async () => {
  for (const bad of [
    row({ type: 'dm' }), row({ participants: [A, 'not-a-uuid'] }),
    row({ participants: [A, A] }), row({ participants: [] }),
    row({ updated_at: 'not-a-timestamp' }),
  ]) {
    assert.throws(() => normalizeAuthoritativeChat(CHAT, bad), ProjectionError);
  }
});

test('unauthorized requests never read Supabase or Firebase', async () => {
  let called = 0;
  const handler = createHandler({ serviceKey: SECRET, reconcile: async () => { called++; } });
  const response = await invoke(handler, { chat_id: CHAT }, 'untrusted');
  assert.equal(response.status, 401);
  assert.equal(called, 0);
});
