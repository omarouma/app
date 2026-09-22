// @ts-nocheck - Supabase Edge Functions run on Deno runtime.
// Supabase Edge Function: send-push
//
// Sends push notifications so users receive incoming calls and new messages
// even when the GaGa Chat app is fully closed (WeChat-style background
// alerting). Two delivery channels are supported and auto-detected from the
// stored token envelope:
//
//   * Native (Android/iOS) → Firebase Cloud Messaging HTTP v1
//     token stored as  {"kind":"fcm","platform":"android","token":"..."}
//   * Web (PWA)            → Web Push (VAPID)
//     token stored as a raw PushSubscription JSON object
//
// Triggered by Supabase Database Webhooks:
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
//   FCM_SERVICE_ACCOUNT_JSON — the Firebase service-account JSON (string) used
//                            to mint FCM HTTP v1 access tokens (native push)
//   SUPABASE_SERVICE_ROLE_KEY — to read users.push_subscription (auto-available
//                            in Edge Functions as SUPABASE_SERVICE_ROLE_KEY)

import webpush from 'https://esm.sh/web-push@3.6.7';

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@gagachat.app';
const FCM_SERVICE_ACCOUNT_JSON = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function isAuthorizedWebhook(req: Request): boolean {
  const header = req.headers.get('Authorization') ?? '';
  return SERVICE_ROLE_KEY.length > 0 && header === `Bearer ${SERVICE_ROLE_KEY}`;
}

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// ---------------------------------------------------------------------------
// FCM HTTP v1 (native Android/iOS)
// ---------------------------------------------------------------------------

let fcmServiceAccount: { client_email: string; private_key: string; project_id: string } | null = null;
let fcmAccessToken: { token: string; expiresAt: number } | null = null;

function getFcmServiceAccount() {
  if (fcmServiceAccount) return fcmServiceAccount;
  if (!FCM_SERVICE_ACCOUNT_JSON) return null;
  try {
    const parsed = JSON.parse(FCM_SERVICE_ACCOUNT_JSON);
    if (parsed?.client_email && parsed?.private_key && parsed?.project_id) {
      fcmServiceAccount = parsed;
      return fcmServiceAccount;
    }
  } catch { /* ignore */ }
  return null;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const raw = atob(body);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Mints (and caches) an OAuth2 access token for FCM HTTP v1. */
async function getFcmAccessToken(): Promise<string | null> {
  const sa = getFcmServiceAccount();
  if (!sa) return null;
  const now = Math.floor(Date.now() / 1000);
  if (fcmAccessToken && fcmAccessToken.expiresAt - 60 > now) return fcmAccessToken.token;

  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const enc = new TextEncoder();
  const unsigned = `${base64UrlEncode(enc.encode(JSON.stringify(header)))}.${base64UrlEncode(enc.encode(JSON.stringify(claim)))}`;

  try {
    const key = await crypto.subtle.importKey(
      'pkcs8',
      pemToPkcs8(sa.private_key),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(unsigned));
    const jwt = `${unsigned}.${base64UrlEncode(new Uint8Array(sig))}`;

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data?.access_token) return null;
    fcmAccessToken = { token: data.access_token, expiresAt: now + (data.expires_in ?? 3600) };
    return fcmAccessToken.token;
  } catch {
    return null;
  }
}

/** Sends a data+notification message via FCM HTTP v1. */
async function sendFcm(
  token: string,
  payload: { title: string; body: string; tag: string; requireInteraction?: boolean; data?: Record<string, unknown> },
): Promise<'sent' | 'failed' | 'not-configured'> {
  const sa = getFcmServiceAccount();
  if (!sa) return 'not-configured';
  const accessToken = await getFcmAccessToken();
  if (!accessToken) return 'failed';

  const isCall = payload.requireInteraction === true;
  const body = {
    message: {
      token,
      notification: { title: payload.title, body: payload.body },
      data: Object.fromEntries(
        Object.entries(payload.data ?? {}).map(([k, v]) => [k, String(v)]),
      ),
      android: {
        priority: isCall ? 'HIGH' : 'NORMAL',
        notification: {
          channel_id: isCall ? 'gaga_calls' : 'gaga_messages',
          tag: payload.tag,
          sound: 'default',
          default_vibrate_timings: true,
        },
      },
      apns: {
        headers: { 'apns-priority': isCall ? '10' : '5' },
        payload: { aps: { sound: 'default', badge: 1, 'content-available': 1 } },
      },
    },
  };

  try {
    const resp = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    return resp.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
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
  let stored: any;
  try {
    stored = JSON.parse(user.push_subscription);
  } catch {
    return 'no-subscription';
  }

  // ── Native FCM token envelope ──
  if (stored?.kind === 'fcm' && stored?.token) {
    const result = await sendFcm(stored.token, payload);
    if (result === 'not-configured') {
      // FCM not configured server-side — fall through to Web Push (no-op for a
      // native token, but keeps behaviour predictable).
      return 'failed';
    }
    return result === 'sent' ? 'sent' : 'failed';
  }

  // ── Web Push (VAPID) subscription ──
  try {
    await webpush.sendNotification(stored, JSON.stringify({
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
  if (!VAPID_PUBLIC_KEY && !VAPID_PRIVATE_KEY && !FCM_SERVICE_ACCOUNT_JSON) {
    return json({ error: 'PUSH_NOT_CONFIGURED' }, 500);
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
