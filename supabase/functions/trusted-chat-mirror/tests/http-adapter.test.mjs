/**
 * Tests actual Deno Edge Function adapter against mocked HTTP services.
 * Generates a THROWAWAY ephemeral signing key inside test runtime only.
 * This never reads Firebase secrets, makes network requests, or touches GaGa.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const CHAT = 'trusted-chat-adapter';
const SERVICE = 'test-service-role-only-not-production';
const pem = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
  .export({ type: 'pkcs8', format: 'pem' });
let handler;
globalThis.Deno = {
  env: { get(key) {
    return ({
      SUPABASE_URL: 'https://fcjgbbmfqdkucfpqjxae.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: SERVICE,
      FIREBASE_MIRROR_PROJECT_ID: 'oumagachat',
      FIREBASE_MIRROR_CLIENT_EMAIL: 'mock-test@oumagachat.iam.gserviceaccount.com',
      FIREBASE_MIRROR_PRIVATE_KEY: pem,
    })[key];
  } },
  serve(fn) { handler = fn; },
};
const realFetch = globalThis.fetch;
const observed = [];
let source = {
  id: CHAT, type: 'direct', participants: [A, B],
  updated_at: '2026-10-20T12:30:00.111111+00:00',
};
let firestore = null;
globalThis.fetch = async (uri, init = {}) => {
  const url = new URL(String(uri));
  observed.push({ path: url.pathname, method: init.method || 'GET',
    auth: init.headers?.Authorization || null,
    query: Object.fromEntries(url.searchParams),
    mask: url.searchParams.getAll('updateMask.fieldPaths'),
    data: init.body ? String(init.body) : null,
  });
  if (url.hostname === 'oauth2.googleapis.com') {
    return Response.json({ access_token: 'local-oauth-mock', expires_in: 3600 });
  }
  if (url.hostname === 'fcjgbbmfqdkucfpqjxae.supabase.co' &&
      url.pathname === '/rest/v1/chats') {
    assert.equal(init.headers.Authorization, `Bearer ${SERVICE}`);
    assert.equal(url.searchParams.get('id'), `eq.${CHAT}`);
    return Response.json(source ? [source] : []);
  }
  if (url.hostname === 'firestore.googleapis.com' &&
      url.pathname.endsWith('/chats/' + CHAT)) {
    assert.equal(init.headers.Authorization, 'Bearer local-oauth-mock');
    if ((init.method || 'GET') === 'GET') {
      return firestore ? Response.json(firestore) :
        Response.json({ error: 'NOT_FOUND' }, { status: 404 });
    }
    const data = JSON.parse(init.body);
    assert.equal(init.method, 'PATCH');
    const fields = data.fields;
    const precondition = url.searchParams;
    if (firestore) {
      assert.equal(precondition.get('currentDocument.updateTime'), firestore.updateTime);
    } else {
      assert.equal(precondition.get('currentDocument.exists'), 'false');
    }
    const mask = precondition.getAll('updateMask.fieldPaths');
    assert.deepEqual(mask.sort(), ['participants','type','sourceUpdatedAt','mirrorDeleted','updatedAt'].sort());
    firestore = { updateTime: '2026-10-20T13:00:00.000001Z', fields };
    return Response.json(firestore);
  }
  throw new Error('Unexpected mock URL: ' + url.pathname);
};
await import('../index.ts');
after(() => { globalThis.fetch = realFetch; });

function send(key = SERVICE, body = { chat_id: CHAT }) {
  return handler(new Request('https://edge.test/functions/v1/trusted-chat-mirror', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

test('unauthorized callers cause no Supabase or Google HTTP request', async () => {
  const before = observed.length;
  assert.equal((await send('attacker-supabase-jwt')).status, 401);
  assert.equal(observed.length, before);
});

test('server creates Firestore chat with authoritative members and no caller-supplied metadata', async () => {
  const response = await send();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'created');
  assert.equal(firestore.fields.type.stringValue, 'direct');
  assert.deepEqual(firestore.fields.participants.arrayValue.values.map(v => v.stringValue), [A, B]);
  assert.equal(firestore.fields.mirrorDeleted.booleanValue, false);
  assert.ok(observed.some(item => item.path === '/token' && item.method === 'POST'));
});

test('second sync is idempotent and uses no additional Firestore PATCH', async () => {
  const before = observed.filter(item => item.path.endsWith('/chats/' + CHAT) && item.method === 'PATCH').length;
  const result = await send();
  assert.equal((await result.json()).status, 'unchanged');
  assert.equal(observed.filter(item => item.path.endsWith('/chats/' + CHAT) && item.method === 'PATCH').length, before);
});

test('authorized server-only sync removes revoked group members with CAS precondition', async () => {
  source = {
    ...source, type: 'group', participants: [A],
    updated_at: '2026-10-20T12:30:00.222222+00:00',
  };
  const res = await send();
  assert.equal((await res.json()).status, 'updated');
  assert.deepEqual(firestore.fields.participants.arrayValue.values.map(v => v.stringValue), [A]);
  assert.equal(firestore.fields.type.stringValue, 'group');
});

test('verified Supabase deletion sets an access-denying tombstone', async () => {
  source = null;
  const res = await send();
  assert.equal((await res.json()).status, 'revoked');
  assert.equal(firestore.fields.mirrorDeleted.booleanValue, true);
  assert.deepEqual(firestore.fields.participants.arrayValue.values, []);
  assert.equal(firestore.fields.type.stringValue, 'deleted');
});
