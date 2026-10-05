// @ts-nocheck - Supabase Edge Functions run on the Deno runtime.
// Supabase Edge Function: send-fcm-push
//
// Internal push dispatcher. Called by create-call and (later) by the message
// pipeline. It is service-role only and guarantees ONE push per event id, so a
// retried send never double-notifies the recipient.
//
//   POST { user_id, type, title?, body?, data?, event_id? }
//        Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
//
// Deploy with:
//   supabase functions deploy send-fcm-push --no-verify-jwt

import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { isServiceRequest, serviceHeaders } from '../_shared/auth.ts';
import { firebaseAdminConfigured, sendFcm } from '../_shared/firebaseAdmin.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

interface DeviceRow {
  push_token?: string;
  platform?: string;
}

/** Claims the event id; returns false when it was already delivered. */
async function claimEvent(eventId: string, userId: string, kind: string): Promise<boolean> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/push_deliveries`, {
    method: 'POST',
    headers: serviceHeaders({ Prefer: 'resolution=ignore-duplicates,return=representation' }),
    body: JSON.stringify({ event_id: eventId, user_id: userId, kind }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return false;
  const rows = (await response.json()) as unknown[];
  return Array.isArray(rows) && rows.length > 0;
}

async function loadDevices(userId: string): Promise<string[]> {
  const query = new URL(`${SUPABASE_URL}/rest/v1/user_devices`);
  query.searchParams.set('user_id', `eq.${userId}`);
  query.searchParams.set('select', 'push_token,platform');
  query.searchParams.set('push_token', 'not.is.null');
  const response = await fetch(query, {
    headers: serviceHeaders(),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return [];
  const rows = (await response.json()) as DeviceRow[];
  return rows.map((row) => row.push_token ?? '').filter(Boolean);
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse(req, { error: 'METHOD_NOT_ALLOWED' }, 405);

  if (!SUPABASE_SERVICE_ROLE_KEY || !isServiceRequest(req)) {
    return jsonResponse(req, { error: 'FORBIDDEN', message: 'Internal endpoint.' }, 403);
  }
  if (!firebaseAdminConfigured()) {
    return jsonResponse(req, { error: 'FIREBASE_NOT_CONFIGURED' }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse(req, { error: 'INVALID_JSON' }, 400);
  }

  const userId = typeof body.user_id === 'string' ? body.user_id.trim() : '';
  const type = typeof body.type === 'string' ? body.type : 'message';
  if (!userId) return jsonResponse(req, { error: 'INVALID_REQUEST' }, 400);

  // Derive a stable event id when the caller did not supply one.
  const eventId =
    (typeof body.event_id === 'string' && body.event_id) ||
    `${type}:${userId}:${String(body.call_id ?? body.message_id ?? body.id ?? Date.now())}`;

  // Notification content.
  const isCall = type === 'call';
  const callType = typeof body.call_type === 'string' ? body.call_type : 'voice';
  const title =
    (typeof body.title === 'string' && body.title) ||
    (typeof body.caller_name === 'string' && body.caller_name) ||
    'GaGa';
  const text =
    (typeof body.body === 'string' && body.body) ||
    (isCall ? `Incoming ${callType} call` : 'New message');

  // Data payload (FCM requires string values).
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    if (['title', 'body', 'event_id', 'user_id', 'data'].includes(key)) continue;
    if (value === null || value === undefined) continue;
    data[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  if (typeof body.data === 'object' && body.data) {
    for (const [key, value] of Object.entries(body.data as Record<string, unknown>)) {
      if (value === null || value === undefined) continue;
      data[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
  }

  try {
    const claimed = await claimEvent(eventId, userId, type);
    if (!claimed) {
      return jsonResponse(req, { sent: 0, failed: 0, deduped: true, event_id: eventId });
    }

    const tokens = await loadDevices(userId);
    if (tokens.length === 0) {
      return jsonResponse(req, { sent: 0, failed: 0, deduped: false, devices: 0, event_id: eventId });
    }

    const channelId = isCall ? 'gaga_calls' : 'gaga_messages';
    const results = await Promise.all(
      tokens.map((token) => sendFcm(token, { title, body: text }, data, channelId)),
    );
    const sent = results.filter(Boolean).length;
    return jsonResponse(req, {
      sent,
      failed: results.length - sent,
      deduped: false,
      devices: tokens.length,
      event_id: eventId,
    });
  } catch {
    return jsonResponse(req, { error: 'PUSH_DISPATCH_FAILED' }, 503);
  }
});
