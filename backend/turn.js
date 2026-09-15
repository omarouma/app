// GaGaChat backend — ephemeral TURN credentials (coturn "static-auth-secret" scheme)
// username = "<expiry-epoch>:<userId>", credential = base64(HMAC-SHA1(secret, username))
// coturn must run with --use-auth-secret --static-auth-secret=<SECRET>
const crypto = require('crypto');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const configuredSecret = process.env.TURN_SECRET || '';
if (IS_PRODUCTION && configuredSecret && configuredSecret.length < 32) {
  throw new Error('TURN_SECRET must contain at least 32 characters in production');
}
const SECRET = configuredSecret.length >= 32 ? configuredSecret : '';

const TTL = parseInt(process.env.TURN_TTL || '3600', 10); // 1 hour credentials

// Public TURN endpoints — set TURN_HOST to your ECS public IP / domain (deploy sets this).
const TURN_HOST = process.env.TURN_HOST || '';
const TURN_PORT = parseInt(process.env.TURN_PORT || '3478', 10);
const TLS_PORT = parseInt(process.env.TURNS_PORT || '5349', 10);

function turnCreds(userId) {
  if (!TURN_HOST || !SECRET) return null;
  const expires = Math.floor(Date.now() / 1000) + TTL;
  const username = expires + ':' + (userId || 'guest');
  const credential = crypto.createHmac('sha1', SECRET).update(username).digest('base64');
  return [
    { urls: 'turn:' + TURN_HOST + ':' + TURN_PORT + '?transport=udp', username, credential },
    { urls: 'turn:' + TURN_HOST + ':' + TURN_PORT + '?transport=tcp', username, credential },
    { urls: 'turns:' + TURN_HOST + ':' + TLS_PORT + '?transport=tcp', username, credential }
  ];
}

function sharedSecret() { return SECRET; }
function isConfigured() { return Boolean(TURN_HOST && SECRET); }

module.exports = { turnCreds, sharedSecret, isConfigured };
