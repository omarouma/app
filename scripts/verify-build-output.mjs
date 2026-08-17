import fs from 'fs';
import path from 'path';

const dist = 'dist';
const assetsDir = path.join(dist, 'assets');

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.log('BUILD INCOMPLETE: dist/index.html missing');
  process.exit(1);
}

const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const initialScripts = html.match(/assets\/index-[^"']+\.js/g) || [];
const files = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
const zegoFiles = files.filter((f) => f.startsWith('zego'));

console.log('Initial scripts in index.html:', JSON.stringify(initialScripts));
console.log('ZEGO separate chunks:', JSON.stringify(zegoFiles));

for (const f of [...initialScripts, ...zegoFiles]) {
  const name = f.replace('assets/', '');
  const full = path.join(assetsDir, name);
  if (fs.existsSync(full)) {
    const size = fs.statSync(full).size;
    console.log(`  ${name}: ${(size / 1024).toFixed(1)} KB`);
  }
}

const mtime = fs.statSync(path.join(dist, 'index.html')).mtime;
console.log('dist/index.html mtime:', mtime.toISOString());

if (!initialScripts.length) {
  console.log('BUILD INCOMPLETE: no initial script found');
  process.exit(1);
} else {
  console.log('BUILD OK');
}
