// Pure request boundary; tests do not contact users or send notifications.
export type CallRequest = { chat_id: string; callee_id: string; type: string; request_id: string | null };
export type CallResult = Record<string, unknown> & { error?: string; replayed?: boolean };
/**
 * Result of the server-side admission check. `reason` is a machine code returned
 * by the `gaga_call_admission` RPC ("OK", "SESSION_EXPIRED", "NOT_FRIENDS",
 * "BLOCKED", "CALLS_DISABLED", "USER_NOT_FOUND", ...). It lets the boundary tell
 * an expired session apart from a blocked contact or a missing friendship so the
 * client can show an actionable message instead of a generic 403.
 */
export type CallAdmission = { allowed: boolean; reason: string };
export type Dependencies = {
  authenticate: (authorization: string) => Promise<string | null>;
  authorize: (authorization: string, callee: string) => Promise<CallAdmission>;
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
/**
 * Specific, actionable refusals for the admission reasons returned by the
 * `gaga_call_admission` RPC. Without this the client only ever saw a generic
 * 403 ("You don't have permission to do that.") and could not tell an expired
 * session from a blocked contact or a missing friendship.
 */
const admissionDenied: Record<string, { status: number; error: string; message: string }> = {
  SESSION_EXPIRED: { status: 401, error: "SESSION_EXPIRED", message: "Your session has expired. Please sign in again." },
  INVALID_CALL_REQUEST: { status: 400, error: "INVALID_CALL_REQUEST", message: "That call request was not valid." },
  CANNOT_CALL_SELF: { status: 400, error: "CANNOT_CALL_SELF", message: "You can't call yourself." },
  USER_NOT_FOUND: { status: 404, error: "USER_NOT_FOUND", message: "This account is no longer available." },
  BLOCKED: { status: 403, error: "BLOCKED", message: "You can't call this person." },
  CALLS_DISABLED: { status: 403, error: "CALLS_DISABLED", message: "This person isn't accepting calls right now." },
  NOT_FRIENDS: { status: 403, error: "NOT_FRIENDS", message: "You can only call people who have added you as a friend." },
  CALL_NOT_ALLOWED: { status: 403, error: "CALL_NOT_ALLOWED", message: "This person isn't accepting your calls. You can only call people who have added you as a friend." },
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
      // The admission check returns a specific reason (expired session, blocked,
      // not friends, calls disabled, ...) so the client can explain the refusal.
      const admission = await deps.authorize(auth, calleeId);
      if (!admission.allowed) {
        const denied = admissionDenied[admission.reason] ?? admissionDenied.CALL_NOT_ALLOWED;
        return json({ error: denied.error, message: denied.message }, denied.status);
      }
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
