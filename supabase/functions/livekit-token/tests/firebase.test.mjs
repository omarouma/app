// Verifies that livekit-token accepts a VERIFIED Firebase ID token (the new
// primary identity) and drives the service-role bridge instead of the
// RLS-scoped RPC that only a Supabase session can use.
import test from 'node:test';
import assert from 'node:assert/strict';

const config = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'test-public-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  LIVEKIT_URL: 'wss://example.livekit.cloud',
  LIVEKIT_API_KEY: 'test-key',
  LIVEKIT_API_SECRET: 'test-only-secret',
};
let handler;
globalThis.Deno = { env: { get: key => config[key] }, serve: fn => { handler = fn; } };

const projectId = 'oumagachat';
const firebaseUid = 'firebase-uid-123';
const gagaUserId = '11111111-1111-4111-8111-111111111111';
const callId = '22222222-2222-4222-8222-222222222222';

const keyPair = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
);
const publicJwk = {
  ...(await crypto.subtle.exportKey('jwk', keyPair.publicKey)),
  kid: 'test-kid',
  alg: 'RS256',
  use: 'sig',
};

const b64url = value => Buffer.from(value).toString('base64url');
async function idToken(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', kid: 'test-kid', typ: 'JWT' };
  const payload = {
    sub: firebaseUid,
    aud: projectId,
    iss: `https://securetoken.google.com/${projectId}`,
    iat: now,
    exp: now + 3600,
    email: 'user@example.com',
    email_verified: true,
    ...overrides,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    keyPair.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${Buffer.from(new Uint8Array(signature)).toString('base64url')}`;
}

await import('../index.ts');

const call = {
  id: callId,
  caller_id: gagaUserId,
  callee_id: 'other',
  status: 'ringing',
  created_at: new Date().toISOString(),
  room_id: `call_${callId}`,
};

async function request(token, { row = call, admitted = true, room = `call_${callId}`, user = gagaUserId } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    calls.push({ url: target, headers: init.headers ?? {} });
    if (target.includes('googleapis.com/service_accounts')) return Response.json({ keys: [publicJwk] });
    if (target.includes('/rest/v1/gaga_identities')) {
      return Response.json([{ gaga_user_id: gagaUserId, email: 'user@example.com', email_verified: true }]);
    }
    if (target.includes('/rest/v1/call_history')) return Response.json(row ? [row] : []);
    if (target.includes('/rpc/gaga_validate_call_service')) return Response.json(admitted);
    if (target.includes('/auth/v1/user')) return new Response('', { status: 401 });
    throw new Error('Unexpected request: ' + target);
  };
  const response = await handler(new Request(
    `https://example/functions/v1/livekit-token?room=${room}&user=${user}`,
    { headers: { Authorization: `Bearer ${token}` } },
  ));
  return { response, body: await response.json(), calls };
}

test('accepts a verified Firebase ID token and mints a room-scoped token', async () => {
  const token = await idToken();
  const { response, body, calls } = await request(token);
  assert.equal(response.status, 200);
  const payload = JSON.parse(Buffer.from(body.token.split('.')[1], 'base64url'));
  assert.equal(payload.sub, gagaUserId);
  assert.equal(payload.video.room, `call_${callId}`);
  assert.equal(payload.video.roomJoin, true);
  assert.ok(calls.some(c => c.url.includes('/rpc/gaga_validate_call_service')), 'uses the service-role bridge');
  assert.ok(!calls.some(c => c.url.endsWith('/rpc/gaga_validate_call')), 'never uses the RLS-scoped RPC for Firebase');
  const history = calls.find(c => c.url.includes('/rest/v1/call_history'));
  assert.equal(history.headers.Authorization, `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`);
});

test('rejects a Firebase token for an unmapped user', async () => {
  const token = await idToken();
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes('googleapis.com/service_accounts')) return Response.json({ keys: [publicJwk] });
    if (target.includes('/rest/v1/gaga_identities')) return Response.json([]);
    throw new Error('Unexpected request: ' + target);
  };
  const response = await handler(new Request(
    `https://example/functions/v1/livekit-token?room=call_${callId}&user=${gagaUserId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  ));
  assert.equal(response.status, 401);
});

test('rejects a forged Firebase token (bad signature)', async () => {
  const token = await idToken();
  const [header, payload] = token.split('.');
  const forged = `${header}.${payload}.${Buffer.from('not-a-real-signature').toString('base64url')}`;
  const { response } = await request(forged);
  assert.equal(response.status, 401);
});

test('rejects a Firebase token issued for another project', async () => {
  const token = await idToken({ aud: 'someone-else', iss: 'https://securetoken.google.com/someone-else' });
  const { response } = await request(token);
  assert.equal(response.status, 401);
});

test('rejects a Firebase caller asking for another user identity', async () => {
  const token = await idToken();
  const { response } = await request(token, { user: '99999999-9999-4999-8999-999999999999' });
  assert.equal(response.status, 403);
});
