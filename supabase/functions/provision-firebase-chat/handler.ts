/** Authoritative Firestore chat mirror provisioning. No Firebase client can invent members. */
export type Chat = { id: string; type: string; participants: string[] };
export type Dependencies = {
  authenticate(bearer: string): Promise<string | null>;
  loadChat(id: string): Promise<Chat | null>;
  provision(chat: Chat): Promise<void>;
};

const CHAT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const UID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store" },
  });

/** Input is ONLY a chat ID; member lists, types and roles are never accepted from clients. */
export function createHandler(deps: Dependencies): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
    const bearer = req.headers.get("Authorization") ?? "";
    if (!/^Bearer [^\s]+$/.test(bearer)) return json(401, { error: "UNAUTHORIZED" });
    let caller: string | null;
    try { caller = await deps.authenticate(bearer); } catch { return json(503, { error: "AUTH_UNAVAILABLE" }); }
    if (!caller || !UID.test(caller)) return json(401, { error: "UNAUTHORIZED" });
    let body: unknown;
    try {
      const contentType = req.headers.get("Content-Type") ?? "";
      if (!contentType.toLowerCase().startsWith("application/json")) return json(415, { error: "JSON_REQUIRED" });
      if (Number(req.headers.get("Content-Length") ?? 0) > 1024) return json(413, { error: "TOO_LARGE" });
      const raw = await req.text();
      if (raw.length > 1024) return json(413, { error: "TOO_LARGE" });
      body = JSON.parse(raw);
    } catch { return json(400, { error: "INVALID_JSON" }); }
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).length !== 1 ||
        typeof (body as Record<string, unknown>).chat_id !== "string")
      return json(400, { error: "CHAT_ID_ONLY" });
    const id = (body as { chat_id: string }).chat_id;
    if (!CHAT_ID.test(id)) return json(400, { error: "INVALID_CHAT_ID" });
    let chat: Chat | null;
    try { chat = await deps.loadChat(id); } catch { return json(503, { error: "CHAT_UNAVAILABLE" }); }
    if (!chat || chat.id !== id || !Array.isArray(chat.participants) ||
        !chat.participants.includes(caller)) return json(404, { error: "CHAT_NOT_FOUND" });
    // Refuse empty/duplicate/non-UUID members; invalid source data must never be
    // mirrored into Firestore as an ACL.
    const members = [...new Set(chat.participants)];
    if (members.length !== chat.participants.length || members.length === 0 ||
        members.length > 1000 || members.some(m => typeof m !== "string" || !UID.test(m)) ||
        typeof chat.type !== "string" || !/^[a-z_]{1,40}$/.test(chat.type))
      return json(503, { error: "CHAT_INTEGRITY_CHECK_FAILED" });
    try {
      await deps.provision({ id, type: chat.type, participants: members });
    } catch { return json(503, { error: "MIRROR_UNAVAILABLE" }); }
    return json(200, { ok: true, chat_id: id });
  };
}
