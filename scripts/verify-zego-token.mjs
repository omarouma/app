// Standalone verification of the token04 algorithm used by the zego-token
// edge function. Generates a token and decodes it back to confirm the binary
// layout + AES-CBC encryption round-trip correctly.
import crypto from 'node:crypto';

function makeRandomIv() {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  let out = '';
  for (let i = 0; i < 16; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function generateToken04(appId, userId, secret, effectiveTimeInSeconds, payload) {
  const createTime = Math.floor(Date.now() / 1000);
  const tokenInfo = {
    app_id: appId,
    user_id: userId,
    nonce: Math.floor(Math.random() * 4294967296) - 2147483648,
    ctime: createTime,
    expire: createTime + effectiveTimeInSeconds,
    payload: payload || '',
  };
  const plainText = JSON.stringify(tokenInfo);
  const iv = makeRandomIv();
  const key = Buffer.from(secret);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, Buffer.from(iv));
  cipher.setAutoPadding(true);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);

  const b1 = Buffer.alloc(8); b1.writeBigInt64BE(BigInt(tokenInfo.expire), 0);
  const b2 = Buffer.alloc(2); b2.writeUInt16BE(iv.length, 0);
  const b3 = Buffer.alloc(2); b3.writeUInt16BE(encrypted.length, 0);
  const buf = Buffer.concat([b1, b2, Buffer.from(iv), b3, encrypted]);
  return '04' + buf.toString('base64');
}

function decodeToken04(token, secret) {
  if (!token.startsWith('04')) throw new Error('missing 04 prefix');
  const buf = Buffer.from(token.slice(2), 'base64');
  const expire = buf.readBigInt64BE(0);
  const ivLen = buf.readUInt16BE(8);
  const iv = buf.subarray(10, 10 + ivLen).toString();
  const cipherLen = buf.readUInt16BE(10 + ivLen);
  const cipherText = buf.subarray(12 + ivLen, 12 + ivLen + cipherLen);
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(secret), Buffer.from(iv));
  decipher.setAutoPadding(true);
  const plain = Buffer.concat([decipher.update(cipherText), decipher.final()]).toString('utf8');
  return { expire: Number(expire), info: JSON.parse(plain) };
}

const SECRET = 'a'.repeat(32);
const token = generateToken04(372536818, 'user_abc', SECRET, 86400, '');
console.log('token prefix:', token.slice(0, 12), '... length:', token.length);
const decoded = decodeToken04(token, SECRET);
console.log('decoded:', JSON.stringify(decoded.info));
if (decoded.info.app_id !== 372536818) throw new Error('app_id mismatch');
if (decoded.info.user_id !== 'user_abc') throw new Error('user_id mismatch');
if (decoded.info.expire <= Math.floor(Date.now() / 1000)) throw new Error('expire invalid');

// Kit token format check
const meta = { appID: 372536818, userID: 'user_abc', userName: encodeURIComponent('Alice'), roomID: 'call_xyz' };
const kitToken = `${token}#${Buffer.from(JSON.stringify(meta)).toString('base64')}`;
const [tok, metaB64] = kitToken.split('#');
const parsedMeta = JSON.parse(Buffer.from(metaB64, 'base64').toString('utf8'));
console.log('kit meta:', JSON.stringify(parsedMeta));
if (parsedMeta.roomID !== 'call_xyz') throw new Error('roomID mismatch');
if (tok !== token) throw new Error('token part mismatch');
console.log('\n✅ token04 + kit token round-trip OK');
