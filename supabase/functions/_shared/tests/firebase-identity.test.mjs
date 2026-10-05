import test from 'node:test';
import assert from 'node:assert/strict';
import {createFirebaseIdentityVerifier} from '../firebase-identity.mjs';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'test-key',use:'sig',alg:'RS256'};
const base={aud:'oumagachat',iss:'https://securetoken.google.com/oumagachat',sub:'firebase-user',iat:990,auth_time:980,exp:1100,email_verified:true};
const appId='11111111-1111-4111-8111-111111111111';
const b64=x=>Buffer.from(x).toString('base64url');
async function token(changes={},header={alg:'RS256',kid:'test-key'}) {
 const message=b64(JSON.stringify(header))+'.'+b64(JSON.stringify({...base,...changes}));
 return 'Bearer '+message+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(message)));
}
function verifier(options={}) {return createFirebaseIdentityVerifier({projectId:'oumagachat',now:()=>1000000,fetchImpl:async()=>Response.json({keys:[jwk]},{headers:{'cache-control':'max-age=300'}}),lookupUser:async uid=>({uid,emailVerified:true,disabled:false,tokensValidAfterSeconds:0}),resolveAppUserId:async()=>appId,...options});}
test('accepts a signed, verified, mapped identity',async()=>assert.deepEqual(await verifier()(await token()),{firebaseUid:'firebase-user',appUserId:appId,authTime:980}));
for(const [label,change] of Object.entries({wrongProject:{aud:'another'},wrongIssuer:{iss:'https://evil.example'},expired:{exp:1000},futureIssued:{iat:1001},futureAuth:{auth_time:1001},emptyUid:{sub:''},unverified:{email_verified:false},tenant:{firebase:{tenant:'other'}},invalidTime:{exp:'1100'}})) {
 test('rejects '+label,async()=>assert.rejects(verifier()(await token(change))));
}
test('rejects unsigned algorithm',async()=>assert.rejects(verifier()(await token({}, {alg:'none',kid:'test-key'}))));
test('rejects unknown signing key',async()=>assert.rejects(verifier()(await token({}, {alg:'RS256',kid:'unknown'}))));
test('rejects tampered payload',async()=>{
 const value=await token();const parts=value.slice(7).split('.');parts[1]=b64(JSON.stringify({...base,sub:'victim'}));await assert.rejects(verifier()('Bearer '+parts.join('.')));
});
test('rejects disabled account',async()=>assert.rejects(verifier({lookupUser:async uid=>({uid,emailVerified:true,disabled:true,tokensValidAfterSeconds:0})})(await token())));
test('rejects revoked login',async()=>assert.rejects(verifier({lookupUser:async uid=>({uid,emailVerified:true,tokensValidAfterSeconds:981})})(await token())));
test('rejects absent or invalid identity mapping',async()=>{
 for(const id of [null,'firebase-user']) await assert.rejects(verifier({resolveAppUserId:async()=>id})(await token()));
});
test('fails closed on account lookup outage',async()=>assert.rejects(verifier({lookupUser:async()=>{throw Error('offline');}})(await token())));
test('caches public keys but checks revocation each request',async()=>{
 let keys=0,users=0;const verify=verifier({fetchImpl:async()=>{keys++;return Response.json({keys:[jwk]});},lookupUser:async uid=>{users++;return {uid,emailVerified:true,tokensValidAfterSeconds:users===1?0:981};}});
 const signed=await token();await verify(signed);await assert.rejects(verify(signed));assert.equal(keys,1);assert.equal(users,2);
});
test('rejects missing authorization',async()=>assert.rejects(verifier()(null)));
