/** Internal outbox worker logic; pure and testable without network credentials. */
import { trustedRequest } from '../trusted-chat-mirror/mirror.mjs';

export function createWorker({ serviceKey, claim, reconcileChat, finish, maxBatch = 3 }) {
  return async request => {
    const reply = (data, status = 200) => Response.json(data, {
      status, headers: { 'Cache-Control': 'no-store' },
    });
    if (request.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405);
    if (!serviceKey || serviceKey.length < 12) return reply({ error: 'NOT_CONFIGURED' }, 503);
    if (!trustedRequest(request.headers, serviceKey)) return reply({ error: 'UNAUTHORIZED' }, 401);
    let body;
    try {
      const raw = await request.text();
      if (raw.length > 128) return reply({ error: 'INVALID_REQUEST' }, 400);
      body = raw ? JSON.parse(raw) : {};
    } catch { return reply({ error: 'INVALID_JSON' }, 400); }
    if (!body || Array.isArray(body) || typeof body !== 'object' ||
        Object.keys(body).some(k => k !== 'max_items') ||
        (body.max_items !== undefined &&
          (!Number.isInteger(body.max_items) || body.max_items < 1 || body.max_items > maxBatch))) {
      return reply({ error: 'INVALID_REQUEST' }, 400);
    }
    const size = body.max_items || maxBatch;
    let jobs;
    try {
      jobs = await claim(size);
      if (!Array.isArray(jobs) || jobs.length > size) throw Error('INVALID_CLAIM_BATCH');
    } catch {
      return reply({ error: 'OUTBOX_UNAVAILABLE' }, 503);
    }
    const results = await Promise.all(jobs.map(async job => {
      const valid = job && typeof job.chat_id === 'string' &&
        Number.isSafeInteger(job.revision) && job.revision > 0 &&
        typeof job.lease_token === 'string';
      if (!valid) return { ok: false, acknowledged: false };
      let ok = false, error = 'PROVISIONING_UNAVAILABLE';
      try {
        const result = await reconcileChat(job.chat_id);
        ok = result.ok === true;
        if (!ok && /^[A-Z_]{3,64}$/.test(result.error || '')) error = result.error;
      } catch { /* no secrets or Supabase data in logs */ }
      try {
        const acknowledged = await finish(job, ok, error);
        return { ok, acknowledged: acknowledged === true };
      } catch {
        // Lease expiry lets a future run retry. Never delete an unacknowledged
        // row or print chat IDs/secret values into logs.
        return { ok: false, acknowledged: false };
      }
    }));
    return reply({
      claimed: jobs.length,
      synced: results.filter(x => x.ok && x.acknowledged).length,
      retryable: results.filter(x => !x.ok && x.acknowledged).length,
      unacknowledged: results.filter(x => !x.acknowledged).length,
    }, results.some(x => !x.acknowledged) ? 503 : 200);
  };
}
