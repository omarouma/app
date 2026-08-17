// Read-only probe: check which migration columns already exist in the live DB.
// Uses ONLY the anon key from .env — no DDL, no writes, no secrets printed.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i === -1) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const probes = [
  // [table, column, migration file that adds it]
  ['users', 'push_subscription', 'supabase_add_push_subscription.sql'],
  ['posts', 'video_url', '20260814_add_video_support.sql'],
  ['posts', 'media_type', '20260814_add_video_support.sql'],
  ['posts', 'visibility', '20260814_add_video_support.sql'],
  ['posts', 'poll_data', '20260814_add_video_support.sql'],
  ['posts', 'hashtags', '20260814_add_video_support.sql'],
  ['posts', 'content_warning', '20260814_add_video_support.sql'],
];

console.log('Probing live schema (read-only)...\n');
for (const [table, column, migration] of probes) {
  const { error } = await supabase.from(table).select(column).limit(1);
  if (error && (error.code === 'PGRST204' || /column .* does not exist|Could not find/i.test(error.message))) {
    console.log(`MISSING  ${table}.${column}   <- needs ${migration}`);
  } else if (error) {
    console.log(`ERROR    ${table}.${column}   ${error.code || ''} ${error.message}`);
  } else {
    console.log(`OK       ${table}.${column}`);
  }
}
