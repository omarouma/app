import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { toDate, formatTime, formatLastSeen } from './timeUtils';

export * from './timeUtils';
export { toDate, formatTime, formatLastSeen };

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Deterministic, self-contained default avatar.
 *
 * Generates an inline SVG data-URI (colored circle + initial) from the seed so
 * the app never depends on an external avatar service. This keeps avatars
 * working offline, avoids leaking user identifiers to third parties, and
 * removes a runtime network dependency (PDF §17 build & dependency hygiene).
 */
export function getDefaultAvatar(seed: string): string {
  const s = (seed || 'U').trim() || 'U';
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  const rawInitial = s.charAt(0).toUpperCase();
  const initial = /[A-Za-z0-9]/.test(rawInitial) ? rawInitial : 'U';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">` +
    `<rect width="128" height="128" rx="64" fill="hsl(${hue},65%,45%)"/>` +
    `<text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="Inter,Arial,sans-serif" ` +
    `font-size="56" font-weight="700" fill="#ffffff">${initial}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function sanitizeMediaUrl(url: string | undefined | null): string {
  if (!url) return '';
  const trimmed = url.trim();
  // Block dangerous URI schemes. Keep app-owned browser/browser-storage URLs
  // working so media that falls back through IndexedDB or blob URLs still loads.
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('data:text') || lower.startsWith('data:application')) return '';
  if (trimmed.startsWith('blob:') || trimmed.startsWith('idb://')) return trimmed;
  if (trimmed.startsWith('data:image/')) return trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return '';
}

export function getChatName(chat: { type: string; participants: string[]; name?: string }, usersMap: Record<string, { name: string }>, currentUserId: string): string {
  if (chat.name) return chat.name;
  if (chat.type === 'group') return 'Group Chat';
  const otherId = chat.participants.find(p => p !== currentUserId);
  return otherId ? (usersMap[otherId]?.name || 'Unknown') : 'Chat';
}

export function getChatAvatar(chat: { type: string; participants: string[]; avatar?: string }, usersMap: Record<string, { avatar?: string }>, currentUserId: string): string {
  if (chat.avatar) return chat.avatar;
  const otherId = chat.participants.find(p => p !== currentUserId);
  return otherId ? (usersMap[otherId]?.avatar || getDefaultAvatar(otherId)) : getDefaultAvatar('default');
}

export function buildGagaChatUri(userId: string): string {
  return `gagachat://user/${userId}`;
}

export function buildGagaChatWebUrl(userId: string): string {
  return `https://gagachat.app/profile/${userId}`;
}

export function parseGagaChatUri(uri: string | null): string | null {
  if (!uri) return null;
  if (uri.startsWith('gagachat://user/')) return uri.replace('gagachat://user/', '');
  if (uri.startsWith('user_')) return uri;
  return null;
}

export function stopStreamTracks(stream: MediaStream | null) {
  if (!stream) return;
  stream.getTracks().forEach(track => track.stop());
}

/**
 * Resolve the real duration (in whole seconds) of a local media File.
 * Returns `undefined` when the duration cannot be determined or is not finite
 * (streaming containers can report Infinity/NaN). Never throws.
 */
export function getMediaDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: number | undefined) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      const url = URL.createObjectURL(file);
      const el = document.createElement('video');
      el.preload = 'metadata';
      const cleanup = () => {
        el.removeEventListener('loadedmetadata', onLoaded);
        el.removeEventListener('error', onError);
        el.src = '';
        URL.revokeObjectURL(url);
      };
      const onLoaded = () => {
        const d = el.duration;
        cleanup();
        done(Number.isFinite(d) && d > 0 ? Math.round(d) : undefined);
      };
      const onError = () => {
        cleanup();
        done(undefined);
      };
      el.addEventListener('loadedmetadata', onLoaded);
      el.addEventListener('error', onError);
      el.src = url;
      // Safety timeout so a stuck probe never blocks the send pipeline.
      setTimeout(() => {
        cleanup();
        done(undefined);
      }, 8000);
    } catch {
      done(undefined);
    }
  });
}

export function sanitizeForLog(input: string): string {
  return input.replace(/[\r\n]/g, ' ').slice(0, 500);
}

export function sanitizeText(input: string | undefined | null): string {
  if (!input) return '';
  return input.replace(/[<>"'&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '&': '&amp;' }[c] ?? c)).slice(0, 2000);
}

export const BD_TK_RATE = 0.85;

/**
 * Human-readable preview text for a message, used in the chat list.
 * Media messages store empty content, so we substitute a type label.
 */
export function getMessagePreview(
  type: string | undefined,
  content: string | undefined | null,
): string {
  const text = (content ?? '').trim();
  if (text) return text;
  switch (type) {
    case 'image': return '📷 Photo';
    case 'video': return '🎥 Video';
    case 'voice': return '🎤 Voice message';
    case 'file': return '📎 File';
    case 'sticker': return '🩵 Sticker';
    case 'location': return '📍 Location';
    case 'contact_card': return '👤 Contact';
    case 'money_transfer': return '💸 Money transfer';
    case 'poll': return '📊 Poll';
    case 'call': return '📞 Call';
    case 'system': return text || 'System message';
    case 'deleted': return 'This message was deleted';
    default: return '';
  }
}
