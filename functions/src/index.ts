/**
 * GaGa Chat — Cloud Functions for Firebase (gen2 / V2).
 *
 * Deployed alongside Firebase Hosting. Endpoints are exposed to the SPA via
 * rewrites declared in `firebase.json` (e.g. /api/zego-token).
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { defineString, defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import jwt from 'jsonwebtoken';

// ─── Initialize Firebase Admin SDK ──────────────────────────────────────────
if (getApps().length === 0) {
  initializeApp();
}

// ─── Default runtime options ────────────────────────────────────────────────
setGlobalOptions({
  region: 'asia-southeast1',
  concurrency: 80,
});

// ─── Parameters (declarative config) ────────────────────────────────────────
// Public/non-sensitive params:
const ZEGO_APP_ID = defineString('ZEGO_APP_ID', {
  label: 'ZEGO Cloud App ID',
  description: 'ZEGO Cloud project App ID (public).',
  input: { text: { example: 'your-zego-app-id' } },
});

// Server-only secret — NEVER exposed to the client.
const ZEGO_SERVER_SECRET = defineSecret('ZEGO_SERVER_SECRET');

// Supabase project config — the app's PRIMARY auth system. Both values are
// public (they ship in the client bundle anyway), so plain params suffice.
const SUPABASE_URL = defineString('SUPABASE_URL', {
  label: 'Supabase project URL',
  description: 'e.g. https://your-project.supabase.co',
});
const SUPABASE_ANON_KEY = defineString('SUPABASE_ANON_KEY', {
  label: 'Supabase anon key',
  description: 'Public anon key used to call the Supabase Auth API.',
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function applyCors(req: { headers: { origin?: string } }, res: {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => any;
  end: () => void;
}): boolean {
  const origin = req.headers.origin ?? '';
  const allowList = new Set([
    'https://gagachat.app',
    'https://oumagachat.web.app',
    'https://oumagachat.firebaseapp.com',
    'http://localhost:3000',
    'http://localhost:5173',
  ]);
  const isAllowed = !origin || allowList.has(origin);
  if (isAllowed && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'null');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');

  // Handle preflight.
  if ((req as any).method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

/**
 * Extract the Bearer token from the `Authorization` header and verify it.
 *
 * Two auth systems are accepted, tried in order:
 *   1. Supabase access token (the app's primary auth) — verified by calling
 *      the Supabase Auth API (`GET /auth/v1/user`) with the project anon key.
 *   2. Firebase Auth ID token — verified with the Admin SDK.
 *
 * Returns the verified user id on success, or sends a 401 and returns null.
 */
async function requireAuthenticatedUser(
  req: { headers: { authorization?: string } },
  res: {
    status: (code: number) => any;
    json: (body: Record<string, unknown>) => void;
    end: () => void;
  },
): Promise<string | null> {
  const auth = req.headers.authorization ?? '';
  if (!auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing Bearer token.' });
    res.end();
    return null;
  }
  const token = auth.slice('Bearer '.length).trim();

  // 1. Supabase access token → Supabase user id.
  const supabaseUrl = SUPABASE_URL.value().replace(/\/+$/, '');
  const supabaseAnonKey = SUPABASE_ANON_KEY.value();
  if (supabaseUrl && supabaseAnonKey) {
    try {
      const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey },
      });
      if (resp.ok) {
        const user = (await resp.json()) as { id?: string };
        if (user?.id) return `sb_${user.id}`;
      }
    } catch { /* fall through to Firebase verification */ }
  }

  // 2. Firebase Auth ID token → Firebase uid.
  try {
    const decoded = await getAuth().verifyIdToken(token, true);
    return `fb_${decoded.uid}`;
  } catch (e: any) {
    res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Auth token invalid or expired.',
      code: e?.code,
    });
    res.end();
    return null;
  }
}

// ─── ZEGO Cloud Token Endpoint ───────────────────────────────────────────────
//
//   GET /api/zego-token?room=<roomID>&user=<userID>
//   Headers: Authorization: Bearer <firebase-id-token>
//   → { token, appID, roomID, userID, expireAt }
//
// Security:
//   * Endpoint requires a valid Firebase Auth ID token.
//   * Server Secret is read from Secret Manager (defineSecret binding),
//     never logged or returned.
export const zegoToken = onRequest(
  {
    secrets: [ZEGO_SERVER_SECRET],
    memory: '256MiB',
    timeoutSeconds: 15,
    invoker: 'public', // Hit via Hosting rewrite; Hosting itself is public.
  },
  async (req, res) => {
    // CORS / preflight.
    if (applyCors(req as any, res as any)) return;

    // JSON responses only.
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');

    // 1. Authenticate the caller.
    const callerUid = await requireAuthenticatedUser(req as any, res as any);
    if (!callerUid) return;

    // 2. Validate inputs.
    const room = String(req.query.room ?? '').trim();
    const user = String(req.query.user ?? '').trim();

    if (!room || !user) {
      res.status(400).json({
        error: 'MISSING_PARAMS',
        message: '`room` and `user` query params are required.',
      });
      return;
    }

    // Room ID validation: alphanumeric + _ - only, max 64 chars.
    if (room.length > 64 || !/^[A-Za-z0-9_-]+$/.test(room)) {
      res.status(400).json({
        error: 'INVALID_ROOM',
        message: '`room` must be 1-64 alphanumeric characters (letters, digits, _ -).',
      });
      return;
    }

    // Security: the `user` token subject MUST be the authenticated caller.
    // Supabase ids are prefixed `sb_` and Firebase ids `fb_` by the
    // authenticator, while ZEGO user ids are raw app ids. The web client
    // derives a ZEGO user id from the *same* app user id, so strip any
    // `sb_`/`fb_` prefix when comparing against the caller.
    const sanitizedCaller = callerUid.replace(/^sb_|^fb_/, '');
    if (user !== callerUid && user !== sanitizedCaller) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'You may only mint a token for your own user id.',
      });
      return;
    }

    const appId = Number(ZEGO_APP_ID.value());
    const serverSecret = ZEGO_SERVER_SECRET.value();
    if (!appId || !serverSecret) {
      res.status(500).json({
        error: 'ZEGO_NOT_CONFIGURED',
        message: 'Server is missing ZEGO Cloud credentials.',
      });
      return;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const expireAt = nowSec + 24 * 3600; // 24h

    let token: string;
    try {
      token = jwt.sign(
        {
          app_id: appId,
          user_id: user,
          ctime: nowSec,
          expire: expireAt,
          room_id: room,
        },
        serverSecret,
        {
          algorithm: 'HS256',
          // ZEGO WebKit tokens use a custom `verify: '0'` header field. The
          // jsonwebtoken@9 types don't include it, so we extend the header.
          header: { typ: 'JWT', alg: 'HS256', verify: '0' } as unknown as jwt.SignOptions['header'],
          noTimestamp: true,
        },
      );
    } catch (tokenErr) {
      console.error('[ZEGO] Token minting failed:', tokenErr);
      res.status(500).json({
        error: 'TOKEN_MINT_FAILED',
        message: 'Failed to generate a ZEGO token.',
      });
      return;
    }

    res.status(200).json({
      token,
      appID: appId,
      roomID: room,
      userID: user,
      expireAt,
    });
  },
);
