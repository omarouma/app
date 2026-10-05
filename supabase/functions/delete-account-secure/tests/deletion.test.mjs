import test from 'node:test';
import assert from 'node:assert/strict';
let handler;
globalThis.Deno = {env:{get:key=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:'service-test'})[key]},serve:fn=>{handler=fn;}};
await import('../index.ts');
const request=auth=>new Request('https://example/delete-account-secure',{method:'POST',headers:auth?{Authorization:'Bearer user-test'}:{}});
test('unauthenticated deletion makes no backend calls',async()=>{
 globalThis.fetch=async()=>{throw new Error('Unexpected backend call');};
 assert.equal((await handler(request(false))).status,401);
});
test('failed recent-auth check never deletes files or account',async()=>{
 const calls=[];globalThis.fetch=async url=>{calls.push(String(url));return new Response(null,{status:403});};
 assert.equal((await handler(request(true))).status,403);
 assert.deepEqual(calls,['https://example.supabase.co/rest/v1/rpc/gaga_deletion_media']);
});
test('failed Storage cleanup retains the account for retry',async()=>{
 const calls=[];globalThis.fetch=async url=>{calls.push(String(url));return String(url).includes('gaga_deletion_media')?Response.json([{bucket_id:'media',name:'uid/photo.jpg'}]):new Response(null,{status:503});};
 assert.equal((await handler(request(true))).status,503);
 assert.equal(calls.some(x=>x.includes('delete_own_account')),false);
});
test('owned bytes are removed before account finalization',async()=>{
 const calls=[];let lists=0;globalThis.fetch=async(url,init)=>{
  calls.push(String(url));
  if(String(url).includes('gaga_deletion_media')) return Response.json(lists++===0?[{bucket_id:'media',name:'uid/photo.jpg'}]:[]);
  if(String(url).includes('/storage/v1/object/')) {assert.equal(init.method,'DELETE');assert.deepEqual(JSON.parse(init.body),{prefixes:['uid/photo.jpg']});return Response.json([]);}
  if(String(url).includes('delete_own_account')) return new Response(null,{status:204});
  throw new Error('Unexpected route');
 };
 assert.equal((await handler(request(true))).status,204);
 assert.equal(calls.length,4);assert.ok(calls[1].includes('/storage/'));assert.ok(calls[3].includes('delete_own_account'));
});
