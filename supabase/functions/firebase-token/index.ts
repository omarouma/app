// @ts-nocheck - Supabase Edge Functions run on the Deno runtime.
// Supabase Edge Function: firebase-token
//
// Mints a Firebase *custom token* whose `uid` equals the caller's Supabase user
// id, so the Android client can `signInWithCustomToken` and end up with
// `FirebaseAuth.currentUser.uid == Supabase userId`. That identity alignment is
// what lets the Firestore/RTDB security rules authorise the mirrored writes
// (`request.auth.uid == senderId`).
//
// The service-account private key never leaves the server. Deploy with:
//   supabase functions deploy firebase-token --no-verify-jwt
// and set the secrets:
//   supabase secrets set \
//     FIREBASE_PROJECT_ID=oumagachat \
//     FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@oumagachat.iam.gserviceaccount.com \
//     FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const FIREBASE_PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID') ?? 'oumagachat';
const FIREBASE_CLIENT_EMAIL = Deno.env.get('FIREBASE_CLIENT_EMAIL') ?? '';
// Secret env vars store the PEM with literal "\n"; normalise to real newlines.
const FIREBASE_PRIVATE_KEY = (Deno.env.get('FIREBASE_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n');

const CUSTOM_TOKEN_AUD =
  'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
const TOKEN_TTL_SECONDS = 3600;

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

async function mintCustomToken(uid: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: FIREBASE_CLIENT_EMAIL,
    sub: FIREBASE_CLIENT_EMAIL,
    aud: CUSTOM_TOKEN_AUD,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
    uid,
  };

  const signingInput = `${base64UrlEncodeString(JSON.stringify(header))}.${base64UrlEncodeString(
    JSON.stringify(payload),
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

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(req, { error: 'METHOD_NOT_ALLOWED' }, 405);
  }

  const callerId = await authenticate(req);
  if (!callerId) {
    return json(req, { error: 'UNAUTHORIZED', message: 'A valid Supabase session is required.' }, 401);
  }

  if (!FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    return json(req, { error: 'FIREBASE_NOT_CONFIGURED' }, 500);
  }

  // The Firebase uid MUST equal the Supabase uid so the security rules line up.
  const uid = callerId;
  try {
    const customToken = await mintCustomToken(uid);
    return json(req, {
      customToken,
      uid,
      projectId: FIREBASE_PROJECT_ID,
      expiresIn: TOKEN_TTL_SECONDS,
    });
  } catch {
    return json(req, { error: 'TOKEN_MINT_FAILED' }, 500);
  }
});
