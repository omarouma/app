import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = 'D:/gaga/GaGa Chat/src';
const outPath = 'D:/gaga/GaGa Chat/agora_scan.txt';
const results = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      const content = readFileSync(full, 'utf8');
      const lines = content.split('\n');
      const hits = lines.filter(l => l.includes('@/lib/agora') || l.includes('@/hooks/useAgoraCall') || l.includes('@/lib/agoraToken') || l.includes('agora-rtc-sdk-ng'));
      if (hits.length) {
        results.push(`FILE: ${full}\n` + hits.join('\n'));
      }
    }
  }
}

walk(root);
const out = results.length ? results.join('\n\n') : 'NO_AGORA_IMPORTS_FOUND';
writeFileSync(outPath, out, 'utf8');
console.log('WROTE ' + outPath);
console.log(out);
