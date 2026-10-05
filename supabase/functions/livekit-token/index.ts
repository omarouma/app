// @ts-nocheck - Supabase Edge Functions run on the Deno runtime.
// Supabase Edge Function: livekit-token
//
// Mints a LiveKit access token (JWT) for one call room, server-side, so the
// LiveKit API secret never ships inside the Android APK.
//
// Replaces `zego-token`. The old function minted a ZEGO token04 + ZIM token; the
// media transport is now LiveKit (WebRTC SFU) and the invite/ring layer is our
// own Supabase Realtime broadcast channel, so the only privileged artefact left
// is the LiveKit access token.
//
// Deploy with:
//   supabase functions deploy livekit-token --no-verify-jwt
// and set the secrets (values are project-specific and must NOT be committed):
//   supabase secrets set \
//     LIVEKIT_URL=wss://<project>.livekit.cloud \
//     LIVEKIT_API_KEY=<api key> \
//     LIVEKIT_API_SECRET=<api secret>
//
// Incoming-call push is owned by create-call -> send-fcm-push.
// Token refresh must never send a second incoming-call notification.
//
// Security model
// --------------
//  1. The caller must present a valid Supabase session (Bearer token).
//  2. The requested `user` identity must be the caller's own id.
//  3. The requested `room` must be a `call_<id>` room, and the caller must be the
//     caller, the callee or a listed participant of that call row.
//  4. Only then is a short-lived, room-scoped token minted. A token for room A
//     cannot be used to join room B, and it cannot publish or subscribe to
//     anything outside its own room.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL') ?? '';
const LIVEKIT_API_KEY = Deno.env.get('LIVEKIT_API_KEY') ?? '';
const LIVEKIT_API_SECRET = Deno.env.get('LIVEKIT_API_SECRET') ?? '';

/** Access tokens are deliberately short-lived; the client re-mints per call. */
const TOKEN_TTL_SECONDS = 3600;
/** How long a ringing call is allowed to stay "live" before it is considered stale. */
const RINGING_STALE_SECONDS = 120;
/** Bound recovery even when a killed client leaves a connected row behind. */
const CONNECTED_STALE_SECONDS = 24 * 60 * 60;

const ROOM_PREFIX = 'call_';
/** Statuses in which a call is still joinable. */
const LIVE_STATUSES = new Set(['calling', 'ringing', 'connected', 'connecting', 'accepted', 'reconnecting']);

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
}

function json(req: Request, body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeString(text: string): string {
  return base64UrlEncode(new TextEncoder().encode(text));
}

/** Resolves the Supabase user id behind the request, or null when unauthorised. */
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

interface CallRow {
  id?: string;
  status?: string;
  caller_id?: string;
  callee_id?: string;
  participant_ids?: string[];
  chat_id?: string;
  type?: string;
  created_at?: string;
  room_id?: string;
}

/**
 * Loads the call row for a `call_<id>` room using the caller's own credentials,
 * so row-level security does the first pass of the authorisation for us.
 */
async function loadCall(req: Request, room: string): Promise<CallRow | null> {
  const rawId = room.startsWith('gaga_call_') ? room.slice(10) : room.startsWith(ROOM_PREFIX) ? room.slice(ROOM_PREFIX.length) : '';
  const compact = rawId.replaceAll('-', '');
  if (!/^[a-fA-F0-9]{32}$/.test(compact)) return null;
  const callId = compact.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  const authorization = req.headers.get('Authorization') ?? '';
  try {
    const query = new URL(`${SUPABASE_URL}/rest/v1/call_history`);
    query.searchParams.set('id', `eq.${callId}`);
    query.searchParams.set(
      'select',
      'id,status,caller_id,callee_id,participant_ids,chat_id,type,created_at,room_id',
    );
    query.searchParams.set('limit', '1');
    const response = await fetch(query, {
      headers: { Authorization: authorization, apikey: SUPABASE_ANON_KEY },
    });
    if (!response.ok) return null;
    const rows = await response.json() as CallRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

function isParticipant(call: CallRow, userId: string): boolean {
  if (call.caller_id === userId || call.callee_id === userId) return true;
  return Array.isArray(call.participant_ids) && call.participant_ids.includes(userId);
}

function isCallLive(call: CallRow): boolean {
  if (!LIVE_STATUSES.has(call.status ?? '')) return false;
  // A call that was never cleaned up (app killed mid-ring) must not hand out
  // tokens forever, or a stale room would stay joinable indefinitely.
  if (call.created_at) {
    const created = Date.parse(call.created_at);
    if (!Number.isNaN(created)) {
      const ageSeconds = (Date.now() - created) / 1000;
      const limit = ['connected', 'reconnecting'].includes(call.status ?? '') ? CONNECTED_STALE_SECONDS : RINGING_STALE_SECONDS;
      if (ageSeconds > limit) return false;
    }
  }
  return true;
}

/**
 * Signs a LiveKit access token: HS256 over the API secret, with the standard
 * `video` grant block that scopes the token to exactly one room.
 */
async function mintLiveKitToken(
  room: string,
  identity: string,
  displayName: string,
  ttlSeconds: number,
): Promise<{ token: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ttlSeconds;

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    exp: expiresAt,
    iss: LIVEKIT_API_KEY,
    nbf: now - 10,
    sub: identity,
    jti: identity,
    name: displayName,
    video: {
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  };

  const signingInput = `${base64UrlEncodeString(JSON.stringify(header))}.${base64UrlEncodeString(
    JSON.stringify(payload),
  )}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(LIVEKIT_API_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'HMAC', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );

  return { token: `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`, expiresAt };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'GET') return json(req, { error: 'METHOD_NOT_ALLOWED' }, 405);

  const callerId = await authenticate(req);
  if (!callerId) {
    return json(req, { error: 'UNAUTHORIZED', message: 'A valid Supabase session is required.' }, 401);
  }

  const url = new URL(req.url);
  const room = (url.searchParams.get('room') ?? '').trim();
  const user = (url.searchParams.get('user') ?? '').trim();
  const name = (url.searchParams.get('name') ?? '').trim().slice(0, 80);

  if (!user || !room) return json(req, { error: 'MISSING_PARAMS' }, 400);
  if (room.length > 64 || !/^[A-Za-z0-9_-]+$/.test(room)) {
    return json(req, { error: 'INVALID_ROOM' }, 400);
  }

  // A caller may only ever ask for a token for itself. Accept the raw id, the
  // hyphen-preserving sanitised form, and the compact (hyphen-stripped) form the
  // Android client sends, so every client build authorises identically.
  const sanitizedCaller = callerId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  const compactCaller = callerId.replace(/[^A-Za-z0-9_]/g, '').slice(0, 64);
  if (user !== callerId && user !== sanitizedCaller && user !== compactCaller) {
    return json(req, { error: 'FORBIDDEN' }, 403);
  }

  const call = await loadCall(req, room);
  if (!call) return json(req, { error: 'CALL_NOT_FOUND' }, 404);
  if (!isParticipant(call, callerId)) return json(req, { error: 'CALL_ACCESS_DENIED' }, 403);
  if (!isCallLive(call)) return json(req, { error: 'CALL_NOT_ACTIVE' }, 409);

  // Re-check caller restrictions/blocking for every token, including refresh.
  const admission = await fetch(`${SUPABASE_URL}/rest/v1/rpc/gaga_validate_call`, {
    method: 'POST', headers: {Authorization: req.headers.get('Authorization') ?? '', apikey: SUPABASE_ANON_KEY, 'Content-Type':'application/json'},
    body: JSON.stringify({call_id:call.id, incoming:false}), signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!admission?.ok || await admission.json() !== true) return json(req, {error:'CALL_ACCESS_DENIED'}, 403);
  // Legacy Android names and the service-generated name resolve to one room.
  const canonicalRoom = call.room_id || `call_${call.id}`;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(canonicalRoom)) return json(req, {error:'INVALID_ROOM'}, 400);

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return json(req, { error: 'LIVEKIT_NOT_CONFIGURED' }, 500);
  }

  try {
    const identity = user;
    const { token, expiresAt } = await mintLiveKitToken(canonicalRoom, identity, name, TOKEN_TTL_SECONDS);
    return json(req, {
      token,
      url: LIVEKIT_URL,
      room: canonicalRoom,
      identity,
      expires_at: expiresAt,
    });
  } catch {
    return json(req, { error: 'TOKEN_MINT_FAILED' }, 500);
  }
});
