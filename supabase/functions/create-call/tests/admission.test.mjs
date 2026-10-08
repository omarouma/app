import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../handler.ts';
const caller='11111111-1111-4111-8111-111111111111', callee='22222222-2222-4222-8222-222222222222';
function fixture(admission) {
 let created=0,notified=0;
 const authorize=async()=>typeof admission==='string'
  ?{allowed:admission==='OK',reason:admission}
  :admission;
 const handler=createHandler({authenticate:async()=>caller,authorize,create:async()=>{created++;return {call_id:callee,room_id:'gaga_call_'+callee.replaceAll('-','')};},notify:async()=>{notified++;},background:()=>{},appId:0});
 return {handler,counters:()=>({created,notified})};
}
const request=()=>new Request('https://example/create-call',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({chat_id:'chat',callee_id:callee,type:'voice'})});
test('denied callers create no row and send no invitation',async()=>{
 const f=fixture({allowed:false,reason:'CALL_NOT_ALLOWED'}),r=await f.handler(request());assert.equal(r.status,403);assert.deepEqual(f.counters(),{created:0,notified:0});
});
test('permitted caller creates call and schedules one invitation',async()=>{
 const f=fixture({allowed:true,reason:'OK'}),r=await f.handler(request());assert.equal(r.status,200);assert.deepEqual(f.counters(),{created:1,notified:1});
});
test('each admission reason maps to a distinct, actionable refusal',async()=>{
 const cases=[['SESSION_EXPIRED',401],['NOT_FRIENDS',403],['BLOCKED',403],['CALLS_DISABLED',403],['USER_NOT_FOUND',404],['CANNOT_CALL_SELF',400]];
 for(const [reason,status] of cases){
  const f=fixture({allowed:false,reason}),r=await f.handler(request());
  assert.equal(r.status,status,reason);
  const body=await r.json();
  assert.equal(body.error,reason);
  assert.ok(typeof body.message==='string'&&body.message.length>0,reason);
  assert.deepEqual(f.counters(),{created:0,notified:0},reason);
 }
});
test('unknown admission reason falls back to a generic 403 without creating a row',async()=>{
 const f=fixture({allowed:false,reason:'SOMETHING_NEW'}),r=await f.handler(request());
 assert.equal(r.status,403);assert.deepEqual(f.counters(),{created:0,notified:0});
});
