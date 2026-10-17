// Google ID tokens here authorize release operations only, never general Google API calls.
const decode = part => Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
export async function verifyPublisher(token, audience, email, subject, fetcher = fetch, now = Date.now()/1000) {
  try {
    if (typeof token !== 'string' || token.length > 16000) return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 200) return false;
    if (claims.iss !== 'https://accounts.google.com' || claims.aud !== audience || claims.email !== email ||
        claims.sub !== subject || claims.email_verified !== true || typeof claims.exp !== 'number' ||
        typeof claims.iat !== 'number' || claims.exp <= now || claims.iat > now+30 || claims.iat < now-900) return false;
    const response = await fetcher('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return false;
    const jwk = (await response.json()).keys.find(k => k.kid === header.kid && k.kty === 'RSA');
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), new TextEncoder().encode(parts[0]+'.'+parts[1]));
  } catch { return false; }
}
