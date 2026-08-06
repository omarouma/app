import { memo } from 'react';
import { FileText } from 'lucide-react';
import type { Message } from '@/types';

export interface FileMessageProps {
  msg: Message;
  isMe: boolean;
}

export const FileMessage = memo(function FileMessage(props: FileMessageProps) {
  const { msg, isMe } = props;

  return (
    <a
      href={msg.mediaUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 bg-black/10 rounded-xl px-3 py-2 mb-1 max-w-full hover:bg-black/20 transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      <FileText size={18} className={`shrink-0 ${isMe ? 'text-white' : 'text-[#111111]'}`} />
      <span className={`text-sm truncate ${isMe ? 'text-white' : 'text-[#111111]'}`}>
        {msg.content.replace('📁 ', '')}
      </span>
    </a>
  );
});