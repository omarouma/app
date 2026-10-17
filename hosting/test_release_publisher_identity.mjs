import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyPublisher } from './release_publisher_identity.mjs';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='test';
const fetcher=async url=>{assert.equal(url,'https://www.googleapis.com/oauth2/v3/certs');return new Response(JSON.stringify({keys:[jwk]}));};
const b64=value=>Buffer.from(value).toString('base64url');
const base={iss:'https://accounts.google.com',aud:'release-endpoint',email:'publisher@example.test',email_verified:true,sub:'publisher-id',iat:1000,exp:4600};
async function token(claims=base,alg='RS256'){
 const input=b64(JSON.stringify({alg,kid:'test'}))+'.'+b64(JSON.stringify(claims));
 return input+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(input)));
}
const verify=value=>verifyPublisher(value,'release-endpoint','publisher@example.test','publisher-id',fetcher,1100);
test('accepts only the pinned Google identity and endpoint audience',async()=>{
 assert.equal(await verify(await token()),true);
 for(const changed of [{aud:'other-endpoint'},{email:'other@example.test'},{sub:'other-id'},{email_verified:false},{iss:'untrusted'}])assert.equal(await verify(await token({...base,...changed})),false);
});
test('rejects stale/expired/future tokens and non-RSA algorithms',async()=>{
 for(const changed of [{iat:100},{exp:1099},{iat:1200}])assert.equal(await verify(await token({...base,...changed})),false);
 assert.equal(await verify(await token(base,'none')),false);
});
test('rejects tampered signatures and malformed tokens',async()=>{
 const valid=await token();const parts=valid.split('.');parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);
 assert.equal(await verify(parts.join('.')),false);
 assert.equal(await verify('not-a-token'),false);
});
