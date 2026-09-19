// @ts-nocheck - Supabase Edge Functions run on Deno runtime.
// Supabase Edge Function: send-push
//
// Unified Web Push dispatcher. Sends encrypted Web Push notifications so users
// receive incoming calls, new messages, and app notifications even when the
// GaGa Chat app is fully closed (WeChat-style background alerting).
//
// Triggered by Supabase Database Webhooks (AFTER INSERT):
//   * public.call_history  (status = 'calling') → push to the callee
//   * public.messages      (any type)           → push to other participants
//   * public.notifications (any type)           → push to the recipient
//
// Webhook target:
//   https://<project-ref>.supabase.co/functions/v1/send-push
//   header: x-webhook-secret: <WEBHOOK_SECRET>
//   (or)   Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
//
// Required secrets:
//   VAPID_PUBLIC_KEY          — 65-byte uncompressed P-256 point, base64url
//   VAPID_PRIVATE_KEY         — 32-byte scalar, base64url
//   VAPID_SUBJECT             — e.g. mailto:admin@gagachat.app
//   WEBHOOK_SECRET            — shared secret configured on the DB webhook
//   SUPABASE_SERVICE_ROLE_KEY — auto-available in Edge Functions
//
// Subscriptions are read from BOTH:
//   * public.user_devices.push_subscription (multi-device, preferred)
//   * public.users.push_subscription        (legacy single-device fallback)

import webpush from 'https://esm.sh/web-push@3.6.7';

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@gagachat.app';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? '';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  } catch (err) {
    console.error('[send-push] Invalid VAPID configuration:', err);
  }
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function isAuthorizedWebhook(req: Request): boolean {
  const secretHeader = req.headers.get('x-webhook-secret') ?? '';
  if (WEBHOOK_SECRET && secretHeader === WEBHOOK_SECRET) return true;
  const authHeader = req.headers.get('Authorization') ?? '';
  if (SERVICE_ROLE_KEY && authHeader === `Bearer ${SERVICE_ROLE_KEY}`) return true;
  return false;
}

async function sbGet(path: string): Promise<any> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  if (!resp.ok) return null;
  return resp.json();
}

async function sbPatch(path: string, body: Record<string, unknown>): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
}

async function getUser(userId: string): Promise<any | null> {
  const rows = await sbGet(
    `users?id=eq.${encodeURIComponent(userId)}&select=id,name,avatar,push_subscription`,
  );
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function parseSubscription(value: unknown): any | null {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Collect every active push subscription for a user across all their devices.
 * Returns an array of { subscription, deviceId } entries.
 */
async function getSubscriptionsForUser(
  userId: string,
): Promise<Array<{ subscription: any; deviceId: string | null }>> {
  const out: Array<{ subscription: any; deviceId: string | null }> = [];

  // 1) Multi-device table (preferred)
  const devices = await sbGet(
    `user_devices?user_id=eq.${encodeURIComponent(userId)}&push_subscription=not.is.null&revoked_at=is.null&select=id,push_subscription`,
  );
  if (Array.isArray(devices)) {
    for (const d of devices) {
      const sub = parseSubscription(d.push_subscription);
      if (sub) out.push({ subscription: sub, deviceId: d.id ?? null });
    }
  }

  // 2) Legacy single-device column (fallback)
  if (out.length === 0) {
    const user = await getUser(userId);
    const sub = parseSubscription(user?.push_subscription);
    if (sub) out.push({ subscription: sub, deviceId: null });
  }

  return out;
}

async function sendPushToUser(
  userId: string,
  payload: {
    title: string;
    body: string;
    tag: string;
    requireInteraction?: boolean;
    data?: Record<string, unknown>;
  },
): Promise<'sent' | 'no-subscription' | 'failed'> {
  const subs = await getSubscriptionsForUser(userId);
  if (subs.length === 0) return 'no-subscription';

  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: '/logo-192.png',
    badge: '/logo-192.png',
    tag: payload.tag,
    requireInteraction: payload.requireInteraction ?? false,
    vibrate: payload.requireInteraction ? [800, 400, 800, 400, 800] : [200, 100, 200],
    data: payload.data ?? {},
  });

  let anySent = false;
  for (const { subscription, deviceId } of subs) {
    try {
      await webpush.sendNotification(subscription, message, { TTL: 60, urgency: 'high' });
      anySent = true;
    } catch (err: any) {
      // 404/410 = subscription expired — clear it so we stop trying.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        if (deviceId) {
          await sbPatch(`user_devices?id=eq.${encodeURIComponent(deviceId)}`, {
            push_subscription: null,
            revoked_at: new Date().toISOString(),
          });
        } else {
          await sbPatch(`users?id=eq.${encodeURIComponent(userId)}`, {
            push_subscription: null,
          });
        }
      } else {
        console.error('[send-push] delivery failed', err?.statusCode, err?.body ?? err?.message);
      }
    }
  }
  return anySent ? 'sent' : 'failed';
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  if (!isAuthorizedWebhook(req)) return json({ error: 'UNAUTHORIZED' }, 401);
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return json({ error: 'VAPID_NOT_CONFIGURED' }, 500);
  }

  let event: any;
  try {
    event = await req.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  const table: string = event?.table ?? '';
  const record: any = event?.record ?? {};
  if (event?.type !== 'INSERT' || !record?.id) {
    return json({ skipped: true, reason: 'not an INSERT with record' });
  }

  // ── Incoming call → push to callee ──────────────────────────────────────
  if (table === 'call_history') {
    if (record.status !== 'calling') return json({ skipped: true, reason: 'not ringing' });
    const calleeId: string = record.callee_id ?? record.calleeId ?? record.callee ?? '';
    const callerId: string = record.caller_id ?? record.callerId ?? record.caller ?? '';
    if (!calleeId) return json({ skipped: true, reason: 'no callee' });

    const caller = callerId ? await getUser(callerId) : null;
    const callerName: string = caller?.name ?? 'Someone';
    const callType = record.type === 'video' || record.type === 'group_video' ? 'video' : 'voice';

    const result = await sendPushToUser(calleeId, {
      title: `Incoming ${callType} call`,
      body: `${callerName} is calling you`,
      tag: `call_${record.id}`,
      requireInteraction: true,
      data: { type: 'incoming_call', callId: record.id, callType, callerId, callerName },
    });
    return json({ ok: true, kind: 'call', result });
  }

  // ── New chat message → push to other participants ───────────────────────
  if (table === 'messages') {
    const senderId: string = record.sender_id ?? record.senderId ?? '';
    const chatId: string = record.chat_id ?? record.chatId ?? '';
    if (!senderId || !chatId) return json({ skipped: true, reason: 'missing sender/chat' });

    const chatRows = await sbGet(
      `chats?id=eq.${encodeURIComponent(chatId)}&select=participants,type`,
    );
    const chat = Array.isArray(chatRows) && chatRows.length > 0 ? chatRows[0] : null;
    const participants: string[] = Array.isArray(chat?.participants) ? chat.participants : [];
    const recipients = participants.filter((p) => p && p !== senderId);
    if (recipients.length === 0) return json({ skipped: true, reason: 'no recipients' });

    const sender = await getUser(senderId);
    const senderName: string = sender?.name ?? 'New message';
    const preview: string =
      (record.content ?? '').toString().slice(0, 100) ||
      ({
        image: '📷 Photo',
        video: '🎥 Video',
        voice: '🎤 Voice message',
        location: '📍 Location',
        file: '📎 File',
      } as Record<string, string>)[record.type] ||
      'New message';

    const results: Record<string, string> = {};
    for (const rid of recipients) {
      results[rid] = await sendPushToUser(rid, {
        title: senderName,
        body: preview,
        tag: `msg_${chatId}`,
        data: { type: 'message', chatId, userId: senderId, senderName },
      });
    }
    return json({ ok: true, kind: 'message', results });
  }

  // ── App notification → push to recipient ────────────────────────────────
  if (table === 'notifications') {
    const userId: string = record.user_id ?? record.userId ?? '';
    if (!userId) return json({ skipped: true, reason: 'no recipient' });

    const result = await sendPushToUser(userId, {
      title: (record.title ?? 'GaGa Chat').toString().slice(0, 120),
      body: (record.body ?? 'You have a new notification').toString().slice(0, 200),
      tag: `notification_${record.id}`,
      data: {
        type: record.type ?? 'notification',
        notificationId: record.id,
        ...(record.data && typeof record.data === 'object' ? record.data : {}),
      },
    });
    return json({ ok: true, kind: 'notification', result });
  }

  return json({ skipped: true, reason: `unhandled table: ${table}` });
});
