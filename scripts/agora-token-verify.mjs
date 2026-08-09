// Verify: my browser-safe Agora token algorithm produces byte-identical tokens
// to the official agora-access-token package (AccessToken "006" format).
// Uses Node's crypto module to replicate the browser Web Crypto operations.
// Run: node scripts/agora-token-verify.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { AccessToken } = require('agora-access-token/src/AccessToken.js');

const APP_ID = '81a49c91e2474c22b3652f8189489d06';
const CERT = '85f5c9cfe7fd4016bbac3ec8cd4bc773';
const CHANNEL = 'gaga-call-abc123';
const UID = 'user-42';
const SALT = 123456789; // fixed so both produce identical bytes
const TS = Math.floor(Date.now() / 1000) + 3600; // fixed

// ---------- CRC32 ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(str) {
  let c = 0xffffffff;
  const bytes = Buffer.from(str, 'utf8');
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------- byte helpers (little-endian) ----------
const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v, 0); return b; };
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0, 0); return b; };
const concat = (...arrs) => Buffer.concat(arrs);
const putBytes = (b) => concat(u16(b.length), b);
const putTreeMapUInt32 = (map) => {
  const keys = Object.keys(map).map(Number);
  let out = u16(keys.length);
  for (const k of keys) out = concat(out, u16(k), u32(map[k]));
  return out;
};

// ---------- my algorithm ----------
function buildMine() {
  const messages = { 1: TS, 2: TS, 3: TS, 4: TS };
  const m = concat(u32(SALT), u32(TS), putTreeMapUInt32(messages));
  const toSign = concat(Buffer.from(APP_ID, 'utf8'), Buffer.from(CHANNEL, 'utf8'), Buffer.from(UID, 'utf8'), m);
  const signature = require('crypto').createHmac('sha256', Buffer.from(CERT, 'utf8')).update(toSign).digest();
  const crcChannel = crc32(CHANNEL);
  const crcUid = crc32(UID);
  const content = concat(putBytes(signature), u32(crcChannel), u32(crcUid), putBytes(m));
  return '006' + APP_ID + content.toString('base64');
}

// ---------- official (fixed salt/ts/messages) ----------
const official = new AccessToken(APP_ID, CERT, CHANNEL, UID);
official.salt = SALT;
official.ts = TS;
official.messages = { 1: TS, 2: TS, 3: TS, 4: TS };
const officialToken = official.build();

const mine = buildMine();
console.log('Official:', officialToken);
console.log('Mine:    ', mine);
console.log('MATCH:', officialToken === mine);
