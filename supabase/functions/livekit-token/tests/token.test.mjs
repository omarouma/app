import test from 'node:test';
import assert from 'node:assert/strict';
let handler;
const config = {SUPABASE_URL:'https://example.supabase.co', SUPABASE_ANON_KEY:'test-public-key', LIVEKIT_URL:'wss://example.livekit.cloud', LIVEKIT_API_KEY:'test-key', LIVEKIT_API_SECRET:'test-only-secret'};
globalThis.Deno = { env: {get: key => config[key]}, serve: fn => {handler=fn;} };
await import('../index.ts');
const user='11111111-1111-4111-8111-111111111111';
const callId='22222222-2222-4222-8222-222222222222';
const now=Date.now();
const call={id:callId, caller_id:user, callee_id:'other', status:'ringing', created_at:new Date(now).toISOString()};
async function request(row=call, identity=user, authenticated=true) {
 const requests=[];
 globalThis.fetch=async url => {
  requests.push(String(url));
  if(String(url).includes('/auth/v1/user')) return Response.json({id:user});
  if(String(url).includes('/rest/v1/call_history')) return Response.json(row ? [row] : []);
  throw new Error('Unexpected request: '+url);
 };
 const response=await handler(new Request(`https://example/functions/v1/livekit-token?room=call_${callId}&user=${identity}`, {headers:authenticated ? {Authorization:'Bearer test'} : {}}));
 return {response, body:await response.json(), requests};
}
test('rejects unauthenticated requests',async()=>assert.equal((await request(call,user,false)).response.status,401));
test('rejects identity impersonation',async()=>assert.equal((await request(call,'stranger')).response.status,403));
test('rejects unknown call',async()=>assert.equal((await request(null)).response.status,404));
test('rejects nonparticipants',async()=>assert.equal((await request({...call,caller_id:'stranger'})).response.status,403));
test('rejects completed calls',async()=>assert.equal((await request({...call,status:'ended'})).response.status,409));
test('rejects stale unanswered call',async()=>assert.equal((await request({...call,created_at:new Date(now-180000).toISOString()})).response.status,409));
test('permits long connected call and issues room-scoped token',async()=>{
 const {response,body,requests}=await request({...call,status:'connected',created_at:new Date(now-180000).toISOString()});
 assert.equal(response.status,200);
 const payload=JSON.parse(Buffer.from(body.token.split('.')[1],'base64url'));
 assert.equal(payload.sub,user); assert.equal(payload.video.room,'call_'+callId); assert.equal(payload.video.roomJoin,true);
 assert.equal(requests.length,2); // no duplicated FCM/device lookup during token refresh
 const crypto=await import('node:crypto');
 assert.equal(body.token.split('.')[2],crypto.createHmac('sha256',config.LIVEKIT_API_SECRET).update(body.token.split('.').slice(0,2).join('.')).digest('base64url'));
});
test('rejects abandoned connected calls after 24 hours',async()=>assert.equal((await request({...call,status:'connected',created_at:new Date(now-25*3600000).toISOString()})).response.status,409));
test('permits compact Android identity',async()=>assert.equal((await request(call,user.replaceAll('-',''))).response.status,200));
