// @ts-nocheck - Supabase Edge Functions run on the Deno runtime.
// Supabase Edge Function: firebase-identity
//
// The ONLY authority that ties a Firebase identity to a GaGa user id.
//
//   POST { action: "signup" }                     -> mint a new GaGa id
//        Authorization: Bearer <Firebase ID token>
//
//   POST { action: "link" }                       -> link an EXISTING account
//        Authorization: Bearer <Firebase ID token>
//        X-Legacy-Authorization: Bearer <Supabase access token>
//
// Linking requires proof of control of BOTH accounts (a verified Firebase ID
// token AND a valid legacy Supabase session). It NEVER links on an email string
// alone, and a conflicting mapping is rejected rather than merged.
//
// Deploy with:
//   supabase functions deploy firebase-identity --no-verify-jwt
// Secrets (already used by firebase-token): FIREBASE_PROJECT_ID,
// FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { verifyFirebaseIdToken } from '../_shared/firebase.ts';
import { firebaseAdminConfigured, setCustomUserClaims } from '../_shared/firebaseAdmin.ts';
import { serviceHeaders } from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

async function callRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`RPC ${name} failed (${response.status})`);
  return await response.json();
}

async function verifySupabaseSession(
  authorization: string,
): Promise<{ id: string; email?: string; email_confirmed_at?: string } | null> {
  if (!authorization.startsWith('Bearer ') || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: authorization },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    return (await response.json()) as { id: string; email?: string; email_confirmed_at?: string };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse(req, { error: 'METHOD_NOT_ALLOWED' }, 405);

  if (!firebaseAdminConfigured()) {
    return jsonResponse(req, { error: 'FIREBASE_NOT_CONFIGURED' }, 500);
  }

  const authorization = req.headers.get('Authorization') ?? '';
  const claims = await verifyFirebaseIdToken(authorization.replace(/^Bearer\s+/i, ''));
  if (!claims) {
    return jsonResponse(
      req,
      { error: 'UNAUTHORIZED', message: 'A valid Firebase ID token is required.' },
      401,
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const action = typeof body.action === 'string' ? body.action : 'signup';
  const firebaseEmail = typeof claims.email === 'string' ? claims.email : null;
  const firebaseVerified = claims.email_verified === true;

  try {
    if (action === 'link') {
      const legacyAuthorization =
        req.headers.get('X-Legacy-Authorization') ??
        (typeof body.legacy_token === 'string' ? `Bearer ${body.legacy_token}` : '');
      const legacy = await verifySupabaseSession(legacyAuthorization);
      if (!legacy?.id) {
        return jsonResponse(
          req,
          { error: 'LEGACY_SESSION_REQUIRED', message: 'Sign in to the existing account to link it.' },
          401,
        );
      }
      // Consistency check only — the *proof* is the two valid tokens above.
      const a = firebaseEmail?.toLowerCase() ?? null;
      const b = typeof legacy.email === 'string' ? legacy.email.toLowerCase() : null;
      if (a && b && a !== b) {
        return jsonResponse(req, { error: 'EMAIL_MISMATCH' }, 409);
      }

      const result = (await callRpc('gaga_link_identity', {
        p_firebase_uid: claims.sub,
        p_gaga_user_id: legacy.id,
        p_email: legacy.email ?? firebaseEmail,
        p_email_verified: firebaseVerified,
      })) as Record<string, unknown>;

      if (result?.error) {
        const status = result.error === 'IDENTITY_CONFLICT' ? 409 : 400;
        return jsonResponse(req, result, status);
      }

      await setCustomUserClaims(claims.sub, { gaga_user_id: result.gaga_user_id });
      return jsonResponse(req, {
        gaga_user_id: result.gaga_user_id,
        linked: true,
        existing: result.existing === true,
        method: 'migrated',
      });
    }

    // Default: brand-new signup. Requires a verified email so an unverified
    // account can never reach protected chat features.
    if (!firebaseVerified) {
      return jsonResponse(
        req,
        { error: 'EMAIL_NOT_VERIFIED', message: 'Verify your email address first.' },
        403,
      );
    }

    const result = (await callRpc('gaga_register_identity', {
      p_firebase_uid: claims.sub,
      p_email: firebaseEmail,
      p_email_verified: firebaseVerified,
      p_display_name: typeof body.display_name === 'string' ? body.display_name : null,
      p_username: typeof body.username === 'string' ? body.username : null,
    })) as Record<string, unknown>;

    if (result?.error) return jsonResponse(req, result, 400);

    await setCustomUserClaims(claims.sub, { gaga_user_id: result.gaga_user_id });
    return jsonResponse(req, {
      gaga_user_id: result.gaga_user_id,
      username: result.username,
      display_name: result.display_name,
      existing: result.existing === true,
      method: 'signup',
    });
  } catch {
    return jsonResponse(req, { error: 'IDENTITY_SERVICE_UNAVAILABLE' }, 503);
  }
});
