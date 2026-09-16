// GaGaChat backend — short-lived access JWTs and opaque rotating refresh tokens.
const crypto = require('crypto');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const configuredSecret = process.env.JWT_SECRET || '';
if (IS_PRODUCTION && configuredSecret.length < 32) {
  throw new Error('JWT_SECRET must contain at least 32 characters in production');
}
const SECRET = configuredSecret.length >= 32
  ? configuredSecret
  : crypto.randomBytes(32).toString('hex');
const ISSUER = process.env.JWT_ISSUER || 'gagachat-api';
const AUDIENCE = process.env.JWT_AUDIENCE || 'gagachat-android';
const ACCESS_TTL = Number.parseInt(process.env.JWT_TTL || '900', 10);
const REFRESH_TTL = Number.parseInt(process.env.REFRESH_TTL || '2592000', 10);

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function decodeB64url(value) {
  return Buffer.from(value, 'base64url');
}

function sign({ sub, sid }, ttlSeconds = ACCESS_TTL) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const issuedAt = Math.floor(Date.now() / 1000);
  const body = {
    sub,
    sid,
    typ: 'access',
    iss: ISSUER,
    aud: AUDIENCE,
    jti: crypto.randomUUID(),
    iat: issuedAt,
    exp: issuedAt + ttlSeconds
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(body))}`;
  const signature = crypto.createHmac('sha256', SECRET).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(decodeB64url(parts[0]).toString('utf8'));
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;
    const expected = crypto.createHmac('sha256', SECRET)
      .update(`${parts[0]}.${parts[1]}`).digest();
    const actual = decodeB64url(parts[2]);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
    const body = JSON.parse(decodeB64url(parts[1]).toString('utf8'));
    const current = Math.floor(Date.now() / 1000);
    if (body.typ !== 'access' || body.iss !== ISSUER || body.aud !== AUDIENCE) return null;
    if (!body.sub || !body.sid || typeof body.exp !== 'number' || body.exp <= current) return null;
    return body;
  } catch (_) {
    return null;
  }
}

function issueRefreshToken() {
  const token = crypto.randomBytes(48).toString('base64url');
  return {
    token,
    hash: hashRefreshToken(token),
    expiresAt: Date.now() + REFRESH_TTL * 1000
  };
}

function hashRefreshToken(token) {
  if (!token || typeof token !== 'string') return '';
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  sign,
  verify,
  issueRefreshToken,
  hashRefreshToken,
  ACCESS_TTL,
  REFRESH_TTL
};
