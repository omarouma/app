import { memo } from 'react';
import { getDefaultAvatar } from '@/lib/utils';
import { ReadReceipt } from '../ReadReceipt';
import type { Message } from '@/types';

export interface ContactCardMessageProps {
  msg: Message;
  isMe: boolean;
  onNavigate: (path: string) => void;
}

export const ContactCardMessage = memo(function ContactCardMessage(props: ContactCardMessageProps) {
  const { msg, isMe, onNavigate } = props;

  return (
    <div className={`max-w-[70%]`}>
      <div className={`inline-block px-4 py-3 rounded-2xl ${isMe ? 'bg-[#00C300] text-white rounded-br-none' : 'bg-white text-[#111111] rounded-bl-none'} shadow-sm`}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center shrink-0 overflow-hidden">
            {msg.contactCard!.avatar ? (
              <img src={msg.contactCard!.avatar} className="w-full h-full object-cover" alt="" />
            ) : (
              <img src={getDefaultAvatar(msg.contactCard!.userId || msg.contactCard!.name || 'U')} className="w-full h-full object-cover" alt="" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold">{msg.contactCard!.name}</p>
            {msg.contactCard!.username && <p className="text-xs opacity-70">@{msg.contactCard!.username}</p>}
          </div>
        </div>
        {msg.contactCard!.phone && <p className="text-xs opacity-80 mb-1">📞 {msg.contactCard!.phone}</p>}
        {msg.contactCard!.email && <p className="text-xs opacity-80 mb-1">✉️ {msg.contactCard!.email}</p>}
        {msg.contactCard!.bio && <p className="text-xs opacity-70 line-clamp-2">{msg.contactCard!.bio}</p>}
        <button
          type="button"
          onClick={() => onNavigate(`/profile/${msg.contactCard!.userId}`)}
          className={`mt-2 w-full py-1.5 rounded-lg text-xs font-medium transition-colors ${isMe ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-[#F5F5F5] text-[#111111] hover:bg-[#EBEBEB]'}`}
        >
          View Profile
        </button>
      </div>
      <ReadReceipt isMe={isMe} timestamp={msg.timestamp} read={msg.read} />
    </div>
  );
});