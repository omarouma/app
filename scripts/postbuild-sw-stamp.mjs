// Post-build script: stamps the package.json version into dist/sw.js.
// Runs AFTER vite build completes (package.json postbuild hook). This is a
// fallback belt-and-suspenders: the Vite plugin also does this in closeBundle,
// but public/ asset copy can race with plugin hooks across Vite versions, so
// this standalone script guarantees the replacement always happens.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const pkgPath = resolve(ROOT, 'package.json');
const swPath = resolve(ROOT, 'dist', 'sw.js');

if (!existsSync(swPath)) {
  console.error('! postbuild-sw-stamp: dist/sw.js not found — skip');
  process.exit(0);
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const version = String(pkg.version || '0.0.0');

let src = readFileSync(swPath, 'utf8');
const quoted = JSON.stringify(version);
const replaced = src.replace(/__APP_VERSION__/g, quoted);

if (replaced !== src) {
  writeFileSync(swPath, replaced, 'utf8');
  console.log(`  ✓ postbuild-sw-stamp: stamped dist/sw.js with v${version}`);
} else {
  console.log('  · postbuild-sw-stamp: no __APP_VERSION__ sentinel found — skip');
}
