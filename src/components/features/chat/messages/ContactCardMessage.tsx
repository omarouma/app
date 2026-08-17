import { memo } from 'react';
import { getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
import { ReadReceipt } from '../ReadReceipt';
import { MessageCircle, Phone, UserRound } from 'lucide-react';
import type { Message } from '@/types';

export interface ContactCardMessageProps {
  msg: Message;
  isMe: boolean;
  onNavigate: (path: string) => void;
}

export const ContactCardMessage = memo(function ContactCardMessage(props: ContactCardMessageProps) {
  const { msg, isMe, onNavigate } = props;

  const card = msg.contactCard;
  if (!card) {
    return (
      <div className={`max-w-[70%]`}>
        <div className={`inline-block px-4 py-3 rounded-2xl ${isMe ? 'bg-[#00C300] text-white rounded-br-none' : 'bg-white text-[#111111] rounded-bl-none'} shadow-sm`}>
          <p className="text-sm opacity-70">Contact unavailable</p>
        </div>
        <ReadReceipt isMe={isMe} timestamp={msg.timestamp} deliveryStatus={msg.deliveryStatus ?? (msg.read ? 'read' : 'sent')} edited={msg.edited} />
      </div>
    );
  }

  const safeAvatar = sanitizeMediaUrl(card.avatar);
  const defaultAvatar = getDefaultAvatar(card.userId || card.name || 'U');

  return (
    <div className={`max-w-[70%]`}>
      <div className={`inline-block px-4 py-3 rounded-2xl ${isMe ? 'bg-[#00C300] text-white rounded-br-none' : 'bg-white text-[#111111] rounded-bl-none'} shadow-sm`}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center shrink-0 overflow-hidden">
            {safeAvatar ? (
              <img src={safeAvatar} className="w-full h-full object-cover" alt="" />
            ) : (
              <img src={defaultAvatar} className="w-full h-full object-cover" alt="" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold">{card.name}</p>
            {card.username && <p className="text-xs opacity-70">@{card.username}</p>}
          </div>
        </div>
        {card.phone && <p className="text-xs opacity-80 mb-1">📞 {card.phone}</p>}
        {card.email && <p className="text-xs opacity-80 mb-1">✉️ {card.email}</p>}
        {card.bio && <p className="text-xs opacity-70 line-clamp-2">{card.bio}</p>}
        {card.userId && (
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => onNavigate(`/profile/${card.userId}`)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1 ${isMe ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-[#F5F5F5] text-[#111111] hover:bg-[#EBEBEB]'}`}
            >
              <UserRound size={12} /> Profile
            </button>
            <button
              type="button"
              onClick={() => onNavigate(`/chat/${card.userId}`)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1 ${isMe ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-[#F5F5F5] text-[#111111] hover:bg-[#EBEBEB]'}`}
            >
              <MessageCircle size={12} /> Chat
            </button>
            {card.phone && (
              <a
                href={`tel:${card.phone}`}
                onClick={(e) => e.stopPropagation()}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1 ${isMe ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-[#F5F5F5] text-[#111111] hover:bg-[#EBEBEB]'}`}
              >
                <Phone size={12} /> Call
              </a>
            )}
          </div>
        )}
      </div>
      <ReadReceipt isMe={isMe} timestamp={msg.timestamp} deliveryStatus={msg.deliveryStatus ?? (msg.read ? 'read' : 'sent')} edited={msg.edited} />
    </div>
  );
});