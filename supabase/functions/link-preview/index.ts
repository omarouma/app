// @ts-nocheck - Supabase Edge Functions run on the Deno runtime.
// Supabase Edge Function: link-preview
//
// Fetches OpenGraph / Twitter-card metadata for a URL so the client can render
// a rich link-preview card (§41) without ever making a cross-origin request.
//
// Security posture (SSRF hygiene):
//   * Only http/https URLs are accepted.
//   * Private / loopback / link-local / metadata hosts are rejected.
//   * The response body is capped (512 KB) and the request times out (6 s).
//   * Redirects are followed manually and re-validated at every hop.
//   * Only a small, fixed set of metadata fields is returned — never the raw
//     HTML — so the function cannot be abused as a generic proxy.

const MAX_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 3;

const allowedOrigins = new Set([
  'https://gagachat.app',
  'https://oumagachat.web.app',
  'https://oumagachat.firebaseapp.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'capacitor://localhost',
  'https://localhost',
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

const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^\[?::1\]?$/,
  /\.local$/i,
  /^metadata\./i,
];

function isSafeUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname;
  if (!host || !host.includes('.')) return null;
  if (BLOCKED_HOST_PATTERNS.some((re) => re.test(host))) return null;
  return url;
}

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCharCode(parseInt(h, 16)));
}

function metaContent(html: string, names: string[]): string | undefined {
  for (const name of names) {
    // property="og:title" content="..."  OR  content="..." property="og:title"
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, 'i'),
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m && m[1]) {
        const value = decodeEntities(m[1]).trim();
        if (value) return value;
      }
    }
  }
  return undefined;
}

function titleTag(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m || !m[1]) return undefined;
  const value = decodeEntities(m[1]).replace(/\s+/g, ' ').trim();
  return value || undefined;
}

function resolveUrl(base: string, maybeRelative: string | undefined): string | undefined {
  if (!maybeRelative) return undefined;
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return undefined;
  }
}

async function fetchWithRedirects(startUrl: URL): Promise<{ html: string; finalUrl: string } | null> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'GaGa-LinkPreview/1.0 (+https://gagachat.app)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
    } catch {
      clearTimeout(timer);
      return null;
    }
    clearTimeout(timer);

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return null;
      const next = isSafeUrl(new URL(location, current).toString());
      if (!next) return null;
      current = next;
      continue;
    }

    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return null;
    }

    // Stream the body with a hard byte cap.
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_BYTES) {
          try { await reader.cancel(); } catch { /* ignore */ }
          break;
        }
        chunks.push(value);
      }
    }
    const merged = new Uint8Array(total > MAX_BYTES ? MAX_BYTES : total);
    let offset = 0;
    for (const chunk of chunks) {
      if (offset >= merged.length) break;
      const slice = chunk.subarray(0, merged.length - offset);
      merged.set(slice, offset);
      offset += slice.byteLength;
    }
    const html = new TextDecoder('utf-8', { fatal: false }).decode(merged);
    return { html, finalUrl: current.toString() };
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return json(req, { error: 'Method not allowed' }, 405);
  }

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'Invalid JSON body' }, 400);
  }

  const target = isSafeUrl(String(body.url ?? ''));
  if (!target) {
    return json(req, { error: 'Invalid or disallowed URL' }, 400);
  }

  const fetched = await fetchWithRedirects(target);
  if (!fetched) {
    return json(req, { url: target.toString(), domain: target.hostname.replace(/^www\./i, '') });
  }

  const { html, finalUrl } = fetched;
  const domain = new URL(finalUrl).hostname.replace(/^www\./i, '');

  const title =
    metaContent(html, ['og:title', 'twitter:title']) ?? titleTag(html);
  const description = metaContent(html, [
    'og:description',
    'twitter:description',
    'description',
  ]);
  const image = resolveUrl(
    finalUrl,
    metaContent(html, ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']),
  );
  const siteName = metaContent(html, ['og:site_name', 'application-name']);

  return json(req, {
    url: finalUrl,
    domain,
    title: title?.slice(0, 300),
    description: description?.slice(0, 500),
    image,
    siteName: siteName?.slice(0, 120),
  });
});
