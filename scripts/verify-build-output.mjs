import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const html = fs.readFileSync('dist/index.html', 'utf8');
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file); else files.push(file);
  }
}
walk('dist');
const references = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map(m => m[1]);
assert(references.some(file => file.endsWith('.js')), 'Missing app entry script');
for (const reference of references) assert(fs.existsSync(path.join('dist', reference)), `Missing asset: ${reference}`);
const scripts = files.filter(file => file.endsWith('.js'));
const bundle = scripts.map(file => fs.readFileSync(file, 'utf8')).join('\n');
assert(bundle.includes('https://fcjgbbmfqdkucfpqjxae.supabase.co'), 'Build must preserve the live Supabase project');
// The preconnect/dns-prefetch hints in index.html are hand-written, so they can
// drift from VITE_SUPABASE_URL. A stale ref wastes the hint and leaks a dead
// hostname into the shipped HTML.
const supabaseRefs = [...html.matchAll(/https:\/\/([a-z0-9]+)\.supabase\.co/g)].map(m => m[1]);
for (const ref of supabaseRefs) {
  assert(ref === 'fcjgbbmfqdkucfpqjxae', `index.html preconnects to stale Supabase project: ${ref}`);
}
assert(supabaseRefs.length > 0, 'index.html is missing the Supabase preconnect hint');
assert(bundle.includes('https://calls.gagachat.app'), 'Missing calling gateway');
assert(!/ZegoUIKitPrebuilt|zego-uikit|zegocloud\.com/i.test(bundle), 'Paid calling SDK remains in the build');
assert(!/TURN_SHARED_SECRET|SUPABASE_SERVICE_ROLE_KEY|sb_secret_[A-Za-z0-9]/.test(bundle), 'Possible server secret in public build');
assert(!files.some(file => /(^|\/)\.env|\.map$/.test(file)), 'Private env or source maps in hosting output');
const sw = fs.readFileSync('dist/sw.js', 'utf8');
assert(!sw.includes('__APP_VERSION__') && sw.includes(pkg.version), 'Service worker version is not stamped');
assert(JSON.parse(fs.readFileSync('dist/manifest.json')).version === pkg.version, 'Manifest version mismatch');
const hashes = files.sort().map(file => ({ path: file.replace(/^dist\//, ''), bytes: fs.statSync(file).size, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') }));
fs.writeFileSync('RELEASE-MANIFEST.json', JSON.stringify({ version: pkg.version, firebaseProject: 'oumagachat', supabaseProject: 'fcjgbbmfqdkucfpqjxae', checkedAt: new Date().toISOString(), files: hashes }, null, 2)+'\n');
console.log(`Release ${pkg.version} verified: ${files.length} hosting files; live public configuration; no paid calling SDK or source maps.`);
