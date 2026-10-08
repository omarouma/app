// @ts-nocheck - Supabase Edge Functions run on the Deno runtime.
// Supabase Edge Function: translate-message
//
// GaGa Language Bridge (Signature Features 2.4).
//
// Translates one message body on demand. The provider credentials live only in
// the function environment; the APK never carries a translation key. The
// original message is never modified — this endpoint is read-only and returns a
// separate translated string that the client shows next to the original.
//
// Deploy with:
//   supabase functions deploy translate-message
// and set ONE of the provider secrets (values are project-specific and must NOT
// be committed):
//
//   # Option A — LibreTranslate-compatible endpoint (self-hosted or hosted):
//   supabase secrets set \
//     TRANSLATE_API_URL=https://libretranslate.example.com/translate \
//     TRANSLATE_API_KEY=<optional key>
//
//   # Option B — Google Cloud Translation v2:
//   supabase secrets set GOOGLE_TRANSLATE_API_KEY=<api key>
//
// Security model
// --------------
//  1. The caller must present a valid Supabase session (Bearer token).
//  2. The text is length-capped and the target language is validated against a
//     small allow-list, so the function cannot be used as an open proxy.
//  3. The function discloses the provider so the UI can tell the user that the
//     text was processed in the cloud.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const TRANSLATE_API_URL = Deno.env.get('TRANSLATE_API_URL') ?? '';
const TRANSLATE_API_KEY = Deno.env.get('TRANSLATE_API_KEY') ?? '';
const GOOGLE_TRANSLATE_API_KEY = Deno.env.get('GOOGLE_TRANSLATE_API_KEY') ?? '';

/** Hard cap on the text we will forward to a provider. */
const MAX_TEXT_LENGTH = 5000;
/** Only these ISO-639-1 codes are accepted as a target. */
const ALLOWED_TARGETS = new Set([
  'en', 'bn', 'zh', 'hi', 'ar', 'es', 'fr', 'de', 'pt', 'ru', 'ja', 'ko', 'id', 'tr', 'ur',
]);

const allowedOrigins = new Set([
  'https://gagachat.app',
  'https://oumagachat.web.app',
  'https://oumagachat.firebaseapp.com',
  'http://localhost:3000',
  'http://localhost:5173',
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'null',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'private, no-store, no-cache, must-revalidate',
    'Vary': 'Origin',
  };
}

function json(req: Request, body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function authenticate(authorization: string | null): Promise<string | null> {
  if (!authorization || !authorization.toLowerCase().startsWith('bearer ')) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: authorization },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error('Authentication service unavailable');
  return (await response.json()).id ?? null;
}

async function viaLibreTranslate(text: string, source: string, target: string) {
  const response = await fetch(TRANSLATE_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      q: text,
      source: source === 'auto' ? 'auto' : source,
      target,
      format: 'text',
      ...(TRANSLATE_API_KEY ? { api_key: TRANSLATE_API_KEY } : {}),
    }),
  });
  if (!response.ok) throw new Error(`Translation provider failed (${response.status})`);
  const data = await response.json();
  return {
    translated: String(data.translatedText ?? ''),
    sourceLang: data.detectedLanguage?.language ?? (source === 'auto' ? null : source),
    provider: 'libretranslate',
  };
}

async function viaGoogle(text: string, source: string, target: string) {
  const response = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(GOOGLE_TRANSLATE_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        q: text,
        target,
        format: 'text',
        ...(source === 'auto' ? {} : { source }),
      }),
    },
  );
  if (!response.ok) throw new Error(`Translation provider failed (${response.status})`);
  const data = await response.json();
  const translation = data?.data?.translations?.[0] ?? {};
  return {
    translated: String(translation.translatedText ?? ''),
    sourceLang: translation.detectedSourceLanguage ?? (source === 'auto' ? null : source),
    provider: 'google-translate',
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);

  let userId: string | null;
  try {
    userId = await authenticate(req.headers.get('Authorization'));
  } catch {
    return json(req, { error: 'auth_unavailable' }, 503);
  }
  if (!userId) return json(req, { error: 'unauthorized' }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(req, { error: 'invalid_json' }, 400);
  }

  const text = typeof payload.text === 'string' ? payload.text : '';
  const target = (typeof payload.target === 'string' ? payload.target : '').toLowerCase().trim();
  const source = (typeof payload.source === 'string' ? payload.source : 'auto').toLowerCase().trim() || 'auto';

  if (!text.trim()) return json(req, { error: 'empty_text' }, 400);
  if (text.length > MAX_TEXT_LENGTH) return json(req, { error: 'text_too_long', max: MAX_TEXT_LENGTH }, 413);
  if (!ALLOWED_TARGETS.has(target)) return json(req, { error: 'unsupported_target' }, 400);

  if (!TRANSLATE_API_URL && !GOOGLE_TRANSLATE_API_KEY) {
    return json(req, { error: 'translation_not_configured' }, 503);
  }

  try {
    const result = TRANSLATE_API_URL
      ? await viaLibreTranslate(text, source, target)
      : await viaGoogle(text, source, target);
    return json(req, {
      translated: result.translated,
      source_lang: result.sourceLang,
      target_lang: target,
      provider: result.provider,
      disclosure: 'Text was processed in the cloud by a third-party translation service.',
    });
  } catch (error) {
    console.error('translate-message failed', error);
    return json(req, { error: 'translation_failed' }, 502);
  }
});
