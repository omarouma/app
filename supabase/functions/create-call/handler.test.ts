import test from "node:test";
import assert from "node:assert/strict";
import { createHandler, type Dependencies } from "./handler.ts";
const me = "11111111-1111-4111-8111-111111111111";
const peer = "22222222-2222-4222-8222-222222222222";
const call = "33333333-3333-4333-8333-333333333333";
const request = (body: unknown = { chat_id: "chat", callee_id: peer, type: "voice", request_id: call }, auth = "Bearer test") =>
  new Request("https://example.test/create-call", { method: "POST", headers: { Authorization: auth }, body: JSON.stringify(body) });
const dependencies = (overrides: Partial<Dependencies> = {}): Dependencies => ({
  authenticate: async () => me,
  create: async () => ({ call_id: call, room_id: "room", status: "ringing", replayed: false }),
  notify: async () => {}, background: p => { void p; }, appId: 123, ...overrides,
});
test("rejects unauthenticated and malformed requests before database access", async () => {
  let writes = 0;
  const handler = createHandler(dependencies({ create: async () => { writes++; return {}; } }));
  assert.equal((await handler(request({}, ""))).status, 401);
  assert.equal((await handler(request({ chat_id: "chat", callee_id: "bad", type: "voice" }))).status, 400);
  assert.equal((await handler(request({ chat_id: "chat", callee_id: me, type: "voice" }))).status, 400);
  assert.equal((await handler(request(null))).status, 400);
  assert.equal(writes, 0);
});
test("verified identity and idempotency key reach the atomic RPC; replay never pushes", async () => {
  let pushes = 0;
  const handler = createHandler(dependencies({
    create: async (caller, req) => {
      assert.equal(caller, me); assert.equal(req.request_id, call); assert.equal(req.type, "voice");
      return { call_id: call, room_id: "room", replayed: true };
    }, notify: async () => { pushes++; },
  }));
  const response = await handler(request({ chat_id: "chat", callee_id: peer, type: "audio", request_id: call, caller_id: peer }));
  assert.equal(response.status, 200); assert.equal((await response.json()).call_id, call); assert.equal(pushes, 0);
});
test("busy and membership failures never notify", async () => {
  for (const [error, status] of [["BUSY", 409], ["BLOCKED", 403], ["NOT_CHAT_MEMBERS", 403]] as const) {
    const handler = createHandler(dependencies({ create: async () => ({ error }), notify: async () => assert.fail("Unexpected push") }));
    assert.equal((await handler(request())).status, status);
  }
});
test("new call notifies once; infrastructure errors expose no database details", async () => {
  let pushes = 0;
  const handler = createHandler(dependencies({ notify: async () => { pushes++; } }));
  assert.equal((await handler(request())).status, 200); assert.equal(pushes, 1);
  const failure = await createHandler(dependencies({ create: async () => { throw new Error("secret database details"); } }))(request());
  assert.equal(failure.status, 503); assert.ok(!(await failure.text()).includes("secret"));
});
