// @ts-nocheck — Supabase Edge Functions run on Deno.
// Internal service-only chat mirror synchronizer. NOT client callable.
//
// Deploy ONLY after Firebase IAM credential rotation, negative authorization
// tests, and reviewed source-of-truth sync triggers or a durable retry queue.
// Do not disable the Supabase gateway JWT check. A trusted service caller
// must additionally pass the function's exact service-role bearer check.
//
// The function rejects all requests except POST with exact bearer service
// role authorization. Do not call it from the Android application.
import { createHandler, makeReconciler, ProjectionError } from './mirror.mjs';

const url = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const project = (Deno.env.get('FIREBASE_MIRROR_PROJECT_ID') ?? '').trim();
const email = (Deno.env.get('FIREBASE_MIRROR_CLIENT_EMAIL') ?? '').trim();
const pem = (Deno.env.get('FIREBASE_MIRROR_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n');
const ready = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) &&
  service.length >= 12 && /^[a-z][a-z0-9-]{4,29}$/.test(project) &&
  email.endsWith(`@${project}.iam.gserviceaccount.com`) &&
  pem.includes('-----BEGIN PRIVATE KEY-----');

const encoder = new TextEncoder();
let tokenCache: { value: string; until: number } | null = null;
let tokenPromise: Promise<string> | null = null;

function b64u(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function encoded(value: unknown) {
  return b64u(encoder.encode(JSON.stringify(value)));
}

async function googleAccessToken() {
  if (tokenCache && tokenCache.until > Date.now()) return tokenCache.value;
  if (tokenPromise) return tokenPromise;
  tokenPromise = (async () => {
    const now = Math.floor(Date.now() / 1000);
    const input = `${encoded({ alg: 'RS256', typ: 'JWT' })}.${encoded({
      iss: email,
      sub: email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })}`;
    const raw = atob(pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, ''));
    const der = Uint8Array.from(raw, c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('pkcs8', der.buffer, {
      name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256',
    }, false, ['sign']);
    const signature = new Uint8Array(await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5', key, encoder.encode(input),
    ));
    const auth = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${input}.${b64u(signature)}`,
      }),
    });
    if (!auth.ok) throw new ProjectionError('FIREBASE_OAUTH_FAILED');
    const answer = await auth.json();
    if (!answer.access_token || !Number.isFinite(Number(answer.expires_in))) {
      throw new ProjectionError('FIREBASE_OAUTH_FAILED');
    }
    tokenCache = {
      value: answer.access_token,
      until: Date.now() + Math.max(0, Number(answer.expires_in) - 120) * 1000,
    };
    return tokenCache.value;
  })().finally(() => { tokenPromise = null; });
  return tokenPromise;
}

async function loadChat(chatId: string) {
  const endpoint = new URL(`${url}/rest/v1/chats`);
  endpoint.searchParams.set('select', 'id,type,participants,updated_at');
  endpoint.searchParams.set('id', `eq.${chatId}`);
  endpoint.searchParams.set('limit', '2');
  const response = await fetch(endpoint.toString(), {
    headers: { apikey: service, Authorization: `Bearer ${service}` },
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw new ProjectionError('SUPABASE_CHAT_QUERY_FAILED');
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length > 1) throw new ProjectionError('INVALID_SOURCE_RESULT');
  return rows[0] ?? null;
}
const documentUrl = (chatId: string) =>
  `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/chats/${encodeURIComponent(chatId)}`;

async function readMirror(chatId: string) {
  const token = await googleAccessToken();
  const response = await fetch(documentUrl(chatId), {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(9000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new ProjectionError('FIRESTORE_READ_FAILED');
  const doc = await response.json();
  const fields = doc.fields || {};
  const rawMembers = fields.participants?.arrayValue?.values ?? [];
  if (!Array.isArray(rawMembers)) throw new ProjectionError('INVALID_MIRROR_DOCUMENT');
  const members = rawMembers.map((value: {stringValue?: string}) => value.stringValue);
  if (members.some((uid: unknown) => typeof uid !== 'string')) {
    throw new ProjectionError('INVALID_MIRROR_DOCUMENT');
  }
  return {
    updateTime: doc.updateTime || null,
    participants: [...members].sort(),
    type: fields.type?.stringValue ?? '',
    mirrorDeleted: fields.mirrorDeleted?.booleanValue === true,
    sourceUpdatedAt: fields.sourceUpdatedAt?.stringValue ?? null,
  };
}

async function writeMirror(chatId: string, record: {
  participants: string[]; type: string; sourceUpdatedAt: string; mirrorDeleted: boolean;
}, updateTime: string | null) {
  const endpoint = new URL(documentUrl(chatId));
  for (const field of ['participants', 'type', 'sourceUpdatedAt', 'mirrorDeleted', 'updatedAt']) {
    endpoint.searchParams.append('updateMask.fieldPaths', field);
  }
  if (updateTime) {
    endpoint.searchParams.set('currentDocument.updateTime', updateTime);
  } else {
    endpoint.searchParams.set('currentDocument.exists', 'false');
  }
  const access = await googleAccessToken();
  const response = await fetch(endpoint.toString(), {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        participants: { arrayValue: { values: record.participants.map(uid => ({ stringValue: uid })) } },
        type: { stringValue: record.type },
        sourceUpdatedAt: { stringValue: record.sourceUpdatedAt },
        mirrorDeleted: { booleanValue: record.mirrorDeleted },
        updatedAt: { timestampValue: new Date().toISOString() },
      },
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 409 || response.status === 412 || response.status === 404) return 'conflict';
  if (!response.ok) throw new ProjectionError('FIRESTORE_WRITE_FAILED');
  return 'ok';
}

const reconcile = makeReconciler({ loadChat, readMirror, writeMirror });
const handler = createHandler({ serviceKey: service, reconcile });

Deno.serve(async request => {
  if (!ready) return Response.json({ error: 'MIRROR_NOT_CONFIGURED' }, {
    status: 503, headers: { 'Cache-Control': 'no-store' },
  });
  return handler(request);
});
