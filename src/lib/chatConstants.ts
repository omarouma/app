/**
 * Shared chat-related constants used across chat components.
 */

export const SWIPE_THRESHOLD = 80;

export const REPORT_OPTIONS = ['Spam', 'Harassment', 'Inappropriate content', 'Fake account', 'Other'];

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

export type ReactionEmoji = typeof reactionEmojis[number];

/**
 * Icons are rendered as JSX with lucide-react in the attachment panel.
 * This type stores a key used to map to the correct icon component at render time.
 */
export interface AttachmentOption {
  iconKey: string;
  label: string;
  color: string;
}

export const attachmentOptions: AttachmentOption[] = [
  { iconKey: 'image', label: 'Photos', color: 'bg-[#4CAF50]' },
  { iconKey: 'camera', label: 'Camera', color: 'bg-[#2196F3]' },
  { iconKey: 'phone', label: 'Audio', color: 'bg-[#00C300]' },
  { iconKey: 'user', label: 'Contact', color: 'bg-[#FF9800]' },
  { iconKey: 'map', label: 'Location', color: 'bg-[#E91E63]' },
  { iconKey: 'file', label: 'File', color: 'bg-[#673AB7]' },
  { iconKey: 'poll', label: 'Poll', color: 'bg-[#8B5CF6]' },
] as const;

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
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}
