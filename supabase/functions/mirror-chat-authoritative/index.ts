// @ts-nocheck — Deno Edge Function; uses only WebCrypto + Google REST APIs.
import { createHandler, type ChatRow } from "./handler.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const firebaseProject = Deno.env.get("FIREBASE_PROJECT_ID") ?? "";
const email = Deno.env.get("FIREBASE_CLIENT_EMAIL") ?? "";
const pem = (Deno.env.get("FIREBASE_PRIVATE_KEY") ?? "").replace(/\\n/g, "\n");
// Opt-in gate is deliberate: no privileged chat writes until rotation + QA.
const enabled = Deno.env.get("GAGA_FIREBASE_MIRROR_PROVISIONING_ENABLED") === "true";
const encoder = new TextEncoder();
const b64u = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const apiBase = `https://firestore.googleapis.com/v1/projects/${firebaseProject}/databases/(default)/documents/chats`;
let accessCache: { token: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  if (!firebaseProject || !email || !pem) throw Error("NOT_CONFIGURED");
  if (accessCache && accessCache.expires > Date.now()) return accessCache.token;
  const keyData = Uint8Array.from(
    atob(pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "")),
    c => c.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8", keyData, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = b64u(encoder.encode(JSON.stringify({
    iss: email, sub: email, aud: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/datastore",
    iat: now, exp: now + 3600,
  })));
  const signed = encoder.encode(`${header}.${claims}`);
  const signature = b64u(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, signed)));
  const result = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }), signal: AbortSignal.timeout(10000),
  });
  if (!result.ok) throw Error("GOOGLE_OAUTH_FAILED");
  const data = await result.json();
  if (!data.access_token) throw Error("GOOGLE_OAUTH_FAILED");
  accessCache = { token: data.access_token,
    expires: Date.now() + Math.max(0, Number(data.expires_in ?? 3600) - 120) * 1000 };
  return accessCache.token;
}

async function googleFetch(url: string, token: string, init: RequestInit = {}) {
  return fetch(url, { ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000),
  });
}
const fields = (chat: ChatRow) => ({
  type: { stringValue: chat.type },
  participants: { arrayValue: { values: chat.participants.map(id => ({ stringValue: id })) } },
});

async function upsertMirror(chat: ChatRow): Promise<"created" | "refreshed"> {
  if (firebaseProject !== "oumagachat") throw Error("PROJECT_MISMATCH");
  const url = `${apiBase}/${encodeURIComponent(chat.id)}`;
  // Optimistic compare-and-swap prevents overwriting a concurrent provisioner.
  // Membership is always reloaded from Supabase for EACH request; a separate
  // server-side deprovisioning hook is required before enabling mirrors.
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = await accessToken();
    const current = await googleFetch(url, token);
    if (current.status !== 404 && !current.ok) throw Error("FIRESTORE_READ_FAILED");
    const exists = current.ok;
    const existing = exists ? await current.json() : null;
    const query = exists
      ? "?updateMask.fieldPaths=type&updateMask.fieldPaths=participants&currentDocument.updateTime=" +
          encodeURIComponent(existing.updateTime)
      : "?currentDocument.exists=false";
    const response = await googleFetch(url + query, token, {
      method: "PATCH", body: JSON.stringify({ fields: fields(chat) }),
    });
    if (response.ok) return exists ? "refreshed" : "created";
    if (response.status !== 409 && response.status !== 412 &&
        response.status !== 404 && response.status !== 400) break;
  }
  throw Error("FIRESTORE_WRITE_FAILED");
}

Deno.serve(createHandler({
  enabled: enabled && !!supabaseUrl && !!anon && !!service &&
    !!firebaseProject && !!email && !!pem,
  authenticate: async authorization => {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: authorization },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    return (await response.json()).id ?? null;
  },
  loadChat: async chatId => {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/chats?select=id,type,participants&id=eq.${encodeURIComponent(chatId)}&limit=1`, {
        headers: { apikey: service, Authorization: `Bearer ${service}` },
        signal: AbortSignal.timeout(10000),
      });
    if (!response.ok) throw Error("SUPABASE_READ_FAILED");
    return ((await response.json()) as ChatRow[])[0] ?? null;
  },
  upsertMirror,
}));
