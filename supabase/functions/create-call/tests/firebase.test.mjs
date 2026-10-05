// Verifies that create-call accepts a VERIFIED Firebase ID token and routes the
// eligibility check through the service-role bridge (gaga_can_call_service)
// instead of the RLS-scoped gaga_can_call that only a Supabase session can use.
import test from 'node:test';
import assert from 'node:assert/strict';

const config = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'test-public-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  ZEGO_APP_ID: '0',
};
let handler;
globalThis.Deno = { env: { get: key => config[key] }, serve: fn => { handler = fn; } };
globalThis.EdgeRuntime = { waitUntil: () => {} };

const projectId = 'oumagachat';
const firebaseUid = 'firebase-uid-123';
const gagaUserId = '11111111-1111-4111-8111-111111111111';
const calleeId = '22222222-2222-4222-8222-222222222222';
const callId = '33333333-3333-4333-8333-333333333333';

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
async function idToken() {
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

async function call({ allowed = true, createStatus = 200 } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    calls.push({ url: target, body: init.body });
    if (target.includes('googleapis.com/service_accounts')) return Response.json({ keys: [publicJwk] });
    if (target.includes('/rest/v1/gaga_identities')) {
      return Response.json([{ gaga_user_id: gagaUserId, email: 'user@example.com', email_verified: true }]);
    }
    if (target.includes('/rpc/gaga_can_call_service')) return Response.json(allowed);
    if (target.includes('/rpc/gaga_create_call')) {
      if (createStatus !== 200) return new Response('', { status: createStatus });
      return Response.json({
        call_id: callId, room_id: `gaga_call_${callId.replaceAll('-', '')}`, call_type: 'voice',
        caller_id: gagaUserId, callee_id: calleeId, replayed: false,
      });
    }
    if (target.includes('/rest/v1/users')) return Response.json([{ display_name: 'Caller' }]);
    if (target.includes('/rest/v1/notifications')) return Response.json({});
    if (target.includes('/functions/v1/send-fcm-push')) return Response.json({ ok: true });
    throw new Error('Unexpected request: ' + target);
  };
  const token = await idToken();
  const response = await handler(new Request('https://example/functions/v1/create-call', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ chat_id: 'chat-1', callee_id: calleeId, type: 'voice' }),
  }));
  return { response, body: await response.json(), calls };
}

test('Firebase caller is authorised via the service-role bridge and creates a call', async () => {
  const { response, body, calls } = await call();
  assert.equal(response.status, 200);
  assert.equal(body.call_id, callId);
  assert.ok(calls.some(c => c.url.includes('/rpc/gaga_can_call_service')), 'uses the service-role bridge');
  assert.ok(!calls.some(c => c.url.endsWith('/rpc/gaga_can_call')), 'never uses the RLS-scoped RPC for Firebase');
  const create = calls.find(c => c.url.includes('/rpc/gaga_create_call'));
  assert.match(create.body, /"p_caller_id":"11111111-1111-4111-8111-111111111111"/);
});

test('Firebase caller denied by the bridge creates no call', async () => {
  const { response, calls } = await call({ allowed: false });
  assert.equal(response.status, 403);
  assert.ok(!calls.some(c => c.url.includes('/rpc/gaga_create_call')));
});

test('falls back to the migration bridge when gaga_create_call is absent', async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    calls.push({ url: target, body: init.body });
    if (target.includes('googleapis.com/service_accounts')) return Response.json({ keys: [publicJwk] });
    if (target.includes('/rest/v1/gaga_identities')) {
      return Response.json([{ gaga_user_id: gagaUserId, email: 'user@example.com', email_verified: true }]);
    }
    if (target.includes('/rpc/gaga_can_call_service')) return Response.json(true);
    if (target.endsWith('/rpc/gaga_create_call')) return new Response('', { status: 404 });
    if (target.endsWith('/rpc/gaga_create_call_service')) {
      return Response.json({
        call_id: callId, room_id: `gaga_call_${callId.replaceAll('-', '')}`, call_type: 'voice',
        caller_id: gagaUserId, callee_id: calleeId, replayed: false,
      });
    }
    if (target.includes('/rest/v1/users')) return Response.json([{ display_name: 'Caller' }]);
    if (target.includes('/rest/v1/notifications')) return Response.json({});
    if (target.includes('/functions/v1/send-fcm-push')) return Response.json({ ok: true });
    throw new Error('Unexpected request: ' + target);
  };
  const token = await idToken();
  const response = await handler(new Request('https://example/functions/v1/create-call', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ chat_id: 'chat-1', callee_id: calleeId, type: 'voice' }),
  }));
  assert.equal(response.status, 200);
  assert.ok(calls.some(c => c.url.endsWith('/rpc/gaga_create_call_service')));
});
