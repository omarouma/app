import test from 'node:test';
import assert from 'node:assert/strict';

let handler;
const SERVICE = 'test-only-service-role-key';
const ACTOR = '11111111-1111-4111-8111-111111111111';
const RECIPIENT = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';

globalThis.Deno = {
  env: { get: key => ({
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: SERVICE,
  })[key] },
  serve: fn => { handler = fn; },
};
await import('../index.ts');

function send(type = 'friend_request', authenticated = true, id = REQUEST_ID) {
  return handler(new Request('https://supabase.test/functions/v1/friend-event-push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authenticated ? { Authorization: 'Bearer test-user-jwt' } : {}),
    },
    body: JSON.stringify({ request_id: id, type }),
  }));
}

const row = {
  id: REQUEST_ID,
  from_user_id: ACTOR,
  to_user_id: RECIPIENT,
  status: 'pending',
};

function stubDatabase({ actor = ACTOR, record = row, alreadySent = false } = {}) {
  const pushes = [];
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).includes('/auth/v1/user')) return Response.json({ id: actor });
    if (String(url).includes('/rest/v1/friend_requests')) return Response.json([record]);
    if (String(url).includes('/rest/v1/friend_push_dispatches')) {
      return Response.json(alreadySent ? [] : [{ request_id: REQUEST_ID }]);
    }
    if (String(url).includes('/functions/v1/send-fcm-push')) {
      pushes.push(JSON.parse(init.body));
      return Response.json({ sent: 1, failed: 0, devices: 1 });
    }
    throw new Error('unexpected URL ' + url);
  };
  return pushes;
}

test('does not accept unauthenticated dispatches or non-GaGa event types', async () => {
  assert.equal((await send('friend_request', false)).status, 401);
  assert.equal((await send('payment_request')).status, 400);
  assert.equal((await send('friend_request', true, 'not-a-uuid')).status, 400);
});

test('sends only the authenticated sender’s pending request event', async () => {
  const pushes = stubDatabase();
  const response = await send();
  assert.equal(response.status, 200);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].user_id, RECIPIENT);
  assert.equal(pushes[0].type, 'friend_request');
  assert.equal(pushes[0].data.actor_id, ACTOR);
});

test('rejects attempts by another user to push the request', async () => {
  const pushes = stubDatabase({ actor: RECIPIENT });
  const response = await send();
  assert.equal(response.status, 403);
  assert.equal(pushes.length, 0);
});

test('does not re-send a previously reserved event', async () => {
  const pushes = stubDatabase({ alreadySent: true });
  const response = await send();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).duplicate, true);
  assert.equal(pushes.length, 0);
});

test('accepted event is sent only by the authenticated recipient', async () => {
  const pushes = stubDatabase({ actor: RECIPIENT, record: { ...row, status: 'accepted' } });
  const response = await send('friend_accepted');
  assert.equal(response.status, 200);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].user_id, ACTOR);
});

test('pending event cannot be replayed after request accepted', async () => {
  const pushes = stubDatabase({ record: { ...row, status: 'accepted' } });
  const response = await send('friend_request');
  assert.equal(response.status, 403);
  assert.equal(pushes.length, 0);
});
