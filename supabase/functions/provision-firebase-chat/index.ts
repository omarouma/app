// Supabase Edge Function — trusted chat mirror provisioning (opt-in staging only).
// The deployed Firebase Admin service identity MUST be rotated before enabling.
// Deploy ONLY after Firebase Rules PR #146 and account-wide membership audit.
import { createHandler, type Chat } from "./handler.ts";

const sbUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const project = (Deno.env.get("FIREBASE_PROJECT_ID") ?? "").trim();
const clientEmail = (Deno.env.get("FIREBASE_CLIENT_EMAIL") ?? "").trim();
const privateKey = (Deno.env.get("FIREBASE_PRIVATE_KEY") ?? "").replace(/\\n/g, "\n");
const authHeaders = (key: string, bearer: string) =>
  ({ apikey: key, Authorization: bearer, "Content-Type": "application/json" });
const timeout = () => AbortSignal.timeout(10_000);
const b64url = (bytes: Uint8Array) => {
  let str = ""; for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
function pemToDer(pem: string): ArrayBuffer {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, "");
  const decoded = atob(base64);
  return Uint8Array.from(decoded, c => c.charCodeAt(0)).buffer;
}
let cached: { value: string; validUntil: number } | null = null;
async function firebaseAccessToken(): Promise<string> {
  if (!/^[a-z][a-z0-9-]{4,29}$/.test(project) || !clientEmail.endsWith(".gserviceaccount.com") ||
      !privateKey.includes("BEGIN PRIVATE KEY")) throw new Error("Firebase not configured");
  if (cached && cached.validUntil > Date.now() + 120_000) return cached.value;
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: clientEmail,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600 };
  const input = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" }))) +
    "." + b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input));
  const assertion = input + "." + b64url(new Uint8Array(signed));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", signal: timeout(),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error("Firebase OAuth rejected credential");
  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token || !data.expires_in) throw new Error("Missing OAuth token");
  cached = { value: data.access_token, validUntil: Date.now() + Math.min(data.expires_in, 3600) * 1000 };
  return cached.value;
}
const dbUrl = (path: string) => sbUrl + "/rest/v1/" + path;
function checkConfig(): void {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(sbUrl) || !anon || !service ||
      !project || !clientEmail || !privateKey) throw new Error("Provisioner not configured");
}
const handler = createHandler({
  authenticate: async (bearer) => {
    checkConfig();
    const response = await fetch(sbUrl + "/auth/v1/user", {
      headers: authHeaders(anon, bearer), signal: timeout() });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new Error("Supabase Auth unavailable");
    const user = await response.json() as { id?: string };
    return user.id ?? null;
  },
  loadChat: async (id) => {
    checkConfig();
    // Supabase is the only authoritative provider of participants. Clients
    // supply only chat_id, never member lists or admin claims.
    const url = dbUrl("chats?select=id,type,participants&id=eq." + encodeURIComponent(id) + "&limit=1");
    const response = await fetch(url, { headers: authHeaders(service, "Bearer " + service), signal: timeout() });
    if (!response.ok) throw new Error("Chat DB unavailable");
    const chats = await response.json() as Chat[];
    return chats[0] ?? null;
  },
  provision: async (chat) => {
    checkConfig();
    // Fetch fresh membership immediately before the authoritative write, so a
    // queued/retried invocation doesn't blindly restore prior access. Full
    // revocation on member removal still requires server-side change hooks.
    const response = await fetch(dbUrl("chats?select=id,type,participants&id=eq." +
      encodeURIComponent(chat.id) + "&limit=1"), {
      headers: authHeaders(service, "Bearer " + service), signal: timeout() });
    if (!response.ok) throw new Error("Chat refresh unavailable");
    const [current] = await response.json() as Chat[];
    if (!current || current.id !== chat.id || current.type !== chat.type ||
        !Array.isArray(current.participants) ||
        JSON.stringify([...current.participants].sort()) !== JSON.stringify([...chat.participants].sort()))
      throw new Error("Membership changed during provisioning");

    const token = await firebaseAccessToken();
    const doc = "https://firestore.googleapis.com/v1/projects/" +
      encodeURIComponent(project) + "/databases/(default)/documents/chats/" +
      encodeURIComponent(chat.id);
    // Patch ONLY authoritative ACL fields, not client preview metadata.
    const query = new URLSearchParams();
    for (const name of ["participants", "type"]) query.append("updateMask.fieldPaths", name);
    const document = { fields: {
      participants: { arrayValue: { values: chat.participants.map(id => ({ stringValue: id })) } },
      type: { stringValue: chat.type },
    } };
    const patched = await fetch(doc + "?" + query, {
      method: "PATCH", signal: timeout(),
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(document),
    });
    if (!patched.ok) throw new Error("Firestore mirror unavailable");
  },
});
Deno.serve(async req => {
  // Disabled unless specifically approved; no deploy/use in production yet.
  if (Deno.env.get("FIREBASE_CHAT_PROVISIONING_ENABLED") !== "true") {
    return new Response(JSON.stringify({ error: "FEATURE_DISABLED" }), {
      status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
  return handler(req);
});
