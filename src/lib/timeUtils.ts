// Pure time/date utility functions — no external dependencies
export function toDate(date: string | Date | null | undefined): Date | null {
  if (!date) return null;
  return typeof date === 'string' ? new Date(date) : date;
}

export function formatTime(date: string | Date | null | undefined): string {
  const d = toDate(date);
  if (!d) return '';

  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const oneDay = 24 * 60 * 60 * 1000;

  if (diff < oneDay && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth() && d.getFullYear() === yesterday.getFullYear()) {
    return 'Yesterday';
  }

  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

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
