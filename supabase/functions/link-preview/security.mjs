/**
 * Explicit egress policy for GaGa link previews.
 * This is intentionally allow-list based. Hostname-only "private IP" filtering
 * would still be vulnerable to DNS rebinding and redirect-to-internal tricks.
 * Unapproved links remain clickable and receive a text-only hostname preview;
 * no server-side request is made to them.
 */
export const APPROVED_LINK_PREVIEW_HOSTS = new Set([
  "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be",
  "github.com", "www.github.com",
  "reddit.com", "www.reddit.com", "old.reddit.com",
  "wikipedia.org", "www.wikipedia.org", "en.wikipedia.org",
  "medium.com", "www.medium.com",
  "linkedin.com", "www.linkedin.com",
  "instagram.com", "www.instagram.com",
  "facebook.com", "www.facebook.com", "m.facebook.com",
  "tiktok.com", "www.tiktok.com",
  "x.com", "www.x.com", "twitter.com", "www.twitter.com",
  "bbc.com", "www.bbc.com", "bbc.co.uk", "www.bbc.co.uk",
]);

export function mayFetchRemotePreview(raw) {
  if (typeof raw !== "string" || raw.length > 2048) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    if (url.username || url.password || url.port) return false;
    if (url.hostname.endsWith(".")) return false;
    if (!APPROVED_LINK_PREVIEW_HOSTS.has(url.hostname.toLowerCase())) return false;
    return true;
  } catch {
    return false;
  }
}

export function plainLinkPreview(raw) {
  try {
    const parsed = new URL(raw);
    const hostname = parsed.hostname || "Link";
    return {
      url: raw,
      title: hostname,
      description: null,
      image_url: null,
      site_name: hostname.replace(/^www\./, ""),
      cached: false,
    };
  } catch {
    return {
      url: "",
      title: "Link",
      description: null,
      image_url: null,
      site_name: "Link",
      cached: false,
    };
  }
}
