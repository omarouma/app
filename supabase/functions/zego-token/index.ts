// @ts-nocheck - Supabase Edge Functions run on the Deno runtime.
// Supabase Edge Function: zego-token
//
// Mints ZEGOCLOUD tokens server-side so the ZEGO ServerSecret NEVER ships in
// the client bundle.
//
// Returns two tokens:
//   * `token`    — a ZEGO UI Kit "kit token" for the Express (RTC) SDK. Format:
//                  `04<base64 binary>#<base64 JSON {appID,userID,userName,roomID}>`
//                  This is exactly what `ZegoUIKitPrebuilt.create()` expects.
//   * `zimToken` — a token04 user-identity token for the ZIM SDK (call
//                  invitation signalling). Same binary format, empty payload.
//
// The binary token04 layout (big-endian) is:
//   [0..8)   expire (int64)
//   [8..10)  iv length (uint16)
//   [10..26) iv (16 bytes)
//   [26..28) ciphertext length (uint16)
//   [28..)   AES-256-CBC(PKCS7) ciphertext of the JSON token info
//
// Reference: https://github.com/ZEGOCLOUD/zego_server_assistant (token04)

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const ZEGO_APP_ID = Number(Deno.env.get('ZEGO_APP_ID') ?? '0');
const ZEGO_SERVER_SECRET = Deno.env.get('ZEGO_SERVER_SECRET') ?? '';
// Optional: a separate AppID/secret pair dedicated to ZIM. When unset we reuse
// the Express (RTC) credentials, which is valid for a single ZEGO project.
const ZIM_APP_ID = Number(Deno.env.get('ZIM_APP_ID') ?? '0') || ZEGO_APP_ID;
const ZIM_SERVER_SECRET = Deno.env.get('ZIM_SERVER_SECRET') ?? ZEGO_SERVER_SECRET;

const TOKEN_TTL_SECONDS = 24 * 60 * 60;

const allowedOrigins = new Set([
  'https://gagachat.app',
  'https://oumagachat.web.app',
  'https://oumagachat.firebaseapp.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'capacitor://localhost',
  'https://localhost',
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
}

function json(req: Request, body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function makeRandomIv(): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < 16; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/**
 * Generates a ZEGOCLOUD token04 string. `secret` must be the 32-byte
 * ServerSecret from the ZEGOCLOUD console.
 */
async function generateToken04(
  appId: number,
  userId: string,
  secret: string,
  effectiveTimeInSeconds: number,
  payload: string,
): Promise<string> {
  const createTime = Math.floor(Date.now() / 1000);
  const tokenInfo = {
    app_id: appId,
    user_id: userId,
    nonce: Math.floor(Math.random() * 4294967296) - 2147483648,
    ctime: createTime,
    expire: createTime + effectiveTimeInSeconds,
    payload: payload || '',
  };

  const plainText = JSON.stringify(tokenInfo);
  const iv = makeRandomIv();
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(secret);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-CBC' },
    false,
    ['encrypt'],
  );
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-CBC', iv: encoder.encode(iv) },
      cryptoKey,
      encoder.encode(plainText),
    ),
  );

  const b1 = new Uint8Array(8);
  new DataView(b1.buffer).setBigInt64(0, BigInt(tokenInfo.expire), false);
  const b2 = new Uint8Array(2);
  new DataView(b2.buffer).setUint16(0, iv.length, false);
  const b3 = new Uint8Array(2);
  new DataView(b3.buffer).setUint16(0, encrypted.byteLength, false);

  const buf = new Uint8Array(8 + 2 + iv.length + 2 + encrypted.byteLength);
  let offset = 0;
  buf.set(b1, offset); offset += 8;
  buf.set(b2, offset); offset += 2;
  buf.set(encoder.encode(iv), offset); offset += iv.length;
  buf.set(b3, offset); offset += 2;
  buf.set(encrypted, offset);

  return `04${bytesToBase64(buf)}`;
}

/** Builds the UI Kit token: `token04#base64({appID,userID,userName,roomID})`. */
function buildKitToken(token04: string, appId: number, userId: string, userName: string, roomId: string): string {
  const meta = {
    appID: appId,
    userID: userId,
    userName: encodeURIComponent(userName || userId),
    roomID: roomId,
  };
  return `${token04}#${btoa(JSON.stringify(meta))}`;
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
  const userName = (url.searchParams.get('name') ?? '').trim();
  const type = (url.searchParams.get('type') ?? 'rtc').trim();

  if (!user) return json(req, { error: 'MISSING_PARAMS' }, 400);
  if (user.length > 64 || !/^[A-Za-z0-9_-]+$/.test(user)) return json(req, { error: 'INVALID_USER' }, 400);

  const sanitizedCaller = callerId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
  if (user !== callerId && user !== sanitizedCaller) return json(req, { error: 'FORBIDDEN' }, 403);

  if (!ZEGO_APP_ID || !ZEGO_SERVER_SECRET) return json(req, { error: 'ZEGO_NOT_CONFIGURED' }, 500);

  const now = Math.floor(Date.now() / 1000);
  const expireAt = now + TOKEN_TTL_SECONDS;

  // ZIM-only request: return a user-identity token04 (no room payload).
  if (type === 'zim') {
    if (!ZIM_APP_ID || !ZIM_SERVER_SECRET) return json(req, { error: 'ZIM_NOT_CONFIGURED' }, 500);
    const zimToken = await generateToken04(ZIM_APP_ID, user, ZIM_SERVER_SECRET, TOKEN_TTL_SECONDS, '');
    return json(req, { zimToken, appID: ZIM_APP_ID, userID: user, expireAt });
  }

  // RTC (Express) request: validate the room + participant, then mint the kit token.
  if (!room) return json(req, { error: 'MISSING_PARAMS' }, 400);
  if (room.length > 64 || !/^[A-Za-z0-9_-]+$/.test(room)) return json(req, { error: 'INVALID_ROOM' }, 400);
  if (!(await isCallParticipant(req, callerId, room))) {
    return json(req, { error: 'CALL_ACCESS_DENIED' }, 403);
  }

  const token04 = await generateToken04(ZEGO_APP_ID, user, ZEGO_SERVER_SECRET, TOKEN_TTL_SECONDS, '');
  const kitToken = buildKitToken(token04, ZEGO_APP_ID, user, userName, room);
  const zimToken = ZIM_APP_ID && ZIM_SERVER_SECRET
    ? await generateToken04(ZIM_APP_ID, user, ZIM_SERVER_SECRET, TOKEN_TTL_SECONDS, '')
    : null;

  return json(req, {
    token: kitToken,
    zimToken,
    appID: ZEGO_APP_ID,
    roomID: room,
    userID: user,
    expireAt,
  });
});
