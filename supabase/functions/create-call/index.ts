// Supabase Edge Function: create-call
//
// The single authenticated boundary for starting a 1:1 or group call. The
// caller's identity is derived EXCLUSIVELY from the verified bearer token, which
// may be a Firebase ID token (primary) or a legacy Supabase session. Both are
// resolved to a canonical GaGa user id before anything is created.
//
// Firebase callers cannot use PostgREST row-level security (Supabase never sees
// their token), so the eligibility check and the call-row insert run through the
// service-role bridges `gaga_can_call_service` / `gaga_create_call[_service]`,
// which take the caller id explicitly. Supabase callers keep using the
// RLS-scoped `gaga_can_call` exactly as before.
import { createHandler, type CallResult } from "./handler.ts";
import { resolveIdentityFromHeader, serviceHeaders } from "../_shared/auth.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: serviceHeaders(), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Database request failed (${response.status})`);
  return response;
}

async function notify(call: CallResult, chatId: string) {
  const response = await rest(`users?select=display_name,name,username&id=eq.${call.caller_id}`);
  const [caller] = await response.json();
  const callerName = caller?.display_name || caller?.name || caller?.username || "GaGa User";
  const data = { call_id: call.call_id, caller_id: call.caller_id, chat_id: chatId,
    conversation_id: chatId, room_id: call.room_id, call_type: call.call_type };
  // Independent best-effort paths. Call creation and signaling are already atomic.
  await Promise.allSettled([
    rest("notifications", { method: "POST", body: JSON.stringify({
      user_id: call.callee_id, actor_id: call.caller_id, type: "call", title: callerName,
      body: `Incoming ${call.call_type} call`, data, created_at: new Date().toISOString(),
    }) }),
    fetch(`${url}/functions/v1/send-fcm-push`, { method: "POST", headers: serviceHeaders(),
      signal: AbortSignal.timeout(10_000), body: JSON.stringify({ ...data, type: "call",
        user_id: call.callee_id, caller_name: callerName, is_video: call.call_type === "video" }),
    }).then(response => { if (!response.ok) throw new Error("Call push failed"); }),
  ]).then(results => { if (results.some(r => r.status === "rejected")) console.warn("A call notification delivery path failed"); });
}

// Creates the call row. Prefers the long-standing `gaga_create_call` RPC and
// falls back to the migration-defined bridge `gaga_create_call_service` (same
// signature) so a deployment built purely from this repository still works.
async function createCall(callerId: string, request: { chat_id: string; callee_id: string; type: string; request_id: string | null }) {
  const body = JSON.stringify({
    p_chat_id: request.chat_id, p_callee_id: request.callee_id, p_type: request.type,
    p_caller_id: callerId, p_request_id: request.request_id,
  });
  const post = (rpc: string) => fetch(`${url}/rest/v1/rpc/${rpc}`, {
    method: "POST", headers: serviceHeaders(), body, signal: AbortSignal.timeout(10_000),
  });
  let response = await post("gaga_create_call");
  if (response.status === 404) response = await post("gaga_create_call_service");
  if (!response.ok) throw new Error(`Database request failed (${response.status})`);
  return response.json();
}

Deno.serve(createHandler({
  appId: Number(Deno.env.get("ZEGO_APP_ID") ?? "0"),
  authenticate: async authorization => {
    const identity = await resolveIdentityFromHeader(authorization);
    return identity?.gagaUserId ?? null;
  },
  authorize: async (authorization, callee) => {
    const identity = await resolveIdentityFromHeader(authorization);
    if (!identity) return false;
    if (identity.method === "firebase") {
      const response = await fetch(`${url}/rest/v1/rpc/gaga_can_call_service`, { method: "POST",
        headers: serviceHeaders(),
        body: JSON.stringify({ caller: identity.gagaUserId, callee }), signal: AbortSignal.timeout(8000) });
      return response.ok && await response.json() === true;
    }
    const response = await fetch(`${url}/rest/v1/rpc/gaga_can_call`, { method: "POST",
      headers: { apikey: anon, Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ callee }), signal: AbortSignal.timeout(8000) });
    return response.ok && await response.json() === true;
  },
  create: createCall,
  notify,
  background: work => EdgeRuntime.waitUntil(work),
}));
