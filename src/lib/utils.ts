import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { toDate, formatTime, formatLastSeen } from './timeUtils';

export * from './timeUtils';
export { toDate, formatTime, formatLastSeen };

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getDefaultAvatar(seed: string): string {
  return `https://api.dicebear.com/8.x/thumbs/svg?seed=${encodeURIComponent(seed)}`;
}

export function sanitizeMediaUrl(url: string | undefined | null): string {
  if (!url) return '';
  if (url.startsWith('blob:')) return url;
  if (url.startsWith('data:')) return url;
  if (url.startsWith('http')) return url;
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
  return `https://oumagachat.web.app/profile/${userId}`;
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

export function sanitizeForLog(input: string): string {
  return input.replace(/[\r\n]/g, ' ').slice(0, 500);
}

export const BD_TK_RATE = 0.85;
