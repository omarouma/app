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

async function copyTextWithFallback(text: string): Promise<boolean> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (nav?.clipboard && typeof nav.clipboard.writeText === 'function') {
    try {
      await nav.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to DOM fallback below.
    }
  }

  if (typeof document === 'undefined') return false;

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    const successful = document.execCommand?.('copy') ?? false;
    return successful;
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

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
  if (typeof navigator !== 'undefined' && 'share' in navigator && typeof navigator.share === 'function') {
    try {
      await navigator.share(payload);
      return true;
    } catch {
      // User cancelled or share failed — fall through to clipboard
    }
  }

  await copyTextWithFallback(payload.url);
  return false;
}

/** Simple clipboard copy. */
export async function copyToClipboard(text: string): Promise<boolean> {
  return copyTextWithFallback(text);
}

/**
 * Safer confirmation dialog that degrades gracefully when the browser blocks
 * modal prompts or when running in restricted WebView contexts.
 */
export function safeConfirm(message: string): boolean {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
    return true;
  }

  try {
    return window.confirm(message);
  } catch {
    return true;
  }
}
