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
const agoraFiles = files.filter((f) => f.startsWith('agora'));

console.log('Initial scripts in index.html:', JSON.stringify(initialScripts));
console.log('Agora separate chunks:', JSON.stringify(agoraFiles));

for (const f of [...initialScripts, ...agoraFiles]) {
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
