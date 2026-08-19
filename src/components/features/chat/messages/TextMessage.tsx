import { memo, useMemo } from 'react';
import type { Message } from '@/types';

export interface TextMessageProps {
  msg: Message;
  isMe: boolean;
  isEditing: boolean;
  editInput: string;
  onEditInputChange: (v: string) => void;
  onEditSave: (msgId: string) => void;
  onEditCancel: () => void;
}

// Render text with clickable links, hashtags, and mentions
function renderRichText(content: string, isMe: boolean) {
  const parts: React.ReactNode[] = [];
  const regex = /(https?:\/\/[^\s]+)|(#[\w\u0980-\u09FF]+)|(@[\w\u0980-\u09FF]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{content.slice(lastIndex, match.index)}</span>);
    }
    const token = match[0];
    if (token.startsWith('http')) {
      parts.push(
        <a
          key={key++}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          className={`underline ${isMe ? 'text-white/90 hover:text-white' : 'text-[#00C300] hover:text-[#00A300]'}`}
          onClick={(e) => e.stopPropagation()}
        >
          {token}
        </a>
      );
    } else if (token.startsWith('#')) {
      parts.push(
        <span key={key++} className={`font-medium ${isMe ? 'text-white/90' : 'text-[#00C300]'}`}>
          {token}
        </span>
      );
    } else if (token.startsWith('@')) {
      parts.push(
        <span key={key++} className={`font-medium ${isMe ? 'text-white/90' : 'text-[#2196F3]'}`}>
          {token}
        </span>
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < content.length) {
    parts.push(<span key={key++}>{content.slice(lastIndex)}</span>);
  }
  return parts;
}

export const TextMessage = memo(function TextMessage(props: TextMessageProps) {
  const { msg, isMe, isEditing, editInput, onEditInputChange, onEditSave, onEditCancel } = props;

  const richContent = useMemo(() => renderRichText(msg.content, isMe), [msg.content, isMe]);

  return (
    <>
      {isEditing ? (
        <div className={`inline-block px-3 py-2 rounded-2xl text-[15px] w-full ${isMe ? 'bg-[#00C300] text-white rounded-br-none' : 'bg-white text-[#111111] rounded-bl-none'}`}>
          <input
            value={editInput}
            onChange={(e) => onEditInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onEditSave(msg.id);
              }
              if (e.key === 'Escape') onEditCancel();
            }}
            autoFocus
            aria-label="Edit message content"
            className={`w-full bg-transparent focus:outline-none text-[15px] ${isMe ? 'text-white placeholder:text-white/50' : 'text-[#111111] placeholder:text-[#8D8D8D]'}`}
          />
          <div className="flex items-center gap-2 mt-2">
            <button type="button" onClick={() => onEditSave(msg.id)} aria-label="Save edit" className={`min-w-8 min-h-8 inline-flex items-center justify-center rounded-lg ${isMe ? 'text-white/80 hover:text-white' : 'text-[#00C300] hover:text-[#00A300]'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            </button>
            <button type="button" onClick={onEditCancel} aria-label="Cancel edit" className={`min-w-8 min-h-8 inline-flex items-center justify-center rounded-lg ${isMe ? 'text-white/70 hover:text-white' : 'text-[#8D8D8D] hover:text-[#111111]'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`inline-block px-3 py-2 rounded-2xl text-[15px] cursor-pointer active:scale-[0.98] transition-transform ${isMe ? 'bg-[#00C300] text-white rounded-br-none' : 'bg-white text-[#111111] rounded-bl-none'}`}
        >
          <p className="whitespace-pre-wrap break-words">{richContent}</p>
        </div>
      )}
    </>
  );
});