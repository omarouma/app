// @ts-nocheck - Supabase Edge Functions run on Deno runtime.
// Deno globals (Deno.env, Deno.serve, crypto.subtle, BufferSource) are
// available at runtime but not in the host project's browser TS lib.
// Supabase deploys compile this file separately with Deno TS.
// Supabase Edge Function: agora-token
//
// Mints short-lived Agora RTC tokens for authenticated GaGa Chat users.
// Free-tier friendly: runs on Supabase Edge Functions (Deno) — no Firebase
// Blaze plan required.
//
// Request:
//   GET /functions/v1/agora-token?channel=<channel>
//   Headers: Authorization: Bearer <supabase-access-token>
// Response:
//   { token, rtcToken, uid, channelName, expireAt, ttlSeconds }
//
// Security:
//   * Caller is verified against the Supabase Auth API (auth/v1/user).
//   * The Agora uid is derived server-side from the verified user id — the
//     client cannot mint tokens as another user.
//   * AGORA_APP_ID / AGORA_APP_CERTIFICATE live in Edge Function secrets
//     and never ship to the client.

const AGORA_APP_ID = Deno.env.get('AGORA_APP_ID') ?? '';
const AGORA_APP_CERTIFICATE = Deno.env.get('AGORA_APP_CERTIFICATE') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const TOKEN_TTL_SEC = Number(Deno.env.get('AGORA_TOKEN_TTL_SEC') ?? '43200'); // 12h

const ALLOWED_ORIGINS = [
  'https://gagachat.app',
  'https://www.gagachat.app',
  'https://oumagachat.web.app',
  'https://oumagachat.firebaseapp.com',
  'http://localhost:3000',
  'http://localhost:4173',
  'https://gagachat.web.app',
];

function corsHeaders(origin: string): Record<string, string> {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body: Record<string, unknown>, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store, no-cache, must-revalidate',
      ...corsHeaders(origin),
    },
  });
}

// ─── Verify the caller against Supabase Auth ────────────────────────────────
async function verifySupabaseUser(authHeader: string): Promise<string | null> {
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    });
    if (!resp.ok) return null;
    const user = (await resp.json()) as { id?: string };
    return user?.id ?? null;
  } catch {
    return null;
  }
}

// ─── Deterministic Agora uint32 uid from the Supabase user id ───────────────
// FNV-1a 32-bit hash, clamped to the safe non-zero range.
function userIdToAgoraUid(userId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const n = hash >>> 0;
  return n === 0 ? 1 : n;
}

// ─── Agora AccessToken ("006") builder — Web Crypto, dependency-free ────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(str: string): number {
  let c = 0xffffffff;
  const bytes = new TextEncoder().encode(str);
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u16(v: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, v, true);
  return b;
}

function u32(v: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v >>> 0, true);
  return b;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function putBytes(bytes: Uint8Array): Uint8Array {
  return concatBytes(u16(bytes.length), bytes);
}

function putTreeMapUInt32(map: Record<number, number>): Uint8Array {
  const keys = Object.keys(map).map(Number);
  const parts: Uint8Array[] = [u16(keys.length)];
  for (const key of keys) {
    parts.push(u16(key), u32(map[key]));
  }
  return concatBytes(...parts);
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, data as BufferSource);
  return new Uint8Array(sig);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function buildRtcToken(
  appId: string,
  appCertificate: string,
  channelName: string,
  uid: string,
  expireInSeconds: number,
): Promise<{ token: string; expireAt: number }> {
  const nowSec = Math.floor(Date.now() / 1000);
  const privilegeTs = nowSec + expireInSeconds;

  const saltArr = new Uint32Array(1);
  crypto.getRandomValues(saltArr);
  let salt = saltArr[0] >>> 0;
  if (salt === 0) salt = 1; // Agora requires salt > 0

  // Privileges: JOIN_CHANNEL(1), PUBLISH_AUDIO(2), PUBLISH_VIDEO(3), PUBLISH_DATA(4)
  const messages: Record<number, number> = {
    1: privilegeTs,
    2: privilegeTs,
    3: privilegeTs,
    4: privilegeTs,
  };

  const m = concatBytes(u32(salt), u32(privilegeTs), putTreeMapUInt32(messages));

  const toSign = concatBytes(
    new TextEncoder().encode(appId),
    new TextEncoder().encode(channelName),
    new TextEncoder().encode(uid),
    m,
  );
  const signature = await hmacSha256(new TextEncoder().encode(appCertificate), toSign);

  const content = concatBytes(
    putBytes(signature),
    u32(crc32(channelName)),
    u32(crc32(uid)),
    putBytes(m),
  );

  return { token: `006${appId}${bytesToBase64(content)}`, expireAt: privilegeTs };
}

// ─── Handler ────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') ?? '';

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== 'GET') {
    return json({ error: 'METHOD_NOT_ALLOWED' }, 405, origin);
  }

  // 1. Authenticate the caller (Supabase access token).
  const authHeader = req.headers.get('authorization') ?? '';
  const userId = await verifySupabaseUser(authHeader);
  if (!userId) {
    return json({ error: 'UNAUTHORIZED', message: 'Valid Supabase session required.' }, 401, origin);
  }

  // 2. Validate the channel name.
  const url = new URL(req.url);
  const channel = (url.searchParams.get('channel') ?? '').trim();
  if (!channel) {
    return json({ error: 'MISSING_CHANNEL', message: '`channel` query param required.' }, 400, origin);
  }
  if (channel.length > 64 || !/^[A-Za-z0-9_\-+=!@#$%&*()[\]{}|.:;<>,?~^]+$/.test(channel)) {
    return json({ error: 'INVALID_CHANNEL', message: '`channel` must be 1-64 URL-safe characters.' }, 400, origin);
  }

  // 3. Server config check.
  if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
    return json({ error: 'AGORA_NOT_CONFIGURED', message: 'Server is missing Agora credentials.' }, 500, origin);
  }

  // 4. Mint the token with a server-derived uid.
  const uid = userIdToAgoraUid(userId);
  const ttl = Math.max(60, TOKEN_TTL_SEC);
  const { token, expireAt } = await buildRtcToken(AGORA_APP_ID, AGORA_APP_CERTIFICATE, channel, String(uid), ttl);

  return json({ token, rtcToken: token, uid, channelName: channel, expireAt, ttlSeconds: ttl }, 200, origin);
});
