import test from "node:test";
import assert from "node:assert/strict";
import { buildMessage, errorCode, sendBatch } from "../payload.ts";

let handler;
const SERVICE = "ci-test-service-role-secret";
const PROJECT = "oumagachat";
const config = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: SERVICE,
  FCM_PROJECT_ID: PROJECT,
  FCM_CLIENT_EMAIL: "ci@example.iam.gserviceaccount.com",
  FCM_PRIVATE_KEY: "",
};
globalThis.Deno = { env: { get: name => config[name] ?? "" }, serve: fn => { handler = fn; } };
await import("../index.ts");

const recipient = "22222222-2222-4222-8222-222222222222";
const request = ({ body = { user_id: recipient, type: "friend_request" }, service = true, method = "POST" } = {}) => {
  const headers = { "Content-Type": "application/json" };
  if (service) headers.Authorization = `Bearer ${SERVICE}`;
  return handler(new Request("https://example/functions/v1/send-fcm-push", {
    method, headers, body: method === "POST" ? JSON.stringify(body) : undefined,
  }));
};

test("requires server-only authorization and POST", async () => {
  assert.equal((await request({ service: false })).status, 401);
  assert.equal((await request({ method: "GET" })).status, 405);
  assert.equal((await request({ body: { user_id: recipient, type: "other" } })).status, 400);
  assert.equal((await request({ body: { type: "call" } })).status, 400);
});

test("never loads revoked devices; returns zero devices without false delivery claim", async () => {
  let requested = "";
  globalThis.fetch = async url => {
    requested = String(url);
    return Response.json([]);
  };
  const res = await request();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    success: true, sent: 0, validated: 0, reason: "no_tokens",
    dry_run: false, project_id: PROJECT,
  });
  const u = new URL(requested);
  assert.equal(u.searchParams.get("revoked_at"), "is.null");
  assert.equal(u.searchParams.get("user_id"), `eq.${recipient}`);
  assert.equal(u.searchParams.get("push_token"), "not.is.null");
});

test("friend requests and accepted events use data-only notification with correct owner", () => {
  for (const type of ["friend_request", "friend_accepted"]) {
    const message = buildMessage({
      type,
      user_id: recipient,
      title: type === "friend_request" ? "New friend request" : "Friend request accepted",
      body: "Open GaGa to see friend updates.",
      event_id: `${type}:request-1`,
      data: {
        request_id: "33333333-3333-4333-8333-333333333333",
        actor_id: "11111111-1111-4111-8111-111111111111",
      },
    }, "device-token");
    assert.equal(message.token, "device-token");
    assert.equal(message.data.type, type);
    assert.equal(message.data.recipient_user_id, recipient);
    assert.equal(message.data.request_id, "33333333-3333-4333-8333-333333333333");
    assert.equal(message.data.actor_id, "11111111-1111-4111-8111-111111111111");
    assert.equal(message.data.body, "Open GaGa to see friend updates.");
    assert.equal(message.android.priority, "high");
    assert.equal("notification" in message, false);
    assert.equal(message.data.call_id, undefined);
  }
});

test("invalid FCM token gets invalidated but another device can still receive", async () => {
  const revoked = [];
  const requests = [];
  const result = await sendBatch({
    body: { user_id: recipient, type: "friend_request" },
    tokens: ["stale-token", "valid-token"],
    project: PROJECT,
    bearer: "test-google-access-token",
    dryRun: false,
    fetcher: async (_url, init) => {
      const requestBody = JSON.parse(init.body);
      requests.push(requestBody.message);
      if (requestBody.message.token === "stale-token") {
        return Response.json({
          error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] },
        }, { status: 404 });
      }
      return Response.json({ name: "projects/ci/messages/message-id" });
    },
    invalidate: async token => { revoked.push(token); },
  });
  assert.deepEqual(revoked, ["stale-token"]);
  assert.deepEqual(requests.map(x => x.token), ["stale-token", "valid-token"]);
  assert.equal(result.sent, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.success, false);
  assert.deepEqual(result.errors, ["UNREGISTERED"]);
});

test("does not revoke devices on unrelated FCM transport failure", async () => {
  const revoked = [];
  const result = await sendBatch({
    body: { user_id: recipient, type: "call", call_id: "call-1" },
    tokens: ["valid-token"],
    project: PROJECT, bearer: "ci-token", dryRun: false,
    fetcher: async () => Response.json({
      error: { status: "PERMISSION_DENIED", details: [] },
    }, { status: 403 }),
    invalidate: async token => { revoked.push(token); },
  });
  assert.equal(result.failed, 1);
  assert.deepEqual(revoked, []);
  assert.deepEqual(result.errors, ["PERMISSION_DENIED"]);
});

test("FCM error extraction handles UNREGISTERED detail", () => {
  assert.equal(errorCode({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }), "UNREGISTERED");
});
