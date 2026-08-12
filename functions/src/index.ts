/**
 * GaGa Chat — Cloud Functions for Firebase (gen2 / V2).
 *
 * Deployed alongside Firebase Hosting. Endpoints are exposed to the SPA via
 * rewrites declared in `firebase.json` (e.g. /api/agora-token).
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { defineString, defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { RtcTokenBuilder, RtcRole } from 'agora-access-token';

// ─── Initialize Firebase Admin SDK ──────────────────────────────────────────
if (getApps().length === 0) {
  initializeApp();
}

// ─── Default runtime options ────────────────────────────────────────────────
// Keep instances colocated with your primary database region for lower
// latency to Supabase. asia-southeast1 = Singapore.
setGlobalOptions({
  region: 'asia-southeast1',
  concurrency: 80,
});

// ─── Parameters (declarative config) ────────────────────────────────────────
// Public/non-sensitive params:
const AGORA_APP_ID = defineString('AGORA_APP_ID', {
  label: 'Agora App ID',
  description: 'Agora.io project App ID (public).',
  input: { text: { example: 'your-agora-app-id' } },
});

// Server-only secret — NEVER exposed to the client.
const AGORA_APP_CERTIFICATE = defineSecret('AGORA_APP_CERTIFICATE');

// Token lifetime in seconds. Default: 12 hours (max safe window before
// auto-renew kicks in from the client). Can be overridden via env.
const AGORA_TOKEN_TTL_SEC = defineString('AGORA_TOKEN_TTL_SEC', {
  label: 'Agora Token TTL (seconds)',
  description: 'How long a minted RTC token remains valid.',
  default: '43200', // 12h
});

// Allowed CORS origins. Comma-separated list.
// The Hosting rewrite proxies through same-origin so this is only hit if the
// endpoint is called directly.
const ALLOWED_CORS_ORIGINS = defineString('ALLOWED_CORS_ORIGINS', {
  label: 'Allowed CORS origins (comma-separated)',
  description: 'Origins allowed to call token endpoints directly.',
  default: '*',
});

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
  const allowList = ALLOWED_CORS_ORIGINS.value().split(',').map((s) => s.trim());
  const origin = req.headers.origin ?? '';
  const isAllowed = allowList.includes('*') || allowList.includes(origin);
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

// ─── Agora RTC Token Endpoint ───────────────────────────────────────────────
//
//   GET /api/agora-token?channel=<channel>&uid=<uid>
//   Headers: Authorization: Bearer <firebase-id-token>
//   → { token, uid, channelName, expireAt }
//
// Security:
//   * Endpoint requires a valid Firebase Auth ID token.
//   * App Certificate is read from Secret Manager (defineSecret binding),
//     never logged or returned.
//   * The requested `uid` must either be numeric and match the caller's
//     Firebase uid (converted to Agora's uint32), or explicitly match a
//     server-generated uid derived from the Firebase uid.
//   * Channel names are restricted to 64 chars of safe chars.
export const agoraToken = onRequest(
  {
    secrets: [AGORA_APP_CERTIFICATE],
    memory: '256MiB',
    timeoutSeconds: 15,
    invoker: 'public', // Hit via Hosting rewrite; Hosting itself is public.
  },
  async (req, res) => {
    // CORS / preflight.
    if (applyCors(req as any, res as any)) return;

    // JSON responses only.
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // Never cache auth-gated tokens.
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');

    // 1. Authenticate the caller.
    const callerUid = await requireAuthenticatedUser(req as any, res as any);
    if (!callerUid) return;

    // 2. Validate inputs.
    const channel = String(req.query.channel ?? '').trim();
    const rawUid = String(req.query.uid ?? '').trim();

    if (!channel) {
      res.status(400).json({ error: 'MISSING_CHANNEL', message: '`channel` query param required.' });
      return;
    }
    if (channel.length > 64 || !/^[A-Za-z0-9_\-+=!@#$%&*()\[\]{}|.:;<>,?~^]+$/.test(channel)) {
      res.status(400).json({
        error: 'INVALID_CHANNEL',
        message: '`channel` must be 1-64 URL-safe characters.',
      });
      return;
    }

    // If uid is empty, derive one deterministically from the authenticated
    // user id so the client doesn't have to pass one (simpler). If the client
    // DOES pass a uid, it must be the SAME as the derived uid (prevents
    // user A from minting a token as user B).
    const expectedUid = userIdToAgoraUid(callerUid);
    const uid = rawUid ? Number(rawUid) : expectedUid;
    if (!Number.isFinite(uid) || uid <= 0 || uid >= 0xffffffff) {
      res.status(400).json({
        error: 'INVALID_UID',
        message: '`uid` must be a uint32 (> 0, < 2^32).',
      });
      return;
    }
    if (uid !== expectedUid) {
      res.status(403).json({
        error: 'UID_MISMATCH',
        message: 'Requested uid does not match authenticated user.',
        expected: expectedUid,
      });
      return;
    }

    // 3. Mint the token.
    const appId = AGORA_APP_ID.value();
    const appCertificate = AGORA_APP_CERTIFICATE.value();
    const ttlSeconds = Math.max(60, Number(AGORA_TOKEN_TTL_SEC.value()) || 43200);

    if (!appId || !appCertificate) {
      res.status(500).json({
        error: 'AGORA_NOT_CONFIGURED',
        message: 'Server is missing Agora credentials.',
      });
      return;
    }

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channel,
      uid,
      RtcRole.PUBLISHER,
      Math.floor(Date.now() / 1000) + ttlSeconds,
    );

    const expireAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    res.status(200).json({
      token,
      rtcToken: token,
      uid,
      channelName: channel,
      expireAt,
      ttlSeconds,
    });
  },
);

// ─── Misc utils ──────────────────────────────────────────────────────────────

/**
 * Derives a deterministic Agora uint32 uid from an authenticated user id
 * string (Supabase user id or Firebase uid, prefixed by provider).
 *
 * Agora requires numeric uids; auth user ids are opaque strings. We use a
 * FNV-1a style 32-bit hash and clamp to the safe non-zero range. Collisions
 * are astronomically unlikely (the entire user base lives on the same 32-bit
 * number space; duplicates would mean one pair of users cannot be in the
 * same call — but this is rare enough that production apps with 1M+ users
 * still use this pattern).
 */
function userIdToAgoraUid(userId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Ensure positive uint32 and non-zero.
  let n = hash >>> 0;
  if (n === 0) n = 1;
  return n;
}
