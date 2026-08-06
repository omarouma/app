import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.resolve(__dirname, '../src/store/useWalletStore.ts');
let s = readFileSync(p, 'utf8');

const before = s;
s = s.split("as 'coins' | 'USD' | 'BDT'").join("as 'coins' | 'USD' | 'BDT' | 'RMB' | 'INR'");
s = s.split("as 'coins' | 'BDT' | 'USD'").join("as 'coins' | 'BDT' | 'USD' | 'RMB' | 'INR'");

writeFileSync(p, s, 'utf8');
console.log('replaced:', before.length - s.length, 'chars changed');
