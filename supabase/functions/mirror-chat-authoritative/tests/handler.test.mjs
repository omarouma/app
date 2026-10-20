import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandler, normalizeChat } from "../handler.ts";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const stranger = "33333333-3333-4333-8333-333333333333";
const sample = { id: "chat_1", type: "direct", participants: [bob, alice] };

function setup(overrides = {}) {
  const calls = { loads: 0, writes: 0 };
  const deps = {
    enabled: true,
    authenticate: async () => alice,
    loadChat: async () => { calls.loads++; return sample; },
    upsertMirror: async chat => { calls.writes++; assert.deepEqual(chat.participants, [alice,bob]); assert.equal(chat.type,"dm"); return "created"; },
    ...overrides,
  };
  return { handler: createHandler(deps), calls };
}
const request = (data, headers = { Authorization: "Bearer example-jwt" }) =>
  new Request("http://localhost/mirror", { method:"POST", headers, body:JSON.stringify(data) });
async function status(handler, data, headers) { return (await handler(request(data,headers))).status; }

test("authenticated member provisions only verified Supabase participants", async () => {
  const { handler, calls } = setup();
  const response = await handler(request({chat_id:"chat_1"}));
  assert.equal(response.status,200);
  assert.equal((await response.json()).action,"created");
  assert.equal(calls.loads,1); assert.equal(calls.writes,1);
});
test("disabled endpoint never queries DB or Firestore", async () => {
  const {handler,calls}=setup({enabled:false});
  assert.equal(await status(handler,{chat_id:"chat_1"}),503);
  assert.equal(calls.loads,0);assert.equal(calls.writes,0);
});
test("missing/invalid credentials cannot write", async () => {
  const {handler,calls}=setup();
  assert.equal(await status(handler,{chat_id:"chat_1"},{}),401);
  assert.equal(calls.writes,0);
});
test("foreign chat existence is hidden and never provisioned", async () => {
  const {handler,calls}=setup({authenticate:async()=>stranger});
  assert.equal(await status(handler,{chat_id:"chat_1"}),404);
  assert.equal(calls.writes,0);
});
test("missing chat cannot be provisioned", async () => {
  const {handler,calls}=setup({loadChat:async()=>null});
  assert.equal(await status(handler,{chat_id:"unknown"}),404);
  assert.equal(calls.writes,0);
});
test("client-supplied participants/type/admin claims are rejected", async () => {
  const {handler,calls}=setup();
  for(const payload of [
    {chat_id:"chat_1",participants:[alice,stranger]},
    {chat_id:"chat_1",type:"group"},
    {chat_id:"chat_1",isAdmin:true},
  ]) assert.equal(await status(handler,payload),400);
  assert.equal(calls.writes,0);
});
test("unsafe IDs and invalid JSON cannot reach Supabase", async () => {
  const {handler,calls}=setup();
  assert.equal(await status(handler,{chat_id:"../../../secrets"}),400);
  assert.equal((await handler(new Request("http://localhost",{method:"POST",headers:{Authorization:"Bearer token"},body:"{"}))).status,400);
  assert.equal(calls.writes,0);assert.equal(calls.loads,0);
});
test("live direct type maps to Firebase dm, group stays group", () => {
  assert.equal(normalizeChat(sample).type,"dm");
  assert.equal(normalizeChat({...sample,type:"group"}).type,"group");
  assert.deepEqual(normalizeChat(sample).participants,[alice,bob]);
});
test("duplicate, non-UUID and empty membership are rejected", async () => {
  for(const participants of [[],[alice,alice],[alice,"attacker"],Array(501).fill(alice)]) {
    assert.equal(normalizeChat({...sample,participants}),null);
  }
});
test("backend or Firebase outage fails closed", async () => {
  const a=setup({loadChat:async()=>{throw Error("backend");}});
  assert.equal(await status(a.handler,{chat_id:"chat_1"}),503);assert.equal(a.calls.writes,0);
  const b=setup({upsertMirror:async()=>{throw Error("firebase");}});
  assert.equal(await status(b.handler,{chat_id:"chat_1"}),503);
});
