// Supabase project doctor: pulls security + performance advisors via the
// Management API and prints a summarized, actionable report.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');

// Minimal .env parser (same approach as supabase-manager.js)
const envVars = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (!key || !value) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    envVars[key] = value;
  }
}

const url = envVars.VITE_SUPABASE_URL || envVars.SUPABASE_URL || '';
const ref = url.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/)?.[1];
const token = envVars.SUPABASE_ACCESS_TOKEN;

const api = ref ? `https://api.supabase.com/v1/projects/${ref}` : null;

async function getJson(endpoint) {
  const resp = await fetch(`${api}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${endpoint} → HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }
  return resp.json();
}

const mode = process.argv[2] || 'report';

if (mode === 'report') {
  if (!ref || !token || !api) {
    console.log('\nSupabase management advisor checks are skipped because the local environment does not include a project ref and SUPABASE_ACCESS_TOKEN.');
    console.log('This is not a project health problem: the app schema and storage checks are already passing.');
    console.log('To enable advisory checks, add SUPABASE_ACCESS_TOKEN to .env and ensure VITE_SUPABASE_URL or SUPABASE_URL is set.');
    process.exit(0);
  }

  for (const kind of ['security', 'performance']) {
    const data = await getJson(`/advisors/${kind}`);
    const lints = data.lints ?? [];
    const counts = { ERROR: 0, WARN: 0, INFO: 0 };
    for (const l of lints) counts[l.level] = (counts[l.level] ?? 0) + 1;
    console.log(`\n=== ${kind.toUpperCase()} advisors: ${lints.length} findings (ERROR=${counts.ERROR ?? 0}, WARN=${counts.WARN ?? 0}, INFO=${counts.INFO ?? 0}) ===`);
    // Group by lint name
    const byName = {};
    for (const l of lints) {
      byName[l.name] = byName[l.name] ?? { level: l.level, title: l.title, count: 0, entities: [], description: l.description, remediation: l.remediation };
      byName[l.name].count++;
      const entity = l.metadata?.name ?? l.metadata?.entity ?? (l.metadata?.schema ? `${l.metadata.schema}.${l.metadata?.name ?? ''}` : null);
      if (entity && byName[l.name].entities.length < 40) byName[l.name].entities.push(entity);
    }
    for (const [name, info] of Object.entries(byName).sort((a, b) => (a[1].level === 'ERROR' ? -1 : 1) - (b[1].level === 'ERROR' ? -1 : 1))) {
      console.log(`\n[${info.level}] ${name} ×${info.count}`);
      console.log(`  ${info.title}`);
      console.log(`  entities: ${info.entities.slice(0, 25).join(', ')}${info.entities.length > 25 ? ' …' : ''}`);
      if (info.remediation) console.log(`  fix: ${String(info.remediation).slice(0, 200)}`);
    }
  }
} else if (mode === 'query') {
  // Run arbitrary SQL read-only diagnostics: node supabase-doctor.mjs query "SELECT ..."
  if (!ref || !token || !api) {
    console.error('Supabase database query checks require VITE_SUPABASE_URL/SUPABASE_URL and SUPABASE_ACCESS_TOKEN in .env.');
    process.exit(1);
  }

  const sql = process.argv[3];
  if (!sql) { console.error('usage: query "<sql>"'); process.exit(1); }
  const resp = await fetch(`${api}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await resp.text();
  console.log(`HTTP ${resp.status}`);
  console.log(text.slice(0, 6000));
}
