import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../handler.ts';
const caller='11111111-1111-4111-8111-111111111111', callee='22222222-2222-4222-8222-222222222222';
function fixture(allowed) {
 let created=0,notified=0;
 const handler=createHandler({authenticate:async()=>caller,authorize:async()=>allowed,create:async()=>{created++;return {call_id:callee,room_id:'gaga_call_'+callee.replaceAll('-','')};},notify:async()=>{notified++;},background:()=>{},appId:0});
 return {handler,counters:()=>({created,notified})};
}
const request=()=>new Request('https://example/create-call',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({chat_id:'chat',callee_id:callee,type:'voice'})});
test('denied callers create no row and send no invitation',async()=>{
 const f=fixture(false),r=await f.handler(request());assert.equal(r.status,403);assert.deepEqual(f.counters(),{created:0,notified:0});
});
test('permitted caller creates call and schedules one invitation',async()=>{
 const f=fixture(true),r=await f.handler(request());assert.equal(r.status,200);assert.deepEqual(f.counters(),{created:1,notified:1});
});
