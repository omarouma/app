// One-off migration: replace hardcoded light-mode colors with semantic tokens
// so screens are readable in dark/midnight/oled themes.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

// QRScannerPage keeps a white QR card for scannability -> excluded.
const EXCLUDE = new Set(['src/pages/QRScannerPage.tsx']);
const files = [
  ...walk('src/pages'),
  ...walk('src/components'),
].filter((f) => !EXCLUDE.has(f));

// Order matters: more specific first.
const rules = [
  // translucent overlays must stay white -> skip (handled by negative lookahead on bg-white)
  [/bg-white(?![/\w-])/g, 'bg-background'],
  [/text-\[#111111\]/g, 'text-foreground'],
  [/text-\[#8D8D8D\]/g, 'text-muted-foreground'],
  [/text-\[#ADADAD\]/g, 'text-muted-foreground'],
  [/text-\[#CCCCCC\]/g, 'text-muted-foreground'],
  [/text-\[#C7C7CC\]/g, 'text-muted-foreground'],
  [/placeholder-\[#ADADAD\]/g, 'placeholder:text-muted-foreground'],
  [/placeholder-\[#8D8D8D\]/g, 'placeholder:text-muted-foreground'],
  [/placeholder:text-\[#8D8D8D\]/g, 'placeholder:text-muted-foreground'],
  [/placeholder:text-\[#ADADAD\]/g, 'placeholder:text-muted-foreground'],
  [/bg-\[#F5F5F5\]/g, 'bg-muted'],
  [/bg-\[#F0F0F0\]/g, 'bg-muted'],
  [/bg-\[#EAEAEA\]/g, 'bg-muted'],
  [/bg-\[#EBEBEB\]/g, 'bg-muted'],
  [/border-\[#EBEBEB\]/g, 'border-border'],
  [/border-\[#E4E6EB\]/g, 'border-border'],
  [/border-\[#EAEAEA\]/g, 'border-border'],
  [/border-\[#F0F0F0\]/g, 'border-border'],
  [/divide-\[#EBEBEB\]/g, 'divide-border'],
  [/hover:bg-gray-50/g, 'hover:bg-muted'],
  [/hover:bg-gray-100/g, 'hover:bg-muted'],
  [/active:bg-gray-100/g, 'active:bg-muted'],
  [/active:bg-gray-50/g, 'active:bg-muted'],
  [/bg-gray-50(?![/\w-])/g, 'bg-muted'],
  [/bg-gray-100(?![/\w-])/g, 'bg-muted'],
  [/border-gray-100/g, 'border-border'],
  [/border-gray-200/g, 'border-border'],
  [/text-gray-900/g, 'text-foreground'],
  [/text-gray-800/g, 'text-foreground'],
  [/text-gray-700/g, 'text-foreground'],
  [/text-gray-600/g, 'text-muted-foreground'],
  [/text-gray-500/g, 'text-muted-foreground'],
  [/text-gray-400/g, 'text-muted-foreground'],
];

let totalChanges = 0;
for (const f of files) {
  let src;
  try { src = readFileSync(f, 'utf8'); } catch { continue; }
  let out = src;
  let fileChanges = 0;
  for (const [re, rep] of rules) {
    const before = out;
    out = out.replace(re, rep);
    if (out !== before) {
      const m = before.match(re);
      fileChanges += m ? m.length : 1;
    }
  }
  if (out !== src) {
    writeFileSync(f, out);
    totalChanges += fileChanges;
    console.log(`${fileChanges.toString().padStart(4)}  ${f}`);
  }
}
console.log(`\nTotal replacements: ${totalChanges}`);
