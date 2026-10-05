/** Firebase identity boundary. Not enabled in production handlers until cutover.
 * lookupUser MUST use the trusted Firebase Admin API, never client profile data.
 * resolveAppUserId MUST use a server-controlled mapping, never email matching.
 */
const KEY_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function reject() { throw new Error('Firebase authentication rejected'); }
function bytes(part) {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) reject();
  try { return Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4-part.length%4)%4)), c=>c.charCodeAt(0)); }
  catch { reject(); }
}
function object(part) {
  try { const value=JSON.parse(new TextDecoder().decode(bytes(part))); if (!value || typeof value!=='object' || Array.isArray(value)) reject(); return value; }
  catch { reject(); }
}
export function createFirebaseIdentityVerifier({projectId, lookupUser, resolveAppUserId, fetchImpl=fetch, now=()=>Date.now(), keyUrl=KEY_URL}) {
  if (!projectId || typeof lookupUser!=='function' || typeof resolveAppUserId!=='function') throw new Error('Trusted Firebase identity dependencies required');
  // keyUrl is deployment/test configuration, never taken from the token header.
  let cache=null; let refresh=null;
  async function keys() {
    if (cache && cache.until>now()) return cache.keys;
    if (!refresh) refresh=(async()=>{
      const response=await fetchImpl(keyUrl, {signal:AbortSignal.timeout(5000)});
      if (!response.ok) reject();
      const body=await response.json();
      if (!Array.isArray(body.keys) || body.keys.length===0) reject();
      const age=Number(/(?:^|,)\s*max-age=(\d+)/i.exec(response.headers.get('cache-control')||'')?.[1] || 300);
      cache={keys:body.keys,until:now()+Math.min(age,3600)*1000};
      return cache.keys;
    })().finally(()=>{refresh=null;});
    return refresh;
  }
  return async function verify(authorization) {
    if (typeof authorization!=='string' || !authorization.startsWith('Bearer ')) reject();
    const token=authorization.slice(7);
    if (token.length>16384) reject();
    const parts=token.split('.'); if(parts.length!==3) reject();
    const header=object(parts[0]), claims=object(parts[1]);
    if(header.alg!=='RS256' || typeof header.kid!=='string' || !header.kid || header.crit!==undefined) reject();
    const second=Math.floor(now()/1000);
    if(claims.aud!==projectId || claims.iss!==`https://securetoken.google.com/${projectId}` || typeof claims.sub!=='string' || !claims.sub || claims.sub.length>128) reject();
    if(!Number.isInteger(claims.exp) || claims.exp<=second || !Number.isInteger(claims.iat) || claims.iat>second || !Number.isInteger(claims.auth_time) || claims.auth_time>second || claims.auth_time>claims.iat || claims.exp<=claims.iat) reject();
    if(claims.email_verified!==true || claims.firebase?.tenant!==undefined) reject();
    const jwk=(await keys()).find(k=>k.kid===header.kid && k.kty==='RSA' && (!k.alg || k.alg==='RS256') && (!k.use || k.use==='sig'));
    if(!jwk) reject();
    let valid=false;
    try {
      const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
      valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,bytes(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
    } catch { reject(); }
    if(!valid) reject();
    // Revocation/account state is checked on every request, not cached with keys.
    const user=await lookupUser(claims.sub);
    if(!user || user.uid!==claims.sub || user.disabled || user.emailVerified!==true || !Number.isSafeInteger(user.tokensValidAfterSeconds) || claims.auth_time<user.tokensValidAfterSeconds) reject();
    const appUserId=await resolveAppUserId(claims.sub);
    if(typeof appUserId!=='string' || !UUID.test(appUserId)) reject();
    return {firebaseUid:claims.sub,appUserId,authTime:claims.auth_time};
  };
}
