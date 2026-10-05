// @ts-nocheck - Supabase Edge Functions run on the Deno runtime.
// Firebase Admin operations over REST, using the service-account credentials
// that already live in the Supabase function secrets (the same ones the legacy
// `firebase-token` function uses). No Firebase SDK is required.
//
//   * googleAccessToken()   – service-account JWT -> OAuth2 access token (cached)
//   * setCustomUserClaims() – injects the `gaga_user_id` custom claim
//   * sendFcm()             – one FCM HTTP v1 message
//   * firestoreGetDocument()– read a Firestore doc (membership checks)

const FIREBASE_PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID') ?? 'oumagachat';
const FIREBASE_CLIENT_EMAIL = Deno.env.get('FIREBASE_CLIENT_EMAIL') ?? '';
const FIREBASE_PRIVATE_KEY = (Deno.env.get('FIREBASE_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n');

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CUSTOM_CLAIM_SCOPE = 'https://www.googleapis.com/auth/identitytoolkit';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const DATASTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';

let tokenCache: { token: string; expiresAt: number; scope: string } | null = null;

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

export function firebaseAdminConfigured(): boolean {
  return Boolean(FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY);
}

/** Exchanges the service account for a short-lived OAuth2 access token. */
export async function googleAccessToken(scope: string): Promise<string | null> {
  if (!firebaseAdminConfigured()) return null;
  const now = Date.now();
  if (tokenCache && tokenCache.scope === scope && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token;
  }

  const iat = Math.floor(now / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: FIREBASE_CLIENT_EMAIL,
    scope,
    aud: OAUTH_TOKEN_URL,
    iat,
    exp: iat + 3600,
  };
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
  tokenCache = {
    token: body.access_token,
    expiresAt: now + (body.expires_in ?? 3600) * 1000,
    scope,
  };
  return body.access_token;
}

/**
 * Sets custom claims on a Firebase user. Used to stamp `gaga_user_id` onto the
 * ID token so Firestore/RTDB rules can authorise without a lookup.
 */
export async function setCustomUserClaims(
  firebaseUid: string,
  claims: Record<string, unknown>,
): Promise<boolean> {
  const token = await googleAccessToken(CUSTOM_CLAIM_SCOPE);
  if (!token) return false;
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/accounts:update`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ localId: firebaseUid, customAttributes: JSON.stringify(claims) }),
        signal: AbortSignal.timeout(8000),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

/** Sends one FCM HTTP v1 message. Returns true when accepted by FCM. */
export async function sendFcm(
  deviceToken: string,
  notification: { title: string; body: string },
  data: Record<string, string>,
  channelId = 'gaga_messages',
): Promise<boolean> {
  const token = await googleAccessToken(FCM_SCOPE);
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

/** Reads a Firestore document and returns its `fields` map (or null). */
export async function firestoreGetDocument(
  path: string,
): Promise<Record<string, unknown> | null> {
  const token = await googleAccessToken(DATASTORE_SCOPE);
  if (!token) return null;
  try {
    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) return null;
    const doc = (await response.json()) as { fields?: Record<string, unknown> };
    return doc.fields ?? null;
  } catch {
    return null;
  }
}

/** Extracts a Firestore array-of-strings field into a plain string[]. */
export function firestoreStringArray(
  fields: Record<string, unknown> | null,
  name: string,
): string[] {
  const arrayValue = (fields?.[name] as { arrayValue?: { values?: Array<{ stringValue?: string }> } })
    ?.arrayValue;
  return (arrayValue?.values ?? []).map((value) => value.stringValue ?? '').filter(Boolean);
}
