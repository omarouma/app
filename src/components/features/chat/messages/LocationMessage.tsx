import { memo } from 'react';
import { MapPin } from 'lucide-react';
import type { Message } from '@/types';

export interface LocationMessageProps {
  msg: Message;
  isMe: boolean;
}

export const LocationMessage = memo(function LocationMessage(props: LocationMessageProps) {
  const { msg, isMe } = props;

  return (
    <a
      href={msg.mediaUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 bg-black/10 rounded-xl px-3 py-2 mb-1 max-w-full hover:bg-black/20 transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      <MapPin size={18} className="text-[#FF3B30] shrink-0" />
      <span className={`text-sm ${isMe ? 'text-white' : 'text-[#111111]'}`}>Open in Maps</span>
    </a>
  );
});