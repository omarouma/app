/**
 * GaGa's trusted, service-only Supabase → Firestore chat membership projection.
 *
 * No user-supplied participants/type; no client-admin capabilities. This pure
 * module can be tested with in-memory doubles. Production adapters live in
 * index.ts, and Firebase hybrid transport remains OFF by default.
 */
export const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_:-]{0,127}$/;
export const UID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_MEMBERS = 1000;
export const MAX_ATTEMPTS = 4;

export class ProjectionError extends Error {
  constructor(code, status = 503) {
    super(code);
    this.name = 'ProjectionError';
    this.code = code;
    this.status = status;
  }
}

function stampNano(value) {
  if (typeof value !== 'string') throw new ProjectionError('INVALID_SOURCE_VERSION');
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) throw new ProjectionError('INVALID_SOURCE_VERSION');
  const time = Date.parse(match[1] + match[3]);
  if (!Number.isFinite(time)) throw new ProjectionError('INVALID_SOURCE_VERSION');
  return BigInt(time) * 1000000n + BigInt((match[2] || '').padEnd(9, '0'));
}

export function normalizeAuthoritativeChat(chatId, record) {
  if (!record || record.id !== chatId) throw new ProjectionError('SOURCE_ID_MISMATCH');
  if (!['direct', 'group'].includes(record.type)) throw new ProjectionError('UNKNOWN_SOURCE_CHAT_TYPE');
  if (!Array.isArray(record.participants) || !record.participants.length ||
      record.participants.length > MAX_MEMBERS ||
      record.participants.some(uid => typeof uid !== 'string' || !UID_PATTERN.test(uid))) {
    throw new ProjectionError('INVALID_SOURCE_PARTICIPANTS');
  }
  // Reject duplicate membership IDs. No caller may choose which members exist.
  const participants = [...new Set(record.participants.map(uid => uid.toLowerCase()))].sort();
  if (participants.length !== record.participants.length) {
    throw new ProjectionError('DUPLICATE_SOURCE_PARTICIPANTS');
  }
  stampNano(record.updated_at);
  return { id: chatId, type: record.type, participants, sourceUpdatedAt: record.updated_at, mirrorDeleted: false };
}

function isCurrent(current, source) {
  if (!current || current.mirrorDeleted) return false;
  if (current.type !== source.type || current.participants.length !== source.participants.length) return false;
  return current.participants.every((v, i) => v === source.participants[i]) &&
    stampNano(current.sourceUpdatedAt) >= stampNano(source.sourceUpdatedAt);
}

export function trustedRequest(headers, expectedServiceKey) {
  if (!expectedServiceKey || expectedServiceKey.length < 12) return false;
  return headers.get('Authorization') === `Bearer ${expectedServiceKey}`;
}

/**
 * Updates an existing Firestore document with a Firestore update-time CAS.
 * Creates using exists=false. Failed preconditions trigger a complete re-read
 * of Supabase AND Firebase. Monotonic source versions prevent stale projection
 * overwrites when concurrent events finish out of order.
 *
 * Missing Supabase chats become access-denying tombstones, never a client
 * recreated chat. Existing nested Firestore messages require a separate,
 * privacy-reviewed retention/cleanup process; this code does not delete them.
 */
export function makeReconciler({ loadChat, readMirror, writeMirror, clock = () => new Date().toISOString() }) {
  return async (chatId) => {
    if (!ID_PATTERN.test(chatId)) throw new ProjectionError('INVALID_CHAT_ID', 400);
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const row = await loadChat(chatId);
      // A failed Supabase query must THROW; null means a confirmed 200 [].
      const source = row === null ? null : normalizeAuthoritativeChat(chatId, row);
      const current = await readMirror(chatId); // returns null only on confirmed 404
      if (current?.mirrorDeleted) {
        if (!source) return { status: 'already_revoked', attempts: attempt + 1 };
        // Reusing a tombstoned chat ID must not resurrect access.
        throw new ProjectionError('CHAT_ID_TOMBSTONED', 409);
      }
      if (!source && !current) {
        return { status: 'absent', attempts: attempt + 1 };
      }
      if (source && isCurrent(current, source)) {
        return { status: 'unchanged', attempts: attempt + 1 };
      }
      // When an older event executes after a newer committed projection,
      // keep the newer doc. This compares PostgreSQL sub-millisecond stamps.
      if (source && current?.sourceUpdatedAt &&
          stampNano(current.sourceUpdatedAt) > stampNano(source.sourceUpdatedAt)) {
        return { status: 'newer_mirror_kept', attempts: attempt + 1 };
      }
      const desired = source ?? {
        id: chatId, participants: [], type: 'deleted',
        sourceUpdatedAt: clock(), mirrorDeleted: true,
      };
      const result = await writeMirror(chatId, desired, current?.updateTime ?? null);
      if (result === 'conflict') continue;
      if (result !== 'ok') throw new ProjectionError('MIRROR_WRITE_FAILED');
      return { status: source ? (current ? 'updated' : 'created') : 'revoked', attempts: attempt + 1 };
    }
    throw new ProjectionError('CONCURRENT_MIRROR_WRITE_RETRY', 409);
  };
}

export function createHandler({ serviceKey, reconcile }) {
  return async (request) => {
    const reply = (data, status = 200) => Response.json(data, {
      status, headers: { 'Cache-Control': 'no-store' },
    });
    if (request.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405);
    if (!serviceKey || serviceKey.length < 12) return reply({ error: 'NOT_CONFIGURED' }, 503);
    if (!trustedRequest(request.headers, serviceKey)) return reply({ error: 'UNAUTHORIZED' }, 401);
    let body;
    try {
      const length = Number(request.headers.get('content-length') || 0);
      if (length > 256) return reply({ error: 'INVALID_REQUEST' }, 400);
      const raw = await request.text();
      if (raw.length > 256) return reply({ error: 'INVALID_REQUEST' }, 400);
      body = JSON.parse(raw);
    } catch { return reply({ error: 'INVALID_JSON' }, 400); }
    // Strict one-field contract: never accept client-chosen memberships or
    // caller-defined Firebase project paths, and no body data goes in logs.
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).length !== 1 || !ID_PATTERN.test(body.chat_id ?? '')) {
      return reply({ error: 'INVALID_REQUEST' }, 400);
    }
    try {
      return reply(await reconcile(body.chat_id));
    } catch (error) {
      return reply({ error: error instanceof ProjectionError ? error.code : 'PROVISIONING_UNAVAILABLE' },
        error instanceof ProjectionError ? error.status : 503);
    }
  };
}
