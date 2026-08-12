import { memo } from 'react';
import type { Message } from '@/types';

export interface DeletedMessageProps {
  msg: Message;
  isMe: boolean;
}

export const DeletedMessage = memo(function DeletedMessage(props: DeletedMessageProps) {
  const { msg, isMe } = props;
  const text = msg.content?.trim() || (isMe ? 'You deleted this message' : 'This message was deleted');

  return (
    <div className={`inline-block px-3 py-2 rounded-2xl text-[13px] italic ${isMe ? 'bg-[#00C300]/60 text-white/80 rounded-br-none' : 'bg-white/60 text-[#8D8D8D] rounded-bl-none'}`} aria-live="polite">
      <p className="whitespace-pre-wrap break-words">{text}</p>
    </div>
  );
});