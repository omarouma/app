// @ts-nocheck - Supabase Edge Functions run on the Deno runtime.
// Supabase Edge Function: media-auth
//
// Authorizes access to a Supabase Storage object using the caller's Firebase
// identity AND their conversation membership, then returns a short-lived signed
// URL. This is what makes chat media private instead of world-readable.
//
//   POST { bucket, path, action?, chat_id?, expires_in? }
//        Authorization: Bearer <Firebase ID token | Supabase access token>
//
//   action = "download" (default) -> { url, expires_in }
//   action = "upload"             -> { upload_url, path }
//   action = "authorize"          -> { allowed: true }
//
// Access model:
//   * public buckets (avatars, posts, stories, reels) are readable by any
//     verified account;
//   * private buckets (chat-media, voice-messages) require membership of the
//     conversation named by the path (or an explicit chat_id), or ownership of
//     the `{gagaUserId}/...` prefix;
//   * everything else is denied.
//
// Deploy with:
//   supabase functions deploy media-auth --no-verify-jwt

import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { resolveVerifiedIdentity, isChatMember, serviceHeaders } from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

const PUBLIC_BUCKETS = new Set(['avatars', 'posts', 'stories', 'reels', 'group-icons']);
const PRIVATE_BUCKETS = new Set(['chat-media', 'voice-messages', 'media']);
const MAX_EXPIRES = 60 * 60; // 1 hour

function cleanPath(path: string): string {
  return path
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .join('/');
}

async function createSignedUrl(bucket: string, path: string, expiresIn: number) {
  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${path}`,
    {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify({ expiresIn }),
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok) return null;
  const body = (await response.json()) as { signedURL?: string };
  if (!body.signedURL) return null;
  return `${SUPABASE_URL}/storage/v1${body.signedURL}`;
}

async function createSignedUploadUrl(bucket: string, path: string) {
  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${path}`,
    {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok) return null;
  const body = (await response.json()) as { url?: string };
  if (!body.url) return null;
  return `${SUPABASE_URL}/storage/v1${body.url}`;
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse(req, { error: 'METHOD_NOT_ALLOWED' }, 405);

  const identity = await resolveVerifiedIdentity(req);
  if (!identity) {
    return jsonResponse(
      req,
      { error: 'UNAUTHORIZED', message: 'A verified account is required.' },
      401,
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse(req, { error: 'INVALID_JSON' }, 400);
  }

  const bucket = typeof body.bucket === 'string' ? body.bucket.trim() : '';
  const rawPath = typeof body.path === 'string' ? body.path.trim() : '';
  const action = typeof body.action === 'string' ? body.action : 'download';
  const expiresIn = Math.min(
    MAX_EXPIRES,
    Math.max(60, Number(body.expires_in) || 900),
  );

  if (!bucket || !rawPath || rawPath.length > 1024) {
    return jsonResponse(req, { error: 'INVALID_REQUEST' }, 400);
  }
  if (!['download', 'upload', 'authorize'].includes(action)) {
    return jsonResponse(req, { error: 'INVALID_ACTION' }, 400);
  }

  const path = cleanPath(rawPath);
  const segments = path.split('/');

  // 1) Public buckets: any verified account may read.
  if (PUBLIC_BUCKETS.has(bucket)) {
    if (action === 'authorize') return jsonResponse(req, { allowed: true });
    if (action === 'upload') {
      if (segments[0] !== identity.gagaUserId) {
        return jsonResponse(req, { error: 'FORBIDDEN' }, 403);
      }
      const uploadUrl = await createSignedUploadUrl(bucket, path);
      if (!uploadUrl) return jsonResponse(req, { error: 'SIGN_FAILED' }, 502);
      return jsonResponse(req, { upload_url: uploadUrl, path });
    }
    const url = await createSignedUrl(bucket, path, expiresIn);
    if (!url) return jsonResponse(req, { error: 'SIGN_FAILED' }, 502);
    return jsonResponse(req, { url, expires_in: expiresIn });
  }

  // 2) Private buckets: membership or ownership required.
  if (!PRIVATE_BUCKETS.has(bucket)) {
    return jsonResponse(req, { error: 'FORBIDDEN', message: 'Unknown bucket.' }, 403);
  }

  const explicitChatId = typeof body.chat_id === 'string' ? body.chat_id.trim() : '';
  const isOwner = segments[0] === identity.gagaUserId;
  // New layout: {chatId}/{messageId}/{file}. Legacy layout: {userId}/...
  const chatId = explicitChatId || segments[0];

  let allowed = isOwner;
  if (!allowed && chatId && chatId !== identity.gagaUserId) {
    allowed = await isChatMember(identity.gagaUserId, chatId);
  }
  if (!allowed) return jsonResponse(req, { error: 'FORBIDDEN' }, 403);

  if (action === 'authorize') return jsonResponse(req, { allowed: true });

  if (action === 'upload') {
    const uploadUrl = await createSignedUploadUrl(bucket, path);
    if (!uploadUrl) return jsonResponse(req, { error: 'SIGN_FAILED' }, 502);
    return jsonResponse(req, { upload_url: uploadUrl, path });
  }

  const url = await createSignedUrl(bucket, path, expiresIn);
  if (!url) return jsonResponse(req, { error: 'SIGN_FAILED' }, 502);
  return jsonResponse(req, { url, expires_in: expiresIn });
});
