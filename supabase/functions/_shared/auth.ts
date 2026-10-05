// @ts-nocheck - Supabase Edge Functions run on the Deno runtime.
// Unified authentication for every privileged GaGa endpoint.
//
// A request may present EITHER:
//   * a Firebase ID token  (the new, primary identity), or
//   * a legacy Supabase access token (kept working during the migration).
//
// Both resolve to a single canonical `gaga_user_id`. Firebase callers are
// resolved through the server-owned `gaga_identities` mapping — never by an
// email string — so "Firebase login works with private media and LiveKit"
// holds without a flag day, and no account can be hijacked by submitting a
// matching email address.

import { looksLikeFirebaseToken, verifyFirebaseIdToken } from './firebase.ts';
import { firestoreGetDocument, firestoreStringArray } from './firebaseAdmin.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

export interface Identity {
  /** Canonical GaGa user id used by every table, rule and media path. */
  gagaUserId: string;
  /** Firebase uid when the caller authenticated with Firebase. */
  firebaseUid: string | null;
  email: string | null;
  emailVerified: boolean;
  method: 'firebase' | 'supabase';
}

export function serviceHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/** True when the request carries the service-role key (internal callers only). */
export function isServiceRequest(req: Request): boolean {
  if (!SUPABASE_SERVICE_ROLE_KEY) return false;
  const authorization = req.headers.get('Authorization') ?? '';
  const apikey = req.headers.get('apikey') ?? '';
  return authorization === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` || apikey === SUPABASE_SERVICE_ROLE_KEY;
}

async function lookupFirebaseMapping(
  firebaseUid: string,
): Promise<{ gaga_user_id: string; email: string | null; email_verified: boolean } | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const query = new URL(`${SUPABASE_URL}/rest/v1/gaga_identities`);
    query.searchParams.set('firebase_uid', `eq.${firebaseUid}`);
    query.searchParams.set('select', 'gaga_user_id,email,email_verified');
    query.searchParams.set('limit', '1');
    const response = await fetch(query, {
      headers: serviceHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const rows = (await response.json()) as Array<{
      gaga_user_id: string;
      email: string | null;
      email_verified: boolean;
    }>;
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

async function verifySupabaseToken(
  token: string,
): Promise<{ id: string; email?: string; email_confirmed_at?: string } | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    return (await response.json()) as { id: string; email?: string; email_confirmed_at?: string };
  } catch {
    return null;
  }
}

/** Resolves an Authorization header value to a canonical identity (or null). */
export async function resolveIdentityFromHeader(authorization: string): Promise<Identity | null> {
  if (!authorization || !authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;

  // 1) Firebase ID token (verified signature + claims). The cheap routing hint
  // keeps legacy Supabase JWTs from ever triggering a Google JWKS fetch.
  const claims = looksLikeFirebaseToken(token) ? await verifyFirebaseIdToken(token) : null;
  if (claims) {
    const mapping = await lookupFirebaseMapping(claims.sub);
    if (!mapping) return null; // unmapped Firebase user: must call firebase-identity first
    return {
      gagaUserId: mapping.gaga_user_id,
      firebaseUid: claims.sub,
      email: mapping.email ?? (typeof claims.email === 'string' ? claims.email : null),
      emailVerified: claims.email_verified === true || mapping.email_verified === true,
      method: 'firebase',
    };
  }

  // 2) Legacy Supabase access token (gaga_user_id == Supabase user id).
  const user = await verifySupabaseToken(token);
  if (user?.id) {
    return {
      gagaUserId: user.id,
      firebaseUid: null,
      email: user.email ?? null,
      emailVerified: Boolean(user.email_confirmed_at),
      method: 'supabase',
    };
  }

  return null;
}

export async function resolveIdentity(req: Request): Promise<Identity | null> {
  return resolveIdentityFromHeader(req.headers.get('Authorization') ?? '');
}

/** Like resolveIdentity, but additionally requires a verified email. */
export async function resolveVerifiedIdentity(req: Request): Promise<Identity | null> {
  const identity = await resolveIdentity(req);
  if (!identity) return null;
  if (!identity.emailVerified) return null;
  return identity;
}

/**
 * Authoritative conversation-membership check for media/call authorization.
 * Consults Firestore first (the post-migration source of truth) and falls back
 * to the Supabase `chats.participants` array during the transition. Returns true
 * if either store confirms membership.
 */
export async function isChatMember(gagaUserId: string, chatId: string): Promise<boolean> {
  if (!gagaUserId || !chatId) return false;

  // Firestore: chats/{chatId}.participants array-contains gagaUserId.
  const fields = await firestoreGetDocument(`chats/${encodeURIComponent(chatId)}`);
  if (fields) {
    if (firestoreStringArray(fields, 'participants').includes(gagaUserId)) return true;
  }

  // Supabase fallback.
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const query = new URL(`${SUPABASE_URL}/rest/v1/chats`);
      query.searchParams.set('id', `eq.${chatId}`);
      query.searchParams.set('select', 'participants');
      query.searchParams.set('limit', '1');
      const response = await fetch(query, {
        headers: serviceHeaders(),
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) {
        const rows = (await response.json()) as Array<{ participants?: string[] }>;
        const participants = rows[0]?.participants ?? [];
        if (participants.map(String).includes(gagaUserId)) return true;
      }
    } catch {
      // fall through
    }
  }

  return false;
}
