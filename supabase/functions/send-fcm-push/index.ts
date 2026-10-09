// @ts-nocheck - Supabase Edge Functions run on the Deno runtime.
// Supabase Edge Function: send-fcm-push
//
// Internal push dispatcher. It is the single place that turns a server event
// (an incoming call, a new message, ...) into Firebase Cloud Messaging pushes
// for every device the recipient has registered in `public.user_devices`.
//
// It is SERVICE-ROLE ONLY: callers must present the Supabase service-role key
// in the `Authorization`/`apikey` header. The `create-call` function calls it
// with exactly those headers after it has authenticated the caller, so the
// public Data API can never reach it.
//
//   POST { user_id, type, title?, body?, data?, event_id? }
//        Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
//
// The Firebase service-account private key never leaves the server. Deploy with:
//   supabase functions deploy send-fcm-push --no-verify-jwt
// and set the same secrets the `firebase-token` function uses:
//   supabase secrets set \
//     FIREBASE_PROJECT_ID=oumagachat \
//     FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@oumagachat.iam.gserviceaccount.com \
//     FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
//
// NOTE: this source was previously only deployed out-of-band; it is committed
// here so the backend is fully reproducible from the repository.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FIREBASE_PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID') ?? 'oumagachat';
const FIREBASE_CLIENT_EMAIL = Deno.env.get('FIREBASE_CLIENT_EMAIL') ?? '';
// Secret env vars store the PEM with literal "\n"; normalise to real newlines.
const FIREBASE_PRIVATE_KEY = (Deno.env.get('FIREBASE_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n');

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

const allowedOrigins = new Set([
  'https://gagachat.app',
  'https://oumagachat.web.app',
  'https://oumagachat.firebaseapp.com',
  'http://localhost:3000',
  'http://localhost:5173',
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'null',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'private, no-store, no-cache, must-revalidate',
    'Vary': 'Origin',
  };
}

function json(req: Request, body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** True only for the internal caller that holds the service-role key. */
function isServiceRequest(req: Request): boolean {
  if (!SUPABASE_SERVICE_ROLE_KEY) return false;
  const authorization = req.headers.get('Authorization') ?? '';
  const apikey = req.headers.get('apikey') ?? '';
  return (
    authorization === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` || apikey === SUPABASE_SERVICE_ROLE_KEY
  );
}

function firebaseConfigured(): boolean {
  return Boolean(FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeString(text: string): string {
  return base64UrlEncode(new TextEncoder().encode(text));
}

/** Decodes a PEM PKCS#8 private key into an ArrayBuffer for Web Crypto. */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) buffer[i] = binary.charCodeAt(i);
  return buffer.buffer;
}

let tokenCache: { token: string; expiresAt: number } | null = null;

/** Exchanges the service account for a short-lived FCM OAuth2 access token. */
async function googleAccessToken(): Promise<string | null> {
  if (!firebaseConfigured()) return null;
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) return tokenCache.token;

  const iat = Math.floor(now / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = { iss: FIREBASE_CLIENT_EMAIL, scope: FCM_SCOPE, aud: OAUTH_TOKEN_URL, iat, exp: iat + 3600 };
  const signingInput = `${base64UrlEncodeString(JSON.stringify(header))}.${base64UrlEncodeString(
    JSON.stringify(claim),
  )}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(FIREBASE_PRIVATE_KEY),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(signingInput),
  );
  const assertion = `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) return null;
  tokenCache = { token: body.access_token, expiresAt: now + (body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}

/** Loads every non-null push token registered for a user. */
async function loadDeviceTokens(userId: string): Promise<string[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];
  const query = new URL(`${SUPABASE_URL}/rest/v1/user_devices`);
  query.searchParams.set('user_id', `eq.${userId}`);
  query.searchParams.set('select', 'push_token');
  query.searchParams.set('push_token', 'not.is.null');
  try {
    const response = await fetch(query, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    const rows = (await response.json()) as Array<{ push_token?: string }>;
    return rows.map((row) => row.push_token ?? '').filter(Boolean);
  } catch {
    return [];
  }
}

/** Sends one FCM HTTP v1 message. Returns true when accepted by FCM. */
async function sendFcm(
  deviceToken: string,
  notification: { title: string; body: string },
  data: Record<string, string>,
  channelId: string,
): Promise<boolean> {
  const token = await googleAccessToken();
  if (!token) return false;
  try {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: deviceToken,
            notification,
            data,
            android: { priority: 'high', notification: { channel_id: channelId } },
            apns: { payload: { aps: { sound: 'default' } } },
          },
        }),
        signal: AbortSignal.timeout(8000),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

/** Normalises an arbitrary body value into the string-only FCM data map. */
function toStringMap(body: Record<string, unknown>): Record<string, string> {
  const skip = new Set(['title', 'body', 'event_id', 'user_id', 'data']);
  const data: Record<string, string> = {};
  const put = (key: string, value: unknown) => {
    if (value === null || value === undefined) return;
    data[key] = typeof value === 'string' ? value : JSON.stringify(value);
  };
  for (const [key, value] of Object.entries(body)) {
    if (!skip.has(key)) put(key, value);
  }
  if (body.data && typeof body.data === 'object') {
    for (const [key, value] of Object.entries(body.data as Record<string, unknown>)) put(key, value);
  }
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'METHOD_NOT_ALLOWED' }, 405);

  // Internal endpoint: only the service role may dispatch pushes.
  if (!isServiceRequest(req)) {
    return json(req, { error: 'UNAUTHORIZED', message: 'Internal endpoint.' }, 401);
  }
  if (!firebaseConfigured()) {
    return json(req, { error: 'FIREBASE_NOT_CONFIGURED' }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(req, { error: 'INVALID_JSON' }, 400);
  }

  const userId = typeof body.user_id === 'string' ? body.user_id.trim() : '';
  const type = typeof body.type === 'string' ? body.type : 'message';
  if (!userId) return json(req, { error: 'INVALID_REQUEST' }, 400);

  const isCall = type === 'call' || type === 'incoming_call';
  const callType = typeof body.call_type === 'string' ? body.call_type : 'voice';
  const title =
    (typeof body.title === 'string' && body.title) ||
    (typeof body.caller_name === 'string' && body.caller_name) ||
    (typeof body.callerName === 'string' && body.callerName) ||
    'GaGa';
  const text =
    (typeof body.body === 'string' && body.body) ||
    (isCall ? `Incoming ${callType} call` : 'New message');

  const data = toStringMap(body);
  const channelId = isCall ? 'gaga_calls' : 'gaga_messages';

  try {
    const tokens = await loadDeviceTokens(userId);
    if (tokens.length === 0) {
      return json(req, { sent: 0, failed: 0, devices: 0 });
    }
    const results = await Promise.all(
      tokens.map((deviceToken) => sendFcm(deviceToken, { title, body: text }, data, channelId)),
    );
    const sent = results.filter(Boolean).length;
    return json(req, { sent, failed: results.length - sent, devices: tokens.length });
  } catch {
    return json(req, { error: 'PUSH_DISPATCH_FAILED' }, 503);
  }
});
