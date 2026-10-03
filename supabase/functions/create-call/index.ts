import { createHandler, type CallResult } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const serviceHeaders = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: serviceHeaders, signal: AbortSignal.timeout(10_000) });
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
    fetch(`${url}/functions/v1/send-fcm-push`, { method: "POST", headers: serviceHeaders,
      signal: AbortSignal.timeout(10_000), body: JSON.stringify({ ...data, type: "call",
        user_id: call.callee_id, caller_name: callerName, is_video: call.call_type === "video" }),
    }).then(response => { if (!response.ok) throw new Error("Call push failed"); }),
  ]).then(results => { if (results.some(r => r.status === "rejected")) console.warn("A call notification delivery path failed"); });
}
Deno.serve(createHandler({
  appId: Number(Deno.env.get("ZEGO_APP_ID") ?? "0"),
  authenticate: async authorization => {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: authorization }, signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new Error("Authentication service unavailable");
    return (await response.json()).id ?? null;
  },
  create: async (callerId, request) => (await rest("rpc/gaga_create_call", { method: "POST", body: JSON.stringify({
    p_chat_id: request.chat_id, p_callee_id: request.callee_id, p_type: request.type,
    p_caller_id: callerId, p_request_id: request.request_id,
  }) })).json(),
  notify,
  background: work => EdgeRuntime.waitUntil(work),
}));
