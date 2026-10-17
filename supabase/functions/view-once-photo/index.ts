import { matchesPhoto, readBounded, uuid } from './security.mjs';

const url = Deno.env.get('SUPABASE_URL')!;
const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const bucket = 'gaga-view-once';
const noStore = { 'Cache-Control': 'private, no-store, max-age=0', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...noStore, 'Content-Type': 'application/json' } });

async function rpc(name: string, body: unknown, authorization: string, privileged = false) {
  const result = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: privileged ? service : anon, Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  if (!result.ok) throw new Error(result.status >= 500 ? 'BACKEND_UNAVAILABLE' : 'PHOTO_UNAVAILABLE');
  return result.json();
}
async function removeObjects(paths: string[]) {
  if (!paths.length) return;
  await fetch(`${url}/storage/v1/object/${bucket}`, { method: 'DELETE',
    headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: paths }), signal: AbortSignal.timeout(10000) });
}
async function collectGarbage() {
  try {
    const rows = await rpc('gaga_view_once_garbage', {}, `Bearer ${service}`, true);
    await removeObjects(rows.map((r: { object_name: string }) => r.object_name));
  } catch { /* Expired/consumed objects remain inaccessible even if storage cleanup retries. */ }
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'POST_REQUIRED' }, 405);
  const authorization = request.headers.get('Authorization') ?? '';
  if (!/^Bearer [A-Za-z0-9._~-]{20,}$/.test(authorization)) return json({ error: 'AUTHENTICATION_REQUIRED' }, 401);
  try {
    const identity = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: authorization }, signal: AbortSignal.timeout(8000) });
    if (!identity.ok) return json({ error: 'UNAUTHORIZED' }, 401);
    const user = await identity.json();
    if (!uuid(user.id)) return json({ error: 'UNAUTHORIZED' }, 401);
    const action = new URL(request.url).searchParams.get('action');
    const id = request.headers.get('X-Photo-Id');
    if (!uuid(id)) return json({ error: 'INVALID_PHOTO_ID' }, 400);
    await collectGarbage();
    if (action === 'send') {
      const mime = (request.headers.get('Content-Type') ?? '').split(';')[0];
      const chat = request.headers.get('X-Chat-Id') ?? '';
      if (!chat || chat.length > 200) return json({ error: 'INVALID_CHAT' }, 400);
      const bytes = await readBounded(request.body);
      if (!matchesPhoto(bytes, mime)) return json({ error: 'INVALID_PHOTO' }, 400);
      const objectName = await rpc('gaga_reserve_view_once', { p_id: id, p_chat_id: chat, p_mime: mime }, authorization);
      const upload = await fetch(`${url}/storage/v1/object/${bucket}/${objectName}`, { method: 'POST',
        headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': mime, 'x-upsert': 'false' },
        body: bytes, signal: AbortSignal.timeout(25000) });
      if (!upload.ok) {
        // A retried id may already be uploaded. Publishing checks its existence and ownership.
        const data = await upload.json().catch(() => ({}));
        if (upload.status !== 409 && data.statusCode !== '409' && data.error !== 'Duplicate') throw new Error('UPLOAD_FAILED');
        // A retry may reuse its id only for identical bytes. A changed source
        // must never silently publish the previous upload under the same id.
        const previous = await fetch(`${url}/storage/v1/object/authenticated/${bucket}/${objectName}`, {
          headers: { apikey: service, Authorization: `Bearer ${service}` }, signal: AbortSignal.timeout(15000) });
        if (!previous.ok) throw new Error('PHOTO_UNAVAILABLE');
        const priorBytes = await readBounded(previous.body);
        const fingerprints = await Promise.all([bytes, priorBytes].map(async value =>
          Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', value)), n => n.toString(16).padStart(2, '0')).join('')));
        if (fingerprints[0] !== fingerprints[1]) throw new Error('PHOTO_IDENTITY_CHANGED');
      }
      await rpc('gaga_publish_view_once', { p_id: id }, authorization);
      return json({ id });
    }
    if (action === 'open') {
      // The row lock commits consumption before bytes leave the server. No signed URL is issued.
      const objectName = await rpc('gaga_consume_view_once', { p_id: id }, authorization);
      const download = await fetch(`${url}/storage/v1/object/authenticated/${bucket}/${objectName}`, {
        headers: { apikey: service, Authorization: `Bearer ${service}` }, signal: AbortSignal.timeout(15000) });
      if (!download.ok) throw new Error('PHOTO_UNAVAILABLE');
      const mime = (download.headers.get('Content-Type') ?? '').split(';')[0];
      const bytes = await readBounded(download.body);
      if (!matchesPhoto(bytes, mime)) throw new Error('PHOTO_UNAVAILABLE');
      await removeObjects([objectName]).catch(() => {});
      return new Response(bytes, { headers: { ...noStore, 'Content-Type': mime } });
    }
    return json({ error: 'INVALID_ACTION' }, 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'PHOTO_UNAVAILABLE';
    return json({ error: code === 'PHOTO_TOO_LARGE' ? code : 'PHOTO_UNAVAILABLE' }, code === 'PHOTO_TOO_LARGE' ? 413 : 403);
  }
});
