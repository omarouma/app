/**
 * Social sharing helpers for GaGa Chat.
 *
 * Provides URL builders for the major share destinations plus a small
 * Web Share API wrapper with a clipboard fallback.
 */

export interface SharePayload {
  title: string;
  text: string;
  url: string;
}

const enc = (value: string) => encodeURIComponent(value);

/** Build a WhatsApp share URL. */
export function whatsappShareUrl({ text, url }: { text: string; url: string }): string {
  return `https://wa.me/?text=${enc(`${text}\n${url}`)}`;
}

/** Build a Facebook share URL. */
export function facebookShareUrl({ url }: { url: string }): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`;
}

/** Build an X (Twitter) share URL. */
export function xShareUrl({ text, url }: { text: string; url: string }): string {
  return `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`;
}

/** Build a Telegram share URL. */
export function telegramShareUrl({ text, url }: { text: string; url: string }): string {
  return `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`;
}

/** Build a LinkedIn share URL. */
export function linkedinShareUrl({ url }: { url: string }): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`;
}

/** Build an email share URL. */
export function emailShareUrl({ title, text, url }: SharePayload): string {
  return `mailto:?subject=${enc(title)}&body=${enc(`${text}\n${url}`)}`;
}

/**
 * Opens the native share sheet when available, otherwise copies to clipboard.
 * Returns `true` if the native sheet was used.
 */
export async function nativeShare(payload: SharePayload): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share(payload);
      return true;
    } catch {
      // User cancelled or share failed — fall through to clipboard
    }
  }
  await navigator.clipboard.writeText(payload.url);
  return false;
}

/** Simple clipboard copy. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
