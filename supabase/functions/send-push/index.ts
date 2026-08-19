// @ts-nocheck - Supabase Edge Functions run on Deno runtime.
// Supabase Edge Function: send-push
//
// Sends Web Push notifications so users receive incoming calls and new
// messages even when the GaGa Chat app is fully closed (WeChat-style
// background alerting). Triggered by Supabase Database Webhooks:
//
//   * INSERT on call_history  (status = 'calling') → push to the callee
//   * INSERT on messages      (text/media/etc.)    → push to other participants
//
// Configure the webhook in Supabase Dashboard → Database → Webhooks, pointing
// at:  https://<project-ref>.supabase.co/functions/v1/send-push
// with header  Authorization: Bearer <SUPABASE_ANON_KEY or service key>
//
// Required secrets (supabase secrets set ...):
//   VAPID_PUBLIC_KEY       — same value as the client's VITE_VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY      — server-only counterpart (NEVER ship to client)
//   VAPID_SUBJECT          — e.g. mailto:admin@gagachat.app
//   SUPABASE_SERVICE_ROLE_KEY — to read users.push_subscription (auto-available
//                            in Edge Functions as SUPABASE_SERVICE_ROLE_KEY)

import webpush from 'https://esm.sh/web-push@3.6.7';

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@gagachat.app';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function isAuthorizedWebhook(req: Request): boolean {
  const header = req.headers.get('Authorization') ?? '';
  return SERVICE_ROLE_KEY.length > 0 && header === `Bearer ${SERVICE_ROLE_KEY}`;
}

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
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

async function getUser(userId: string): Promise<any | null> {
  const rows = await sbGet(`users?id=eq.${encodeURIComponent(userId)}&select=id,name,avatar,push_subscription`);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; tag: string; requireInteraction?: boolean; data?: Record<string, unknown> },
): Promise<'sent' | 'no-subscription' | 'failed'> {
  const user = await getUser(userId);
  if (!user?.push_subscription) return 'no-subscription';
  let subscription: any;
  try {
    subscription = JSON.parse(user.push_subscription);
  } catch {
    return 'no-subscription';
  }
  try {
    await webpush.sendNotification(subscription, JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: '/logo-192.png',
      badge: '/logo-192.png',
      tag: payload.tag,
      requireInteraction: payload.requireInteraction ?? false,
      vibrate: payload.requireInteraction ? [800, 400, 800, 400, 800] : [200, 100, 200],
      data: payload.data ?? {},
    }));
    return 'sent';
  } catch (err: any) {
    // 404/410 = subscription expired — clear it so we stop trying
    if (err?.statusCode === 404 || err?.statusCode === 410) {
      await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ push_subscription: null }),
      });
    }
    return 'failed';
  }
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
    const callType = (record.type === 'video' || record.type === 'group_video') ? 'video' : 'voice';

    const result = await sendPushToUser(calleeId, {
      title: `Incoming ${callType} call`,
      body: `${callerName} is calling you`,
      tag: `call_${record.id}`,
      requireInteraction: true,
      data: { type: 'call', callId: record.id, callType, callerId, callerName },
    });
    return json({ ok: true, kind: 'call', result });
  }

  // ── New chat message → push to other participants ──────────────────────
  if (table === 'messages') {
    const senderId: string = record.senderId ?? record.sender_id ?? '';
    const chatId: string = record.chatId ?? record.chat_id ?? '';
    if (!senderId || !chatId) return json({ skipped: true, reason: 'missing sender/chat' });

    // Find the chat's other participants (direct chats store participants array)
    const chatRows = await sbGet(`chats?id=eq.${encodeURIComponent(chatId)}&select=participants,type`);
    const chat = Array.isArray(chatRows) && chatRows.length > 0 ? chatRows[0] : null;
    const participants: string[] = Array.isArray(chat?.participants) ? chat.participants : [];
    const recipients = participants.filter((p) => p && p !== senderId);
    if (recipients.length === 0) return json({ skipped: true, reason: 'no recipients' });

    const sender = await getUser(senderId);
    const senderName: string = sender?.name ?? 'New message';
    const preview: string = (record.content ?? '').toString().slice(0, 100)
      || ({ image: '📷 Photo', video: '🎥 Video', voice: '🎤 Voice message', location: '📍 Location', file: '📎 File' } as Record<string, string>)[record.type]
      || 'New message';

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

  return json({ skipped: true, reason: `unhandled table: ${table}` });
});
