// Pure time/date utility functions — no external dependencies
import {
  getActiveRegionSettings,
  formatTimeOfDay,
  formatDateBySettings,
  getTimezoneLabel,
} from '@/lib/regionUtils';

export function toDate(date: string | Date | null | undefined): Date | null {
  if (!date) return null;
  return typeof date === 'string' ? new Date(date) : date;
}

interface DbTimestampLike {
  toDate: () => Date;
}

function isDbTimestamp(v: unknown): v is DbTimestampLike {
  return typeof v === 'object' && v !== null && 'toDate' in v &&
    typeof (v as DbTimestampLike).toDate === 'function';
}

export function toDateFromDb(raw: unknown): Date {
  if (isDbTimestamp(raw)) return raw.toDate();
  if (raw instanceof Date) return raw;
  if (typeof raw === 'string' || typeof raw === 'number') {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

/**
 * Format a timestamp for chat lists. Uses the user's language + region for the
 * clock/date conventions instead of the browser default. An explicit `locale`
 * argument still wins when provided (kept for backwards compatibility).
 */
export function formatTime(date: string | Date | null | undefined, locale?: string): string {
  const d = toDate(date);
  if (!d || isNaN(d.getTime())) return '';

  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const oneDay = 24 * 60 * 60 * 1000;

  const settings = getActiveRegionSettings();

  if (diff < oneDay && d.getDate() === now.getDate()) {
    if (locale) {
      return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    }
    return formatTimeOfDay(d, settings);
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()
  ) {
    return 'Yesterday';
  }

  if (d.getFullYear() === now.getFullYear()) {
    return formatDateBySettings(d, settings, { month: 'short', day: 'numeric' });
  }

  return formatDateBySettings(d, settings, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Format a date separator shown between message groups ("Today", "Yesterday",
 * or a localised full date). Previously hard-coded to 'en-US'.
 */
export function formatDateSeparator(date: Date): string {
  const now = new Date();
  const d = new Date(date);
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const settings = getActiveRegionSettings();
  return formatDateBySettings(d, settings, { weekday: 'long', month: 'short', day: 'numeric' });
}

/**
 * Relative "last seen" string. Falls back to a region-aware absolute time for
 * anything older than a week.
 */
export function formatLastSeen(date: string | Date | null | undefined): string {
  const d = toDate(date);
  if (!d) return 'a while ago';

  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return 'just now';
  if (diff < hour) {
    const mins = Math.floor(diff / minute);
    return `${mins} minute${mins > 1 ? 's' : ''} ago`;
  }
  if (diff < day) {
    const hours = Math.floor(diff / hour);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }
  if (diff < 7 * day) {
    const days = Math.floor(diff / day);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
  return formatTime(date);
}

/**
 * Full, region-aware timestamp including the timezone label when the user has
 * enabled it in Language & Region settings.
 */
export function formatFullTimestamp(date: string | Date | null | undefined): string {
  const d = toDate(date);
  if (!d || isNaN(d.getTime())) return '';
  const settings = getActiveRegionSettings();
  const base = `${formatDateBySettings(d, settings, { year: 'numeric', month: 'short', day: 'numeric' })} · ${formatTimeOfDay(d, settings)}`;
  return settings.showTimezone ? `${base} (${getTimezoneLabel(d)})` : base;
}
