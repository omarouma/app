import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.resolve(__dirname, '../src/types/index.ts');
let s = readFileSync(p, 'utf8');

const before = s;

// Replace the 3-currency union types to include RMB/INR
s = s.split("'coins' | 'USD' | 'BDT'").join("'coins' | 'USD' | 'BDT' | 'RMB' | 'INR'");
s = s.split("'USD' | 'coins' | 'BDT'").join("'USD' | 'coins' | 'BDT' | 'RMB' | 'INR'");

writeFileSync(p, s, 'utf8');
console.log('changed length:', s.length - before.length);
