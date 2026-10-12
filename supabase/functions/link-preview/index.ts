// ============================================================================
// GaGa Chat — Edge Function: link-preview
// Fetches OpenGraph metadata for a URL and caches it in the link_previews table.
//
// Usage:
//   POST /functions/v1/link-preview
//   Headers:
//     Authorization: Bearer <supabase_access_token>
//     apikey: <supabase_anon_key>
//     Content-Type: application/json
//   Body: { "url": "https://example.com/article" }
//
// Returns: {
//   "url": "https://example.com/article",
//   "title": "Article Title",
//   "description": "Article description...",
//   "image_url": "https://example.com/image.jpg",
//   "site_name": "Example Site"
// }
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mayFetchRemotePreview, plainLinkPreview } from "./security.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface LinkPreviewResult {
  url: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
}

/**
 * Extracts OpenGraph / Twitter Card / meta tags from HTML.
 */
function extractMetaTags(html: string, originalUrl: string): LinkPreviewResult {
  const result: LinkPreviewResult = {
    url: originalUrl,
    title: null,
    description: null,
    image_url: null,
    site_name: null,
  };

  // Helper: extract content from a meta tag
  const getMetaContent = (pattern: RegExp): string | null => {
    const match = html.match(pattern);
    if (match && match[1]) {
      return match[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
    }
    return null;
  };

  // OpenGraph tags (og:title, og:description, og:image, og:site_name)
  result.title = getMetaContent(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || getMetaContent(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
    || getMetaContent(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i)
    || null;

  result.description = getMetaContent(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
    || getMetaContent(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)
    || getMetaContent(/<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["']/i)
    || getMetaContent(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || null;

  result.image_url = getMetaContent(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || getMetaContent(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
    || getMetaContent(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
    || null;

  result.site_name = getMetaContent(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)
    || getMetaContent(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i)
    || null;

  // Fallback: extract <title> tag
  if (!result.title) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      result.title = titleMatch[1].trim();
    }
  }

  // Fallback: extract site name from URL
  if (!result.site_name) {
    try {
      const u = new URL(originalUrl);
      result.site_name = u.hostname.replace(/^www\./, "");
    } catch {
      // ignore
    }
  }

  // Resolve relative image URLs
  if (result.image_url && !result.image_url.startsWith("http")) {
    try {
      const baseUrl = new URL(originalUrl);
      result.image_url = new URL(result.image_url, baseUrl).href;
    } catch {
      result.image_url = null;
    }
  }

  return result;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405);
  }

  // This endpoint runs with gateway verify_jwt=false; an arbitrary
  // Authorization header must NOT authorize server-side network requests.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!/^Bearer [A-Za-z0-9._~-]{20,}$/.test(authHeader) ||
      !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: "AUTHENTICATION_REQUIRED" }, 401);
  }
  const token = authHeader.slice("Bearer ".length);
  try {
    const identity = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: authHeader },
      signal: AbortSignal.timeout(8000),
    });
    if (!identity.ok) return json({ error: "UNAUTHORIZED" }, identity.status === 401 || identity.status === 403 ? 401 : 503);
    const user = await identity.json() as { id?: string };
    if (!user.id || !/^[0-9a-f-]{36}$/i.test(user.id)) return json({ error: "UNAUTHORIZED" }, 401);
  } catch {
    return json({ error: "AUTHENTICATION_UNAVAILABLE" }, 503);
  }

  // Parse request body
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const url = body.url;
  if (typeof url !== "string" || url.trim().length === 0 || url.length > 2048) {
    return json({ error: "URL must be a string between 1 and 2048 characters." }, 400);
  }

  // Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return json({ error: "Invalid URL format." }, 400);
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return json({ error: "Only HTTP/HTTPS URLs are supported." }, 400);
  }

  // Unapproved hosts are displayed as text-only links; no outgoing
  // request, DNS lookup, redirect or cache retrieval may target them.
  if (!mayFetchRemotePreview(url)) {
    return json(plainLinkPreview(url));
  }

  // Create a Supabase client with the user's token
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  // Check cache first
  const { data: cached } = await supabase
    .from("link_previews")
    .select("*")
    .eq("url", url)
    .maybeSingle();

  // Return cached result if fresh (less than 7 days old)
  if (cached && cached.fetched_at) {
    const ageMs = Date.now() - new Date(cached.fetched_at).getTime();
    if (ageMs < 7 * 24 * 60 * 60 * 1000) {
      return json({
        url: cached.url,
        title: cached.title,
        description: cached.description,
        image_url: cached.image_url,
        site_name: cached.site_name,
        cached: true,
      });
    }
  }

  // Fetch the page HTML
  let html: string;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "GaGaChat-LinkPreview/1.0 (bot)",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(8000), // 8 second timeout
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      // Never follow an HTTP Location header to another host/network.
      return json(plainLinkPreview(url));
    }

    if (!response.ok) {
      // Return a minimal preview with just the URL
      return json({
        url,
        title: parsedUrl.hostname,
        description: null,
        image_url: null,
        site_name: parsedUrl.hostname.replace(/^www\./, ""),
        error: `Fetch failed: ${response.status}`,
      });
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      // Non-HTML content — return minimal preview
      return json({
        url,
        title: parsedUrl.hostname,
        description: null,
        image_url: null,
        site_name: parsedUrl.hostname.replace(/^www\./, ""),
      });
    }

    // Enforce the size limit during streaming: response.text() would first
    // download arbitrarily large responses and truncate only afterwards.
    if (!response.body) return json(plainLinkPreview(url));
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let received = 0;
    let result = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > 500_000) {
        await reader.cancel();
        return json(plainLinkPreview(url));
      }
      result += decoder.decode(value, { stream: true });
    }
    html = result + decoder.decode();
  } catch (error) {
    return json({
      url,
      title: parsedUrl.hostname,
      description: null,
      image_url: null,
      site_name: parsedUrl.hostname.replace(/^www\./, ""),
      error: "Preview temporarily unavailable",
    });
  }

  // Extract metadata
  const preview = extractMetaTags(html, url);

  // Cache the result
  try {
    await supabase.from("link_previews").upsert(
      {
        url: preview.url,
        title: preview.title,
        description: preview.description,
        image_url: preview.image_url,
        site_name: preview.site_name,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "url" },
    );
  } catch {
    // Non-fatal: caching failed, but we still return the preview
  }

  return json({ ...preview, cached: false });
});
