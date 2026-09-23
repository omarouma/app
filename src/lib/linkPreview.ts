/**
 * Link preview utilities (§41).
 *
 * A text message that contains a URL gets a rich preview card (title,
 * description, image, domain). The heavy lifting — fetching the target page and
 * parsing its OpenGraph / Twitter-card metadata — happens in a Supabase Edge
 * Function (`link-preview`) so the client never makes a cross-origin request,
 * never leaks the user's IP to arbitrary hosts, and cannot be used as an SSRF
 * pivot. This module owns URL detection, client-side hygiene checks, the
 * in-memory cache and the thin call into the Edge Function.
 */

import { getSupabaseSafe } from '@/lib/supabase';
import type { LinkPreviewData } from '@/types';

/** Matches the first http(s) URL in a block of text. */
const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/i;

/**
 * Hosts we never preview. Mirrors the server-side block list so the client
 * doesn't even bother calling the Edge Function for obviously-private targets.
 */
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

/** In-memory cache so the same URL is only fetched once per session. */
const previewCache = new Map<string, LinkPreviewData | null>();
const MAX_CACHE = 200;

/** Extract the first URL from a message body, or null. */
export function extractFirstUrl(text: string | undefined | null): string | null {
  if (!text) return null;
  const match = text.match(URL_REGEX);
  if (!match) return null;
  // Trim trailing punctuation that commonly hugs a URL in prose.
  return match[0].replace(/[.,;:!?]+$/, '');
}

/** True when a URL is safe/eligible to preview. */
export function isPreviewableUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname;
  if (!host || !host.includes('.')) return false;
  return !BLOCKED_HOST_PATTERNS.some((re) => re.test(host));
}

/** Bare domain (no `www.`) for display. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

/**
 * A minimal, always-available preview derived purely from the URL itself. Used
 * as an instant placeholder while the rich preview loads, and as the final
 * fallback if the Edge Function is unavailable.
 */
export function fallbackPreview(url: string): LinkPreviewData {
  return { url, domain: domainOf(url) };
}

function remember(url: string, value: LinkPreviewData | null): void {
  if (previewCache.size >= MAX_CACHE) {
    const firstKey = previewCache.keys().next().value;
    if (firstKey !== undefined) previewCache.delete(firstKey);
  }
  previewCache.set(url, value);
}

export interface FetchLinkPreviewOptions {
  /** Abort the request after this many ms (default 8000). */
  timeoutMs?: number;
  /** Skip the cache and force a fresh fetch. */
  force?: boolean;
}

/**
 * Fetch rich metadata for a URL via the `link-preview` Edge Function.
 *
 * Never throws — resolves to `null` when the preview cannot be produced so the
 * caller can simply fall back to the slim domain chip.
 */
export async function fetchLinkPreview(
  url: string,
  opts: FetchLinkPreviewOptions = {},
): Promise<LinkPreviewData | null> {
  if (!isPreviewableUrl(url)) return null;

  if (!opts.force && previewCache.has(url)) {
    return previewCache.get(url) ?? null;
  }

  const supabase = getSupabaseSafe();
  if (!supabase) return null;

  const timeoutMs = opts.timeoutMs ?? 8000;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('link-preview timeout')), timeoutMs);
    });

    const invoke = supabase.functions.invoke('link-preview', {
      body: { url },
    });

    const { data, error } = (await Promise.race([invoke, timeout])) as {
      data: Partial<LinkPreviewData> | null;
      error: unknown;
    };

    if (error || !data) {
      remember(url, null);
      return null;
    }

    const preview: LinkPreviewData = {
      url: typeof data.url === 'string' && data.url ? data.url : url,
      domain: typeof data.domain === 'string' && data.domain ? data.domain : domainOf(url),
      title: typeof data.title === 'string' ? data.title : undefined,
      description: typeof data.description === 'string' ? data.description : undefined,
      image: typeof data.image === 'string' ? data.image : undefined,
      siteName: typeof data.siteName === 'string' ? data.siteName : undefined,
    };

    // A preview with no title/description/image is not worth a card.
    if (!preview.title && !preview.description && !preview.image) {
      remember(url, null);
      return null;
    }

    remember(url, preview);
    return preview;
  } catch {
    remember(url, null);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Clear the in-memory preview cache (used by tests / logout). */
export function clearLinkPreviewCache(): void {
  previewCache.clear();
}
