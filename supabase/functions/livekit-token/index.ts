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
// Optional (enables the background incoming-call push; the function degrades
// gracefully when they are absent):
//   supabase secrets set \
//     FIREBASE_PROJECT_ID=<project id> \
//     FIREBASE_CLIENT_EMAIL=<service account email> \
//     FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
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

const FIREBASE_PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID') ?? '';
const FIREBASE_CLIENT_EMAIL = Deno.env.get('FIREBASE_CLIENT_EMAIL') ?? '';
// Secret env vars store the PEM with literal "\n"; normalise to real newlines.
const FIREBASE_PRIVATE_KEY = (Deno.env.get('FIREBASE_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n');

/** Access tokens are deliberately short-lived; the client re-mints per call. */
const TOKEN_TTL_SECONDS = 3600;
/** How long a ringing call is allowed to stay "live" before it is considered stale. */
const RINGING_STALE_SECONDS = 120;

const ROOM_PREFIX = 'call_';
/** Statuses in which a call is still joinable. */
const LIVE_STATUSES = new Set(['calling', 'ringing', 'connected', 'connecting']);

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
}

/**
 * Loads the call row for a `call_<id>` room using the caller's own credentials,
 * so row-level security does the first pass of the authorisation for us.
 */
async function loadCall(req: Request, room: string): Promise<CallRow | null> {
  if (!room.startsWith(ROOM_PREFIX)) return null;
  const callId = room.slice(ROOM_PREFIX.length);
  if (!callId) return null;
  const authorization = req.headers.get('Authorization') ?? '';
  try {
    const query = new URL(`${SUPABASE_URL}/rest/v1/call_history`);
    query.searchParams.set('id', `eq.${callId}`);
    query.searchParams.set(
      'select',
      'id,status,caller_id,callee_id,participant_ids,chat_id,type,created_at',
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
      if (ageSeconds > RINGING_STALE_SECONDS) return false;
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

// ---------------------------------------------------------------------------
// Background incoming-call push (best effort)
// ---------------------------------------------------------------------------
//
// LiveKit has no concept of "ring this user's phone", and the Supabase Realtime
// broadcast that carries the invite only reaches a running app. This closes that
// gap: the moment the caller asks for its token, the callee's registered devices
// get a high-priority data push that wakes GagaPushReceiver and raises the
// full-screen incoming-call notification.
//
// Every failure here is swallowed: a missing push must never stop a call that is
// otherwise perfectly able to connect.

let cachedFcmAccessToken: { token: string; expiresAt: number } | null = null;

async function fcmAccessToken(): Promise<string | null> {
  if (!FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY || !FIREBASE_PROJECT_ID) return null;
  const now = Math.floor(Date.now() / 1000);
  if (cachedFcmAccessToken && cachedFcmAccessToken.expiresAt - 60 > now) {
    return cachedFcmAccessToken.token;
  }
  try {
    const signingInput = `${base64UrlEncodeString(
      JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
    )}.${base64UrlEncodeString(
      JSON.stringify({
        iss: FIREBASE_CLIENT_EMAIL,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + TOKEN_TTL_SECONDS,
      }),
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

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!response.ok) return null;
    const body = await response.json() as { access_token?: string; expires_in?: number };
    if (!body.access_token) return null;
    cachedFcmAccessToken = {
      token: body.access_token,
      expiresAt: now + (body.expires_in ?? TOKEN_TTL_SECONDS),
    };
    return cachedFcmAccessToken.token;
  } catch {
    return null;
  }
}

async function calleePushTokens(req: Request, calleeId: string): Promise<string[]> {
  const authorization = req.headers.get('Authorization') ?? '';
  try {
    const query = new URL(`${SUPABASE_URL}/rest/v1/user_devices`);
    query.searchParams.set('user_id', `eq.${calleeId}`);
    query.searchParams.set('select', 'push_token');
    query.searchParams.set('push_token', 'not.is.null');
    const response = await fetch(query, {
      headers: { Authorization: authorization, apikey: SUPABASE_ANON_KEY },
    });
    if (!response.ok) return [];
    const rows = await response.json() as Array<{ push_token?: string }>;
    return rows.map((row) => row.push_token ?? '').filter((token) => token.length > 0);
  } catch {
    return [];
  }
}

async function sendIncomingCallPush(
  req: Request,
  call: CallRow,
  callerId: string,
  callerName: string,
): Promise<void> {
  const calleeId = call.callee_id;
  const conversationId = call.chat_id;
  if (!calleeId || !conversationId) return;

  const accessToken = await fcmAccessToken();
  if (!accessToken) return;

  const tokens = await calleePushTokens(req, calleeId);
  if (tokens.length === 0) return;

  const data: Record<string, string> = {
    type: 'call',
    conversationId,
    callerId,
    callerName: callerName || 'GaGa User',
    callType: call.type === 'video' ? 'video' : 'voice',
    callId: call.id ?? '',
    roomId: `${ROOM_PREFIX}${call.id ?? ''}`,
  };

  await Promise.all(
    tokens.map(async (token) => {
      try {
        await fetch(
          `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: {
                token,
                // Data-only so the app always builds the notification itself and
                // can raise a full-screen incoming-call intent.
                data,
                android: { priority: 'high', ttl: '60s' },
              },
            }),
          },
        );
      } catch {
        // Ignore: a stale device token must not fail the call.
      }
    }),
  );
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

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return json(req, { error: 'LIVEKIT_NOT_CONFIGURED' }, 500);
  }

  // The caller dials; the callee answers. Only the dialling side rings the peer.
  if (call.caller_id === callerId && call.callee_id && call.callee_id !== callerId) {
    await sendIncomingCallPush(req, call, callerId, name);
  }

  try {
    const identity = user;
    const { token, expiresAt } = await mintLiveKitToken(room, identity, name, TOKEN_TTL_SECONDS);
    return json(req, {
      token,
      url: LIVEKIT_URL,
      room,
      identity,
      expires_at: expiresAt,
    });
  } catch {
    return json(req, { error: 'TOKEN_MINT_FAILED' }, 500);
  }
});
