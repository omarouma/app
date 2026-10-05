// Shared helpers for the GaGa history-migration tooling.
//
// No third-party dependencies: NDJSON, hashing and argument parsing are all
// implemented with the Node standard library so the export/reconcile steps run
// even in a locked-down migration runner that only has Node installed.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** Minimal `--flag value` / `--flag=value` / `--bool` parser. */
export function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const eq = token.indexOf('=');
    if (eq !== -1) {
      args[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

export function log(...parts) {
  process.stdout.write(`${parts.join(' ')}\n`);
}

export function fail(message) {
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}

export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Writes records as newline-delimited JSON (one compact object per line). */
export async function writeNdjson(file, records) {
  const lines = records.map(record => JSON.stringify(record)).join('\n');
  await writeFile(file, lines.length ? `${lines}\n` : '', 'utf8');
}

export async function appendNdjson(file, records) {
  if (!records.length) return;
  const lines = `${records.map(record => JSON.stringify(record)).join('\n')}\n`;
  await appendFile(file, lines, 'utf8');
}

/** Reads an NDJSON file into an array. Missing file => empty array. */
export async function readNdjson(file) {
  if (!existsSync(file)) return [];
  const raw = await readFile(file, 'utf8');
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${path.basename(file)}: invalid JSON on line ${index + 1}: ${error.message}`);
      }
    });
}

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function fileHash(file) {
  return readFile(file, 'utf8').then(sha256);
}

/**
 * Normalises a Supabase timestamp into epoch millis. Accepts ISO-8601 strings,
 * epoch-millis numbers, epoch-seconds numbers (heuristic) and null.
 */
export function toMillis(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? Math.trunc(value) : Math.trunc(value * 1000);
  }
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

/** Epoch millis -> Firestore-friendly Date (admin SDK stores it as a Timestamp). */
export function toDate(value) {
  const millis = toMillis(value);
  return millis === null ? null : new Date(millis);
}

/** Drops keys whose value is null/undefined so we never write empty fields. */
export function compact(object) {
  const out = {};
  for (const [key, value] of Object.entries(object)) {
    if (value === null || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

export function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

export function asString(value) {
  return value === null || value === undefined ? null : String(value);
}

/** Deterministic, human-readable summary of counts for the manifest. */
export function countBy(records, keyFn) {
  const counts = {};
  for (const record of records) {
    const key = keyFn(record);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
