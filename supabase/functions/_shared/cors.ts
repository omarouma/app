// @ts-nocheck - Supabase Edge Functions run on the Deno runtime.
// Shared CORS + JSON helpers for every GaGa edge function.
//
// The allow-list mirrors the origins the product is served from. Requests with
// no/unknown Origin (native Android) get a non-reflective `null` so a browser
// page on an untrusted origin can never read a response.

export const ALLOWED_ORIGINS = new Set<string>([
  'https://gagachat.app',
  'https://www.gagachat.app',
  'https://oumagachat.web.app',
  'https://oumagachat.firebaseapp.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
]);

export function corsHeaders(req: Request, methods = 'GET, POST, OPTIONS'): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'null',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-legacy-authorization',
    'Access-Control-Allow-Methods': methods,
    'Cache-Control': 'private, no-store, no-cache, must-revalidate',
    Vary: 'Origin',
  };
}

export function jsonResponse(req: Request, body: unknown, status = 200, methods?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req, methods), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Returns a 204 preflight response for OPTIONS, otherwise null. */
export function handlePreflight(req: Request, methods?: string): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response(null, { status: 204, headers: corsHeaders(req, methods) });
}
