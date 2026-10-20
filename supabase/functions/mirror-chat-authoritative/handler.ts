// Supabase Edge Function: mirror-chat-authoritative
// Privileged Firebase provisioning of ONLY Supabase-verified chat metadata.
// Disabled by default; NEVER accept a client-provided participant array.
// Firebase Admin identity must be rotated before enabling this feature.

export interface ChatRow {
  id: string;
  type: string;
  participants: string[];
}
export interface MirrorDependencies {
  authenticate: (authorization: string) => Promise<string | null>;
  loadChat: (chatId: string) => Promise<ChatRow | null>;
  upsertMirror: (chat: ChatRow) => Promise<"created" | "refreshed">;
  enabled: boolean;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const chatIdentifier = /^[A-Za-z0-9_-]{1,128}$/;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

export function normalizeChat(row: ChatRow): ChatRow | null {
  if (!row || typeof row.id !== "string" || !chatIdentifier.test(row.id) ||
      !["direct", "dm", "group"].includes(row.type) || !Array.isArray(row.participants)) return null;
  // A server-owned participant list must be unique and consist solely of valid UIDs.
  if (row.participants.length < 1 || row.participants.length > 500 ||
      row.participants.some((id) => typeof id !== "string" || !uuid.test(id))) return null;
  const unique = [...new Set(row.participants)];
  if (unique.length !== row.participants.length) return null;
  return { id: row.id, type: row.type === "direct" ? "dm" : row.type, participants: [...unique].sort() };
}

export function createHandler(deps: MirrorDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    if (!deps.enabled) return json({ error: "MIRROR_DISABLED" }, 503);
    const authorization = request.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ") || authorization.length > 8192) {
      return json({ error: "UNAUTHORIZED" }, 401);
    }
    const caller = await deps.authenticate(authorization).catch(() => null);
    if (!caller || !uuid.test(caller)) return json({ error: "UNAUTHORIZED" }, 401);
    let input: unknown;
    try { input = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400); }
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        Object.keys(input).some((key) => key !== "chat_id")) {
      return json({ error: "CHAT_ID_ONLY" }, 400);
    }
    const chatId = (input as { chat_id?: unknown }).chat_id;
    if (typeof chatId !== "string" || !chatIdentifier.test(chatId)) {
      return json({ error: "INVALID_CHAT_ID" }, 400);
    }
    let chat: ChatRow | null;
    try { chat = normalizeChat(await deps.loadChat(chatId) as ChatRow); }
    catch { return json({ error: "BACKEND_UNAVAILABLE" }, 503); }
    // Avoid revealing existence/membership: identical response for missing chat
    // and a chat that doesn't include the actual authenticated Supabase user.
    if (!chat || !chat.participants.includes(caller)) return json({ error: "NOT_FOUND" }, 404);
    try {
      const action = await deps.upsertMirror(chat);
      return json({ ok: true, chat_id: chat.id, action });
    } catch {
      // Fail closed: no client-side Firebase membership fallback.
      return json({ error: "MIRROR_UNAVAILABLE" }, 503);
    }
  };
}
