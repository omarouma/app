import { sendBatch, supportedTypes, validateConfiguration, type Push } from "./payload.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const webhookSecret = Deno.env.get("PUSH_WEBHOOK_SECRET") ?? "";
const project = Deno.env.get("FCM_PROJECT_ID") ?? "";
const email = Deno.env.get("FCM_CLIENT_EMAIL") ?? "";
const enc = new TextEncoder();
let cachedToken: { value: string; expires: number } | null = null;
let pendingToken: Promise<string> | null = null;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});
function b64u(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function mintAccessToken() {
  const pem = (Deno.env.get("FCM_PRIVATE_KEY") ?? "").replace(/\\n/g, "\n");
  if (!project || !email || !pem) throw new Error("FCM_NOT_CONFIGURED");
  const der = Uint8Array.from(atob(pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "")), c => c.charCodeAt(0));
  const now = Math.floor(Date.now() / 1000);
  const input = `${b64u(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })))}.${b64u(enc.encode(JSON.stringify({
    iss: email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })))}`;
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(input)));
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(10_000),
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${input}.${b64u(signature)}` }),
  });
  if (!response.ok) throw new Error("FCM_AUTH_FAILED");
  const body = await response.json();
  if (!body.access_token) throw new Error("FCM_AUTH_FAILED");
  cachedToken = { value: body.access_token, expires: Date.now() + Math.max(0, Number(body.expires_in ?? 3600) - 120) * 1000 };
  return cachedToken.value;
}
async function accessToken() {
  if (cachedToken && cachedToken.expires > Date.now()) return cachedToken.value;
  if (!pendingToken) pendingToken = mintAccessToken().finally(() => { pendingToken = null; });
  return pendingToken;
}
async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, signal: AbortSignal.timeout(10_000),
    headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error("TOKEN_QUERY_FAILED");
  return response;
}
Deno.serve(async req => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const authorized = (service && req.headers.get("Authorization") === `Bearer ${service}`) ||
    (webhookSecret && req.headers.get("x-webhook-secret") === webhookSecret);
  if (!authorized) return json({ error: "UNAUTHORIZED" }, 401);
  let body: Push & { dry_run?: boolean; configuration_check?: boolean };
  try { body = await req.json(); } catch { return json({ error: "INVALID_JSON" }, 400); }
  if (body?.configuration_check === true && body?.dry_run === true) {
    try {
      const result = await validateConfiguration(project, await accessToken(), fetch);
      return json(result, result.success ? 200 : 502);
    } catch { return json({ success: false, error: "FCM_CONFIGURATION_CHECK_FAILED", dry_run: true, sent: 0 }, 503); }
  }
  if (!body || !supportedTypes.has(body.type) || typeof body.user_id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(body.user_id) || (body.dry_run !== undefined && typeof body.dry_run !== "boolean")) {
    return json({ error: "INVALID_PUSH_REQUEST" }, 400);
  }
  try {
    const devices = await (await rest(`user_devices?select=push_token&user_id=eq.${body.user_id}&revoked_at=is.null&push_token=not.is.null`)).json();
    const tokens: string[] = devices.map((d: { push_token: string }) => d.push_token).filter(Boolean);
    const dryRun = body.dry_run === true;
    // Dry run validates credentials even when this account has no device token.
    const bearer = tokens.length || dryRun ? await accessToken() : "";
    if (!tokens.length) return json({ success: true, sent: 0, validated: 0, reason: "no_tokens", dry_run: dryRun, project_id: project });
    const result = await sendBatch({ body, tokens, project, bearer, dryRun, fetcher: fetch,
      invalidate: async token => { await rest(`user_devices?user_id=eq.${body.user_id}&push_token=eq.${encodeURIComponent(token)}`, {
        method: "PATCH", body: JSON.stringify({ push_token: null }),
      }); },
    });
    if (!result.success) console.warn("FCM_DELIVERY_FAILED", result.errors.join(","));
    return json({ ...result, project_id: project }, result.success ? 200 : 502);
  } catch (error) {
    const code = error instanceof Error && ["FCM_NOT_CONFIGURED", "FCM_AUTH_FAILED", "TOKEN_QUERY_FAILED"].includes(error.message)
      ? error.message : "PUSH_SERVICE_UNAVAILABLE";
    console.warn(code);
    return json({ success: false, error: code }, 503);
  }
});
