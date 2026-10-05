// @ts-nocheck - Supabase Edge Functions run on the Deno runtime.
// Firebase ID-token verification (RS256 against Google's rotating public keys).
//
// This is the server-side trust anchor for the whole Firebase-first migration:
// nothing is believed about a caller until its Firebase ID token has been
// signature-checked AND its `aud`/`iss`/`exp` claims have been validated.

const FIREBASE_PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID') ?? 'oumagachat';

// Google publishes the signing keys for Firebase ID tokens here.
const JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

export interface FirebaseClaims {
  sub: string;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
  auth_time?: number;
  email?: string;
  email_verified?: boolean;
  gaga_user_id?: string;
  [key: string]: unknown;
}

let jwksCache: { keys: Record<string, CryptoKey>; expiresAt: number } | null = null;

function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJson<T>(segment: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment))) as T;
}

async function loadSigningKeys(): Promise<Record<string, CryptoKey>> {
  const now = Date.now();
  if (jwksCache && jwksCache.expiresAt > now) return jwksCache.keys;

  const response = await fetch(JWKS_URL, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`JWKS fetch failed (${response.status})`);
  const body = (await response.json()) as { keys?: Array<JsonWebKey & { kid?: string }> };
  const keys: Record<string, CryptoKey> = {};
  for (const jwk of body.keys ?? []) {
    if (!jwk.kid) continue;
    keys[jwk.kid] = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
  }
  const cacheControl = response.headers.get('Cache-Control') ?? '';
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] ?? '3600');
  jwksCache = { keys, expiresAt: now + Math.max(60, maxAge) * 1000 };
  return keys;
}

/**
 * Verifies a Firebase ID token. Returns the claims on success, or `null` when
 * the token is malformed, unsigned, expired, or issued for another project.
 * Never throws.
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<FirebaseClaims | null> {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;

    const header = decodeJson<{ alg?: string; kid?: string }>(parts[0]);
    if (header.alg !== 'RS256' || !header.kid) return null;

    const keys = await loadSigningKeys();
    const key = keys[header.kid];
    if (!key) return null;

    const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const signature = base64UrlToBytes(parts[2]);
    const valid = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      signature,
      signedData,
    );
    if (!valid) return null;

    const claims = decodeJson<FirebaseClaims>(parts[1]);
    const now = Math.floor(Date.now() / 1000);
    if (claims.aud !== FIREBASE_PROJECT_ID) return null;
    if (claims.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) return null;
    if (typeof claims.exp !== 'number' || claims.exp <= now) return null;
    if (typeof claims.iat !== 'number' || claims.iat > now + 60) return null;
    if (typeof claims.sub !== 'string' || claims.sub.length === 0) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Cheap, unverified routing hint: does this look like a Firebase ID token? */
export function looksLikeFirebaseToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = decodeJson<{ iss?: string }>(parts[1]);
    return typeof payload.iss === 'string' && payload.iss.includes('securetoken.google.com');
  } catch {
    return false;
  }
}
