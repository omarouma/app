import test from 'node:test';
import assert from 'node:assert/strict';

// Ephemeral test-only key. Production credentials are never loaded.
const keys = await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
  publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const encoded = Buffer.from(await crypto.subtle.exportKey('pkcs8',keys.privateKey)).toString('base64');
const values = {SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public-test',
  FIREBASE_PROJECT_ID:'synthetic-test',FIREBASE_CLIENT_EMAIL:'test@synthetic-test.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY:`-----BEGIN PRIVATE KEY-----\n${encoded}\n-----END PRIVATE KEY-----`};
let handler;
globalThis.Deno = {env:{get:key=>values[key]},serve:fn=>{handler=fn;}};
await import('../index.ts');
const userId='11111111-1111-4111-8111-111111111111';
const request=(method='GET',token='user-test',body)=>new Request('https://example/firebase-token',{
  method,headers:{...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
function backend({authStatus=200,user={id:userId},session=true,sessionStatus=200}={}) {
  const calls=[];
  globalThis.fetch=async(url,init)=>{
    calls.push({url:String(url),init});
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(init.headers.Authorization,'Bearer user-test');
    assert.equal(init.headers.apikey,'public-test');
    if(String(url).endsWith('/auth/v1/user')) return Response.json(user,{status:authStatus});
    assert.ok(String(url).endsWith('/rpc/gaga_session_active'));
    assert.equal(init.method,'POST');
    assert.equal(init.body,'{}');
    return Response.json(session,{status:sessionStatus});
  };
  return calls;
}
test('missing authentication never calls backend',async()=>{
  const calls=backend(); assert.equal((await handler(request('GET',''))).status,401); assert.equal(calls.length,0);
});
test('invalid user authentication never checks session or mints',async()=>{
  const calls=backend({authStatus:401}); assert.equal((await handler(request())).status,401); assert.equal(calls.length,1);
});
test('malformed identity never checks session or mints',async()=>{
  for(const user of [{},{id:''},{id:17}]) {
    const calls=backend({user}); assert.equal((await handler(request())).status,401); assert.equal(calls.length,1);
  }
});
test('revoked session cannot obtain a new Firebase token',async()=>{
  const calls=backend({session:false}); const res=await handler(request());
  assert.equal(res.status,401); assert.equal(calls.length,2); assert.equal((await res.json()).customToken,undefined);
});
test('session check requires literal boolean true',async()=>{
  for(const session of ['true',1,{},[true],null]) {
    backend({session}); assert.equal((await handler(request())).status,401);
  }
});
test('session RPC errors fail closed',async()=>{
  for(const sessionStatus of [401,403,500]) {
    backend({session:true,sessionStatus}); assert.equal((await handler(request())).status,401);
  }
});
test('session outage and malformed JSON fail closed',async()=>{
  for(const fail of [()=>{throw new Error('offline');},()=>new Response('not-json')]) {
    backend(); const original=globalThis.fetch;
    globalThis.fetch=(url,init)=>String(url).endsWith('/auth/v1/user')?original(url,init):fail();
    assert.equal((await handler(request())).status,401);
  }
});
test('active session mints a verifiable token only for the authenticated user',async()=>{
  const calls=backend();
  const res=await handler(request('POST','user-test',{uid:'forged',session_id:'forged',projectId:'forged'}));
  assert.equal(res.status,200); assert.equal(calls.length,2);
  const body=await res.json(); assert.equal(body.uid,userId); assert.equal(body.projectId,'synthetic-test');
  const [header,payload,signature]=body.customToken.split('.');
  const claims=JSON.parse(Buffer.from(payload,'base64url').toString());
  assert.equal(claims.uid,userId); assert.equal(claims.exp-claims.iat,3600);
  assert.equal(claims.iss,values.FIREBASE_CLIENT_EMAIL);
  assert.ok(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',keys.publicKey,
    Buffer.from(signature,'base64url'),new TextEncoder().encode(`${header}.${payload}`)));
  assert.match(res.headers.get('Cache-Control'),/no-store/);
  assert.equal(JSON.stringify(body).includes('PRIVATE KEY'),false);
});
test('preflight allows supported POST and performs no auth calls',async()=>{
  const calls=backend();const res=await handler(request('OPTIONS',''));
  assert.equal(res.status,204);assert.match(res.headers.get('Access-Control-Allow-Methods'),/POST/);assert.equal(calls.length,0);
});
test('unsupported method performs no auth calls',async()=>{
  const calls=backend();assert.equal((await handler(request('DELETE'))).status,405);assert.equal(calls.length,0);
});
