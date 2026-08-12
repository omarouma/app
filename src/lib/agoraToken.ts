/**
 * Browser-safe Agora RTC token builder (AccessToken v1 / "006" format).
 *
 * This is a from-scratch, dependency-free reimplementation of Agora's official
 * `agora-access-token` Node package (the "006" AccessToken format), using the
 * Web Crypto API (crypto.subtle) so it runs in the browser without Node's
 * `crypto`/`Buffer` modules.
 *
 * Token layout (all integers little-endian):
 *   token = "006" + appID(32 chars) + base64(content)
 *   content = putString(signature)
 *           + putUint32(crc_channel)
 *           + putUint32(crc_uid)
 *           + putString(m)
 *   m = putUint32(salt) + putUint32(ts) + putTreeMapUInt32(messages)
 *   signature = HMAC-SHA256(appCertificate, appID + channelName + uid + m)
 *   crc_channel = CRC32(channelName), crc_uid = CRC32(uid)
 *
 * NOTE: For production, tokens should be generated server-side (never expose
 * your App Certificate in client code). This module is provided so the app can
 * issue short-lived tokens for private channels during development. If
 * `VITE_AGORA_TOKEN_SERVER_URL` is configured, prefer that endpoint instead.
 */

// ─── CRC32 (IEEE, same as the `crc-32` npm package) ────────────────────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(str: string): number {
  let c = 0xffffffff;
  const bytes = new TextEncoder().encode(str);
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ─── Byte packing helpers (little-endian) ──────────────────────────────────
function u16(v: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, v, true);
  return b;
}

function u32(v: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v >>> 0, true);
  return b;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function putBytes(bytes: Uint8Array): Uint8Array {
  return concatBytes(u16(bytes.length), bytes);
}

function _putString(str: string): Uint8Array {
  return putBytes(new TextEncoder().encode(str));
}

function putTreeMapUInt32(map: Record<number, number>): Uint8Array {
  const keys = Object.keys(map).map(Number);
  const size = u16(keys.length);
  const parts: Uint8Array[] = [size];
  for (const key of keys) {
    parts.push(u16(key), u32(map[key]));
  }
  return concatBytes(...parts);
}

// ─── HMAC-SHA256 via Web Crypto ────────────────────────────────────────────
async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, data as BufferSource);
  return new Uint8Array(sig);
}

// ─── Public API ─────────────────────────────────────────────────────────────
export interface AgoraTokenOptions {
  appId: string;
  appCertificate: string;
  channelName: string;
  uid: string | number;
  /** Token validity in seconds (default 24h aligned with Agora's default). */
  expireInSeconds?: number;
}

export type AgoraTokenResult = {
  token: string;
  tokenType: 'RtcTokenBuilder2';
  uid: string;
  channelName: string;
  expireAt: number;
};

/**
 * Builds a v1 ("006") RTC token for a channel.
 * 
 * ⚠️  SECURITY: This function should ONLY be called server-side (Cloud Functions).
 * Never pass a real App Certificate from client code — use VITE_AGORA_TOKEN_SERVER_URL
 * to fetch tokens from your secure backend instead.
 */
export async function buildAgoraRtcToken(
  options: AgoraTokenOptions,
): Promise<AgoraTokenResult> {
  const {
    appId,
    appCertificate,
    channelName,
    uid,
    expireInSeconds = 24 * 3600,
  } = options;

  if (!appId || !appCertificate || !channelName) {
    throw new Error('Agora token requires appId, appCertificate and channelName.');
  }

  // Guard: refuse to run in browser with a real certificate
  if (typeof window !== 'undefined' && appCertificate.length > 10) {
    throw new Error(
      '[Agora] buildAgoraRtcToken must not be called client-side with a real certificate. ' +
      'Use VITE_AGORA_TOKEN_SERVER_URL to fetch tokens from your secure backend.'
    );
  }

  const uidStr = typeof uid === 'number' ? String(uid) : uid;
  const nowSec = Math.floor(Date.now() / 1000);
  const privilegeTs = nowSec + expireInSeconds;

  // Random 32-bit salt (crypto.getRandomValues if available).
  let salt: number;
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    salt = arr[0] >>> 0;
  } else {
    salt = (Math.floor(Math.random() * 0xffffffff) + 1) >>> 0;
  }
  if (salt === 0) salt = 1; // Agora requires salt > 0

  // Privileges granted: JOIN_CHANNEL(1), PUBLISH_AUDIO(2), PUBLISH_VIDEO(3),
  // PUBLISH_DATA(4) all valid until privilegeTs.
  const messages: Record<number, number> = {
    1: privilegeTs,
    2: privilegeTs,
    3: privilegeTs,
    4: privilegeTs,
  };

  // m = putUint32(salt) + putUint32(ts) + putTreeMapUInt32(messages)
  const m = concatBytes(u32(salt), u32(privilegeTs), putTreeMapUInt32(messages));

  // toSign = appID + channelName + uid + m
  const appIdBytes = new TextEncoder().encode(appId);
  const channelBytes = new TextEncoder().encode(channelName);
  const uidBytes = new TextEncoder().encode(uidStr);
  const toSign = concatBytes(appIdBytes, channelBytes, uidBytes, m);

  // signature = HMAC-SHA256(appCertificate, toSign)
  const signature = await hmacSha256(new TextEncoder().encode(appCertificate), toSign);

  // content = putString(signature) + putUint32(crc_channel) + putUint32(crc_uid) + putString(m)
  const crcChannel = crc32(channelName);
  const crcUid = crc32(uidStr);
  const content = concatBytes(
    putBytes(signature),
    u32(crcChannel),
    u32(crcUid),
    putBytes(m),
  );

  const base64 = bytesToBase64(content);
  const token = `006${appId}${base64}`;

  return {
    token,
    tokenType: 'RtcTokenBuilder2',
    uid: uidStr,
    channelName,
    expireAt: privilegeTs,
  };
}

// ─── Base64 helpers (browser-safe, no Buffer) ──────────────────────────────
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  // Fallback for environments without btoa (covers Node execution for tests).
  return Buffer.from(bytes).toString('base64');
}

/**
 * Convenience: whether Agora is configured (appId present).
 */
export function isAgoraConfigured(appId?: string): boolean {
  return !!appId;
}
