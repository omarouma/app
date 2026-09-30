/** ZEGO Token04 AES-256-CBC wire format, matching the official server assistant. */
export async function generateToken04(appId: number, userId: string, secret: string, expireAt: number, payload = ''): Promise<string> {
  const encoder = new TextEncoder();
  if (!Number.isSafeInteger(appId) || appId <= 0 || !userId || encoder.encode(secret).length !== 32) {
    throw new Error('Invalid token parameters');
  }
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(expireAt) || expireAt <= now) throw new Error('Invalid expiry');
  const nonce = crypto.getRandomValues(new Int32Array(1))[0];
  const random = crypto.getRandomValues(new Uint8Array(16));
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const iv = encoder.encode(Array.from(random, byte => alphabet[byte % alphabet.length]).join(''));
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), 'AES-CBC', false, ['encrypt']);
  const body = encoder.encode(JSON.stringify({ app_id: appId, user_id: userId, nonce, ctime: now, expire: expireAt, payload }));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, body));
  const bytes = new Uint8Array(8 + 2 + iv.length + 2 + encrypted.length);
  const view = new DataView(bytes.buffer);
  view.setBigInt64(0, BigInt(expireAt), false);
  view.setUint16(8, iv.length, false);
  bytes.set(iv, 10);
  view.setUint16(10 + iv.length, encrypted.length, false);
  bytes.set(encrypted, 12 + iv.length);
  return '04' + btoa(String.fromCharCode(...bytes));
}
