// Pure request boundary; tests do not contact users or send notifications.
export type CallRequest = { chat_id: string; callee_id: string; type: string; request_id: string | null };
export type CallResult = Record<string, unknown> & { error?: string; replayed?: boolean };
export type Dependencies = {
  authenticate: (authorization: string) => Promise<string | null>;
  create: (userId: string, request: CallRequest) => Promise<CallResult>;
  notify: (call: CallResult, chatId: string) => Promise<void>;
  background: (work: Promise<void>) => void;
  appId: number;
};
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const errorStatus: Record<string, number> = {
  BUSY: 409, CALL_ALREADY_FINISHED: 409, INVALID_REQUEST_ID: 409,
  NOT_CHAT_MEMBERS: 403, BLOCKED: 403, CHAT_NOT_FOUND: 404, USER_NOT_FOUND: 404,
  INVALID_CALL_REQUEST: 400,
};

export function createHandler(deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    const auth = req.headers.get("Authorization") ?? "";
    if (!/^Bearer \S+$/i.test(auth)) return json({ error: "UNAUTHORIZED" }, 401);
    try {
      const userId = await deps.authenticate(auth);
      if (!userId) return json({ error: "UNAUTHORIZED" }, 401);
      let body: Record<string, unknown>;
      try {
        body = await req.json();
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
      } catch { return json({ error: "INVALID_JSON" }, 400); }
      const chatId = typeof body.chat_id === "string" ? body.chat_id.trim() : "";
      const calleeId = typeof body.callee_id === "string" ? body.callee_id.trim() : "";
      const type = body.type === "audio" ? "voice" : body.type;
      const requestId = body.request_id ?? null;
      if (!chatId || chatId.length > 256 || !uuid.test(calleeId) ||
          !["voice", "video"].includes(String(type)) ||
          (requestId !== null && (typeof requestId !== "string" || !uuid.test(requestId)))) {
        return json({ error: "INVALID_CALL_REQUEST" }, 400);
      }
      if (calleeId.toLowerCase() === userId.toLowerCase()) return json({ error: "CANNOT_CALL_SELF" }, 400);
      // Identity is derived exclusively from the verified bearer token.
      const call = await deps.create(userId, {
        chat_id: chatId, callee_id: calleeId, type: type as string, request_id: requestId as string | null,
      });
      if (call.error) return json({ error: call.error, message: call.error }, errorStatus[call.error] ?? 500);
      if (typeof call.call_id !== "string" || typeof call.room_id !== "string") throw new Error("Invalid RPC response");
      // A retried request returns the same call without ringing the recipient twice.
      if (!call.replayed) deps.background(deps.notify(call, chatId).catch(() => { console.warn("Call push delivery failed"); }));
      const { replayed: _, ...response } = call;
      return json({ ...response, app_id: deps.appId });
    } catch {
      console.error("Call creation failed at the authenticated server boundary");
      return json({ error: "CALL_CREATE_FAILED", message: "Calling is temporarily unavailable. Please try again." }, 503);
    }
  };
}
