// @ts-nocheck — Supabase Edge Functions run on Deno.
// Must be invoked ONLY by a trusted scheduler with service_role bearer JWT.
// Do not expose it to Android clients or set hybrid transport ON by default.
import { createWorker } from './worker.mjs';

const url = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ready = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) && service.length >= 12;
const headers = {
  apikey: service,
  Authorization: `Bearer ${service}`,
  'Content-Type': 'application/json',
};

async function rpc(name: string, params: Record<string, unknown>) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST', headers,
    body: JSON.stringify(params), signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw Error('RPC_UNAVAILABLE');
  return res.json();
}

const worker = createWorker({
  serviceKey: service,
  maxBatch: 3,
  claim: count => rpc('gaga_claim_chat_mirror_sync', { p_limit: count }),
  reconcileChat: async chatId => {
    const res = await fetch(`${url}/functions/v1/trusted-chat-mirror`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ chat_id: chatId }),
      signal: AbortSignal.timeout(70000),
    });
    let body;
    try { body = await res.json(); } catch { body = {}; }
    const acceptable = new Set([
      'created', 'updated', 'unchanged', 'absent', 'revoked',
      'already_revoked', 'newer_mirror_kept',
    ]);
    return {
      ok: res.ok && acceptable.has(body?.status),
      error: res.ok ? 'INVALID_PROJECTION_RESULT' : body?.error || 'MIRROR_UNAVAILABLE',
    };
  },
  finish: (job, success, code) => rpc('gaga_finish_chat_mirror_sync', {
    p_chat_id: job.chat_id,
    p_revision: job.revision,
    p_lease_token: job.lease_token,
    p_success: success,
    p_error_code: success ? null : code,
  }),
});

Deno.serve(request => {
  if (!ready) {
    return Response.json({ error: 'MIRROR_WORKER_NOT_CONFIGURED' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  }
  return worker(request);
});
