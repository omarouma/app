// Read-only Supabase (PostgREST) client for the migration export.
//
// Uses the service-role key so the export sees every row regardless of RLS, but
// only ever issues GET requests: the migration never mutates the source. The
// key is read from the environment and is never written to disk.
import { fail } from './util.mjs';

export function supabaseConfig() {
  const url = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) {
    fail('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (service-role key stays in the environment).');
  }
  return { url, key };
}

async function request(url, key, path) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      'Accept-Profile': 'public',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Supabase ${path} failed (${response.status}): ${body.slice(0, 300)}`);
  }
  return response.json();
}

/**
 * Reads an entire table with keyset-free offset pagination. A stable `order`
 * column is required so pages never overlap or skip rows.
 */
export async function fetchAll(table, { order = 'created_at', select = '*', pageSize = 1000 } = {}) {
  const { url, key } = supabaseConfig();
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const query = new URLSearchParams({ select, order: `${order}.asc`, limit: String(pageSize), offset: String(offset) });
    const page = await request(url, key, `${table}?${query.toString()}`);
    if (!Array.isArray(page)) throw new Error(`Supabase ${table} returned a non-array body`);
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

/**
 * Reads a table that may not exist in a given project (e.g. an older deployment
 * without `call_history`). Returns `[]` instead of aborting the whole export.
 */
export async function fetchAllOptional(table, options) {
  try {
    return await fetchAll(table, options);
  } catch (error) {
    process.stderr.write(`warning: skipping ${table}: ${error.message}\n`);
    return [];
  }
}
