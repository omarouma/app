import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../worker.mjs';

const SECRET = 'dev-only-service-key-for-worker-tests';
const JOB = { chat_id: 'trusted-chat', revision: 2, lease_token: '11111111-1111-4111-8111-111111111111' };
const request = (payload = {}, key = SECRET, method = 'POST') =>
  new Request('https://example.test/functions/v1/trusted-chat-mirror-worker', {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    ...(method === 'POST' ? { body: JSON.stringify(payload) } : {}),
  });
function stub({ jobs = [JOB], response = { ok: true }, acknowledged = true } = {}) {
  const seen = { claims: [], runs: [], finishes: [] };
  const handler = createWorker({
    serviceKey: SECRET,
    claim: async size => { seen.claims.push(size); return jobs; },
    reconcileChat: async id => { seen.runs.push(id); return response; },
    finish: async (...args) => { seen.finishes.push(args); return acknowledged; },
  });
  return { handler, seen };
}

test('service-role authentication required; cannot poll outbox as client', async () => {
  const { handler, seen } = stub();
  assert.equal((await handler(request({}, null))).status, 401);
  assert.equal((await handler(request({}, 'random-user-jwt'))).status, 401);
  assert.equal((await handler(request({}, SECRET, 'GET'))).status, 405);
  assert.equal(seen.claims.length, 0);
});

test('only bounded batch size and recognized request fields are allowed', async () => {
  const { handler, seen } = stub();
  for (const bad of [{ max_items: 0 }, { max_items: 5 }, { max_items: '1' },
    { max_items: 1, chat_id: 'forged' }, { participants: [] }, []]) {
    assert.equal((await handler(request(bad))).status, 400);
  }
  assert.equal(seen.claims.length, 0);
});

test('successful delivery claims, reconciles and acknowledges matching revision', async () => {
  const { handler, seen } = stub();
  const response = await handler(request({ max_items: 1 }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    claimed: 1, synced: 1, retryable: 0, unacknowledged: 0,
  });
  assert.deepEqual(seen.claims, [1]);
  assert.deepEqual(seen.runs, [JOB.chat_id]);
  assert.deepEqual(seen.finishes[0], [JOB, true, 'PROVISIONING_UNAVAILABLE']);
});

test('Firestore error retains queued job for retry', async () => {
  const { handler, seen } = stub({ response: { ok: false, error: 'FIRESTORE_WRITE_FAILED' } });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).retryable, 1);
  assert.deepEqual(seen.finishes[0], [JOB, false, 'FIRESTORE_WRITE_FAILED']);
});

test('failed acknowledgment returns 503 and never claims success', async () => {
  const { handler } = stub({ acknowledged: false });
  const response = await handler(request());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).unacknowledged, 1);
});

test('invalid claimed lease metadata is never processed or acknowledged', async () => {
  const { handler, seen } = stub({ jobs: [{ chat_id: JOB.chat_id, revision: 0 }] });
  const response = await handler(request());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).unacknowledged, 1);
  assert.deepEqual(seen.runs, []);
  assert.deepEqual(seen.finishes, []);
});

test('outbox database outage fails closed before invoking chat sync', async () => {
  let syncCalled = false;
  const handler = createWorker({
    serviceKey: SECRET,
    claim: async () => { throw new Error('database network offline'); },
    reconcileChat: async () => { syncCalled = true; return { ok: true }; },
    finish: async () => true,
  });
  assert.equal((await handler(request())).status, 503);
  assert.equal(syncCalled, false);
});
