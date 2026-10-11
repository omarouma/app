/**
 * Best-effort FCM dispatch for an already-committed friend request transition.
 * Clients authenticate with their own JWT and submit only {request_id,type}.
 * Server independently verifies the event status + actor before using its
 * service-role key to deliver FCM. The client never receives service secrets.
 *
 * Durable inbox notifications originate from the database trigger, regardless
 * of whether FCM delivery succeeds.
 */
const URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function fetchTimed(path: string, init: RequestInit) {
  return fetch(path, { ...init, signal: AbortSignal.timeout(8500) });
}

Deno.serve(async req => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  if (!URL || !ANON || !SERVICE) return json({ error: "NOT_CONFIGURED" }, 503);
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || authorization === `Bearer ${SERVICE}`) {
    return json({ error: "USER_AUTH_REQUIRED" }, 401);
  }
  let body: { request_id?: unknown; type?: unknown };
  try { body = await req.json(); } catch { return json({ error: "INVALID_JSON" }, 400); }
  const id = typeof body.request_id === "string" ? body.request_id : "";
  const type = body.type;
  if (!UUID.test(id) || (type !== "friend_request" && type !== "friend_accepted")) {
    return json({ error: "INVALID_EVENT" }, 400);
  }

  const verified = await fetchTimed(`${URL}/auth/v1/user`, {
    headers: { apikey: ANON, Authorization: authorization },
  }).catch(() => null);
  if (!verified) return json({ error: "AUTH_UNAVAILABLE" }, 503);
  if (verified.status === 401 || verified.status === 403) return json({ error: "UNAUTHORIZED" }, 401);
  if (!verified.ok) return json({ error: "AUTH_UNAVAILABLE" }, 503);
  const actor = (await verified.json()).id;
  if (!actor || !UUID.test(actor)) return json({ error: "UNAUTHORIZED" }, 401);

  const serviceHeaders = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    "Content-Type": "application/json",
  };
  const query = new URL(`${URL}/rest/v1/friend_requests`);
  query.searchParams.set("select", "id,from_user_id,to_user_id,status");
  query.searchParams.set("id", `eq.${id}`);
  query.searchParams.set("limit", "1");
  const recordResponse = await fetchTimed(query.toString(), { headers: serviceHeaders }).catch(() => null);
  if (!recordResponse?.ok) return json({ error: "REQUEST_UNAVAILABLE" }, 503);
  const rows = await recordResponse.json() as Array<{
    id: string; from_user_id: string; to_user_id: string; status: string;
  }>;
  const record = rows[0];
  if (!record) return json({ error: "REQUEST_NOT_FOUND" }, 404);

  const isRequest = type === "friend_request";
  const eligible = isRequest
    ? record.from_user_id === actor && record.status === "pending"
    : record.to_user_id === actor && record.status === "accepted";
  if (!eligible) return json({ error: "EVENT_NOT_AUTHORIZED" }, 403);

  // DB uniqueness makes repeated client invocations a no-op, preventing a
  // compromised client from flooding the other user's devices.
  const reserve = new URL(`${URL}/rest/v1/friend_push_dispatches`);
  reserve.searchParams.set("on_conflict", "request_id,event_type");
  const reservation = await fetchTimed(reserve.toString(), {
    method: "POST",
    headers: { ...serviceHeaders, Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({ request_id: id, event_type: type }),
  }).catch(() => null);
  if (!reservation?.ok) return json({ error: "DISPATCH_UNAVAILABLE" }, 503);
  const inserted = await reservation.json() as Array<{ request_id: string }>;
  if (inserted.length === 0) return json({ accepted: true, duplicate: true });

  const recipient = isRequest ? record.to_user_id : record.from_user_id;
  const title = isRequest ? "New friend request" : "Friend request accepted";
  const text = isRequest
    ? "Someone wants to connect with you on GaGa."
    : "Your friend request was accepted on GaGa.";
  const send = await fetchTimed(`${URL}/functions/v1/send-fcm-push`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify({
      user_id: recipient,
      type,
      title,
      body: text,
      event_id: `${type}:${id}`,
      data: { request_id: id, user_id: recipient, actor_id: actor },
    }),
  }).catch(() => null);

  if (!send?.ok) return json({ accepted: true, push: "not_delivered" }, 202);
  return json({ accepted: true, push: "dispatched" });
});
