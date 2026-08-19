// @ts-nocheck - Supabase Edge Functions run on the Deno runtime.
// Supabase Edge Function: zego-token
// Server-only ZEGO token minting without exposing the ZEGO secret to the client.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const ZEGO_APP_ID = Number(Deno.env.get('ZEGO_APP_ID') ?? '0');
const ZEGO_SERVER_SECRET = Deno.env.get('ZEGO_SERVER_SECRET') ?? '';

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
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'private, no-store, no-cache, must-revalidate',
  'Vary': 'Origin',
  };
};

function json(req: Request, body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function base64Url(value: Uint8Array): string {
  let binary = '';
  value.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signZegoToken(payload: Record<string, unknown>, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const header = base64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'HS256', verify: '0' })));
  const body = base64Url(encoder.encode(JSON.stringify(payload)));
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));
  return `${data}.${base64Url(signature)}`;
}

async function authenticate(req: Request): Promise<string | null> {
  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ') || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey: SUPABASE_ANON_KEY },
    });
    if (!response.ok) return null;
    const user = await response.json() as { id?: string };
    return user.id ?? null;
  } catch {
    return null;
  }
}

async function isCallParticipant(req: Request, callerId: string, room: string): Promise<boolean> {
  if (!room.startsWith('call_')) return false;
  const callId = room.slice('call_'.length);
  if (!callId) return false;
  const authorization = req.headers.get('Authorization') ?? '';
  try {
    const query = new URL(`${SUPABASE_URL}/rest/v1/call_history`);
    query.searchParams.set('id', `eq.${callId}`);
    query.searchParams.set('select', 'id,status,caller_id,callee_id,participant_ids');
    query.searchParams.set('limit', '1');
    const response = await fetch(query, {
      headers: {
        Authorization: authorization,
        apikey: SUPABASE_ANON_KEY,
      },
    });
    if (!response.ok) return false;
    const rows = await response.json() as Array<{
      status?: string;
      caller_id?: string;
      callee_id?: string;
      participant_ids?: string[];
    }>;
    const call = rows[0];
    if (!call || !['calling', 'connected'].includes(call.status ?? '')) return false;
    return call.caller_id === callerId
      || call.callee_id === callerId
      || (Array.isArray(call.participant_ids) && call.participant_ids.includes(callerId));
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'GET') return json(req, { error: 'METHOD_NOT_ALLOWED' }, 405);

  const callerId = await authenticate(req);
  if (!callerId) return json(req, { error: 'UNAUTHORIZED', message: 'A valid Supabase session is required.' }, 401);

  const url = new URL(req.url);
  const room = (url.searchParams.get('room') ?? '').trim();
  const user = (url.searchParams.get('user') ?? '').trim();
  if (!room || !user) return json(req, { error: 'MISSING_PARAMS' }, 400);
  if (room.length > 64 || !/^[A-Za-z0-9_-]+$/.test(room)) return json(req, { error: 'INVALID_ROOM' }, 400);

  const sanitizedCaller = callerId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
  if (user !== callerId && user !== sanitizedCaller) return json(req, { error: 'FORBIDDEN' }, 403);
  if (!(await isCallParticipant(req, callerId, room))) {
    return json(req, { error: 'CALL_ACCESS_DENIED' }, 403);
  }
  if (!ZEGO_APP_ID || !ZEGO_SERVER_SECRET) return json(req, { error: 'ZEGO_NOT_CONFIGURED' }, 500);

  const now = Math.floor(Date.now() / 1000);
  const expireAt = now + 24 * 60 * 60;
  const token = await signZegoToken({ app_id: ZEGO_APP_ID, user_id: user, ctime: now, expire: expireAt, room_id: room }, ZEGO_SERVER_SECRET);
  return json(req, { token, appID: ZEGO_APP_ID, roomID: room, userID: user, expireAt });
});
