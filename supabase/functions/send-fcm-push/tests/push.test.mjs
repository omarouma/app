import test from 'node:test';
import assert from 'node:assert/strict';

let handler;
const SERVICE = 'test-service-role-key';
const config = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: SERVICE,
  FIREBASE_PROJECT_ID: 'oumagachat',
  FIREBASE_CLIENT_EMAIL: 'firebase-adminsdk@oumagachat.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: 'dummy-private-key',
};
globalThis.Deno = { env: { get: (key) => config[key] }, serve: (fn) => { handler = fn; } };
await import('../index.ts');

const recipient = '22222222-2222-4222-8222-222222222222';

function request({ body = { user_id: recipient, type: 'call', caller_name: 'Ada', call_id: 'c1' }, service = true, method = 'POST' } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (service) { headers.Authorization = `Bearer ${SERVICE}`; headers.apikey = SERVICE; }
  return handler(new Request('https://example/functions/v1/send-fcm-push', {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  }));
}

test('rejects requests without the service-role key', async () => {
  const response = await request({ service: false });
  assert.equal(response.status, 401);
});

test('rejects non-POST methods', async () => {
  const response = await request({ method: 'GET' });
  assert.equal(response.status, 405);
});

test('rejects a missing user id', async () => {
  const response = await request({ body: { type: 'call' } });
  assert.equal(response.status, 400);
});

test('reports zero devices when the recipient has no push tokens', async () => {
  globalThis.fetch = async () => Response.json([]);
  const response = await request();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sent: 0, failed: 0, devices: 0 });
});

test('answers CORS preflight', async () => {
  const response = await handler(new Request('https://example/functions/v1/send-fcm-push', { method: 'OPTIONS' }));
  assert.equal(response.status, 204);
});
