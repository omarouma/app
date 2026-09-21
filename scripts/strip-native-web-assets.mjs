/**
 * Removes web-only assets from the native Android payload.
 *
 * `cap sync android` copies the entire `dist/` directory into
 * `android/app/src/main/assets/public/`. That directory contains files that
 * only make sense for the hosted web app (service worker, PWA manifest, SEO
 * files, offline fallback). Shipping them inside the APK is dead weight and,
 * in the case of `sw.js`, an active hazard: a service worker registered in the
 * WebView can intercept navigations and wedge the app.
 *
 * Run this AFTER `npx cap sync android`.
 */

import { existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const NATIVE_PUBLIC = resolve(process.cwd(), 'android/app/src/main/assets/public');

/** Files/directories that must never ship inside the native app. */
const WEB_ONLY = [
  'sw.js',
  'manifest.json',
  'offline.html',
  'robots.txt',
  'sitemap.xml',
  '404.html',
  'ping.txt',
  'google8483fbe59d016298.html',
];

function removeIfPresent(target) {
  if (!existsSync(target)) return false;
  rmSync(target, { recursive: true, force: true });
  return true;
}

function main() {
  if (!existsSync(NATIVE_PUBLIC)) {
    console.error(`[strip-native-web-assets] Not found: ${NATIVE_PUBLIC}`);
    console.error('  Run `npx cap sync android` first.');
    process.exit(1);
  }

  let removed = 0;
  for (const name of WEB_ONLY) {
    if (removeIfPresent(join(NATIVE_PUBLIC, name))) {
      console.log(`  ✓ removed ${name}`);
      removed += 1;
    }
  }

  // Also drop any stray service-worker variants.
  for (const entry of readdirSync(NATIVE_PUBLIC)) {
    if (/^sw(-.*)?\.js(\.map)?$/.test(entry) || entry === 'workbox') {
      if (removeIfPresent(join(NATIVE_PUBLIC, entry))) {
        console.log(`  ✓ removed ${entry}`);
        removed += 1;
      }
    }
  }

  // Sanity check: the app entry must still be present.
  const indexPath = join(NATIVE_PUBLIC, 'index.html');
  if (!existsSync(indexPath) || statSync(indexPath).size === 0) {
    console.error('[strip-native-web-assets] index.html missing after strip — aborting');
    process.exit(1);
  }

  console.log(`[strip-native-web-assets] done (${removed} web-only item(s) removed)`);
}

main();
