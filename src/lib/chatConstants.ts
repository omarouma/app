/**
 * Shared chat-related constants, types, and utilities used across chat components.
 */

export const SWIPE_THRESHOLD = 80;

export const REPORT_OPTIONS = [
  'Spam',
  'Harassment',
  'Inappropriate content',
  'Fake account',
  'Other',
] as const;

export const reactionEmojis = [
  { emoji: '👍', label: 'like', color: 'text-[#2196F3]' },
  { emoji: '❤️', label: 'love', color: 'text-[#FF3B30]' },
  { emoji: '😂', label: 'laugh', color: 'text-[#FF9800]' },
  { emoji: '😮', label: 'wow', color: 'text-[#8B5CF6]' },
  { emoji: '😢', label: 'sad', color: 'text-[#2196F3]' },
  { emoji: '😡', label: 'angry', color: 'text-[#FF3B30]' },
  { emoji: '🎉', label: 'celebrate', color: 'text-[#FF9800]' },
  { emoji: '🔥', label: 'fire', color: 'text-[#FF5722]' },
] as const;

export type ReactionEmoji = (typeof reactionEmojis)[number];

export interface AttachmentOption {
  iconKey: string;
  label: string;
  color: string;
}

export const attachmentOptions: AttachmentOption[] = [
  { iconKey: 'image', label: 'Photos', color: 'bg-[#4CAF50]' },
  { iconKey: 'camera', label: 'Camera', color: 'bg-[#2196F3]' },
  { iconKey: 'video', label: 'Video', color: 'bg-[#9C27B0]' },
  { iconKey: 'phone', label: 'Audio', color: 'bg-[#00C300]' },
  { iconKey: 'user', label: 'Contact', color: 'bg-[#FF9800]' },
  { iconKey: 'map', label: 'Location', color: 'bg-[#E91E63]' },
  { iconKey: 'file', label: 'File', color: 'bg-[#673AB7]' },
  { iconKey: 'poll', label: 'Poll', color: 'bg-[#8B5CF6]' },
] as const;

/** Currency symbol / suffix map for money-transfer rendering. */
export const CURRENCY_FORMAT: Record<string, { prefix?: string; suffix?: string }> = {
  BDT: { prefix: '\u09F3' },
  USD: { prefix: '$' },
  EUR: { prefix: '\u20AC' },
  GBP: { prefix: '\u00A3' },
  INR: { prefix: '\u20B9' },
  PKR: { prefix: '\u20A8' },
  JPY: { prefix: '\u00A5' },
  CNY: { prefix: '\u00A5' },
  CAD: { prefix: 'C$' },
  AUD: { prefix: 'A$' },
  SGD: { prefix: 'S$' },
  MYR: { prefix: 'RM' },
  THB: { prefix: '\u0E3F' },
  IDR: { prefix: 'Rp' },
  PHP: { prefix: '\u20B1' },
  VND: { prefix: '\u20AB' },
  KRW: { prefix: '\u20A9' },
  UAH: { prefix: '\u20B4' },
  TRY: { prefix: '\u20BA' },
  BRL: { prefix: 'R$' },
  MXN: { prefix: 'Mex$' },
  ARS: { prefix: 'AR$' },
  CLP: { prefix: 'CLP$' },
  COP: { prefix: 'COL$' },
  PEN: { prefix: 'S/' },
  ZAR: { prefix: 'R' },
  NGN: { prefix: '\u20A6' },
  EGP: { prefix: 'E\u00A3' },
  SAR: { prefix: 'SR' },
  AED: { prefix: 'AED ' },
  QAR: { prefix: 'QR' },
  KWD: { prefix: 'KD' },
  coins: { suffix: ' coins' },
};

export function formatCurrencyAmount(amount: number, currency = 'coins'): string {
  const fmt = CURRENCY_FORMAT[currency?.toUpperCase?.()] ?? CURRENCY_FORMAT[currency];
  if (fmt) {
    const num = Number.isFinite(amount) ? amount : 0;
    const pretty = Number.isInteger(num) ? String(num) : num.toFixed(2);
    return `${fmt.prefix ?? ''}${pretty}${fmt.suffix ?? ''}`;
  }
  const num = Number.isFinite(amount) ? amount : 0;
  return `${num} ${currency}`;
}

/** Voice message playback speeds (ascending — 1x last is most common end-point). */
export const VOICE_PLAYBACK_RATES: number[] = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** Format a Date into a human-readable date separator string. */
export function formatDateSeparator(date: Date): string {
  const now = new Date();
  const d = new Date(date);
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

/**
 * Suggest a sensible file extension given a MIME type / blob type or URL.
 * Falls back to an empty string when unknown.
 */
export function suggestFileExtension(input: { type?: string; url?: string }): string {
  if (input.type) {
    const t = input.type.toLowerCase();
    if (t.startsWith('image/')) {
      if (t.includes('jpeg') || t.includes('jpg')) return '.jpg';
      if (t.includes('png')) return '.png';
      if (t.includes('webp')) return '.webp';
      if (t.includes('gif')) return '.gif';
      if (t.includes('svg')) return '.svg';
      if (t.includes('bmp')) return '.bmp';
      return '.img';
    }
    if (t.startsWith('video/')) {
      if (t.includes('mp4')) return '.mp4';
      if (t.includes('webm')) return '.webm';
      if (t.includes('quicktime')) return '.mov';
      if (t.includes('mpeg')) return '.mpg';
      if (t.includes('ogg')) return '.ogv';
      return '.vid';
    }
    if (t.startsWith('audio/')) {
      if (t.includes('mpeg')) return '.mp3';
      if (t.includes('wav')) return '.wav';
      if (t.includes('ogg')) return '.ogg';
      if (t.includes('webm')) return '.webm';
      if (t.includes('aac')) return '.aac';
      if (t.includes('flac')) return '.flac';
      if (t.includes('m4a')) return '.m4a';
      return '.audio';
    }
  }
  if (input.url) {
    const u = input.url.split('?')[0].split('#')[0];
    const last = u.split('/').pop() || '';
    const dot = last.lastIndexOf('.');
    if (dot >= 0 && last.length - dot <= 6) return last.slice(dot);
  }
  return '';
}
