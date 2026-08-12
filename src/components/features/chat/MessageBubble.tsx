import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, MapPin, Check, CheckCheck, MessageCircle, RotateCcw, Languages
} from 'lucide-react';
import { VoiceWaveform } from './VoiceWaveform';
import { formatTime, sanitizeMediaUrl, getDefaultAvatar } from '@/lib/utils';
import type { Message } from '@/types';

interface MessageBubbleProps {
  msg: Message;
  isMe: boolean;
  showAvatar: boolean;
  displayUser: { name: string; avatar: string; id: string };
  currentUserId: string;
  msgs: Message[];
  isSelected: boolean;
  isSearchMatch: boolean;
  isEditing: boolean;
  editInput: string;
  showReactions: boolean;
  translatedText?: string;
  isTranslating?: boolean;
  onReplyClick?: (msgId: string) => void;
  onSetLightbox: (url: string) => void;
  onDoubleClick: (msg: Message) => void;
  onReact: (msgId: string, reaction: string) => void;
  onVotePoll?: (chatId: string, msgId: string, optionIndex: number, userId: string) => void;
  chatId?: string;
  onEditSave: (msgId: string) => void;
  onEditCancel: () => void;
  onEditInputChange: (v: string) => void;
  onContextMenu: (e: React.MouseEvent, msg: Message) => void;
  onReactionToggle: (msgId: string | null) => void;
  onRetry?: (msg: Message) => void;
}

const reactionEmojis = [
  { emoji: '👍', label: 'like', color: 'text-[#2196F3]' },
  { emoji: '❤️', label: 'love', color: 'text-[#FF3B30]' },
  { emoji: '😂', label: 'laugh', color: 'text-[#FF9800]' },
  { emoji: '😮', label: 'wow', color: 'text-[#8B5CF6]' },
  { emoji: '😢', label: 'sad', color: 'text-[#2196F3]' },
  { emoji: '😡', label: 'angry', color: 'text-[#FF3B30]' },
  { emoji: '🎉', label: 'celebrate', color: 'text-[#FF9800]' },
  { emoji: '🔥', label: 'fire', color: 'text-[#FF5722]' },
];

type ReactionEmoji = typeof reactionEmojis[number];

const DeliveryStatusIcon = memo(function DeliveryStatusIcon({
  status,
  isMe,
  timestamp,
}: {
  status?: 'pending' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  isMe: boolean;
  timestamp: Date;
}) {
  if (!isMe) return null;

  switch (status) {
    case 'pending':
    case 'sending':
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-[#8D8D8D]">
          <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="inline-block animate-pulse">
            <path d="M1 5L5 9L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.5} />
          </svg>
          {formatTime(timestamp)}
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-[#FF3B30]">
          <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="inline-block">
            <circle cx="7" cy="5" r="4" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5 5H9" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          Failed · Tap to retry
        </span>
      );
    case 'read':
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-[#2196F3]">
          <CheckCheck size={14} className="text-[#2196F3]" />
          {formatTime(timestamp)}
        </span>
      );
    case 'delivered':
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-white/70">
          <CheckCheck size={14} />
          {formatTime(timestamp)}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-white/70">
          <Check size={14} />
          {formatTime(timestamp)}
        </span>
      );
  }
});

function getRepliedMessageContent(msgs: Message[], replyToId: string, currentUserId: string, displayUserName: string): { content: string; senderName: string } | null {
  const replied = msgs.find(m => m.id === replyToId);
  if (!replied) return null;
  const truncated = replied.content.length > 60 ? replied.content.substring(0, 60) + '...' : replied.content;
  const senderName = replied.senderId === currentUserId ? 'You' : replied.senderId === 'system' ? 'System' : displayUserName;
  return { content: truncated, senderName };
}

export const MessageBubble = memo(function MessageBubble(props: MessageBubbleProps) {
  const {
    msg, isMe, showAvatar, displayUser, currentUserId, msgs,
    isSelected, isSearchMatch, isEditing, editInput, showReactions,
    translatedText, isTranslating,
    onReplyClick, onSetLightbox, onDoubleClick, onReact,
    onEditSave, onEditCancel, onEditInputChange, onContextMenu, onReactionToggle,
    onRetry, onVotePoll, chatId,
  } = props;

  const reactions = msg.reactions || {};
  const hasReactions = Object.values(reactions).some((u) => (u as string[]).length > 0);

  // Find replied message
  const repliedInfo = msg.replyTo ? getRepliedMessageContent(msgs, msg.replyTo, currentUserId, displayUser.name) : null;

  const avatarEl = showAvatar ? (
    <div className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center mr-2 self-end shrink-0 overflow-hidden">
      {sanitizeMediaUrl(displayUser?.avatar) ? (
        <img src={sanitizeMediaUrl(displayUser?.avatar)} className="w-full h-full object-cover" alt="User avatar" />
      ) : (
        <img src={getDefaultAvatar(displayUser?.id || displayUser?.name || 'U')} className="w-full h-full object-cover" alt="User avatar" />
      )}
    </div>
  ) : null;

  // ── Money Transfer ──
  if (msg.type === 'money_transfer' && msg.transferData) {
    const isIncoming = msg.transferData.toUserId === currentUserId;
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex justify-center my-3">
        <div className={`rounded-2xl px-5 py-3 max-w-[80%] text-center border border-[#EBEBEB] ${isIncoming ? 'bg-[#00C300]/10' : 'bg-white'}`}>
          <p className="text-[#00C300] text-xs font-medium mb-1">{isIncoming ? '\u{1F4B0} You received' : '\u{1F4B8} You sent'}</p>
          <p className="text-[#111111] text-xl font-bold">
            {msg.transferData.currency === 'BDT' ? `\u09F3${msg.transferData.amount}` : `${msg.transferData.amount} coins`}
          </p>
          {msg.transferData.note && <p className="text-[#8D8D8D] text-xs mt-1">{msg.transferData.note}</p>}
          <p className="text-[#8D8D8D] text-[10px] mt-1">{formatTime(msg.timestamp)}</p>
        </div>
      </motion.div>
    );
  }

  // ── Poll ──
  if (msg.type === 'poll' && msg.pollData) {
    const poll = msg.pollData;
    const hasVoted = Object.values(poll.votes || {}).flat().includes(currentUserId);
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${isSelected ? 'opacity-70' : ''}`}
      >
        {!isMe && avatarEl}
        <div className={`max-w-[70%] ${!isMe && !showAvatar ? 'ml-10' : ''}`}>
          <div className={`inline-block px-4 py-3 rounded-2xl ${isMe ? 'bg-[#8B5CF6] text-white rounded-br-none' : 'bg-white text-[#111111] rounded-bl-none'}`}>
            <div className="flex items-center gap-1.5 mb-2">
              <MessageCircle size={14} /><span className="text-xs font-medium">Poll</span>
            </div>
            <p className="text-sm font-medium mb-2">{poll.question}</p>
            <div className="space-y-1.5">
              {(poll.options || []).map((opt, i: number) => {
                const votes = (poll.votes?.[String(i)] || opt.votes || []) as string[];
                const total = poll.totalVotes || 0;
                const percent = total > 0 ? Math.round((votes.length / total) * 100) : 0;
                const isVoted = votes.includes(currentUserId);
                const optText = typeof opt === 'string' ? opt : opt.text;
                return (
                  <button type="button" key={i} onClick={() => onVotePoll?.(chatId ?? '', msg.id, i, currentUserId)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all relative overflow-hidden ${isVoted ? (isMe ? 'bg-white/30 text-white' : 'bg-[#8B5CF6]/10 text-[#8B5CF6]') : (isMe ? 'bg-white/10 text-white/90 hover:bg-white/20' : 'bg-[#F5F5F5] text-[#111111] hover:bg-[#EBEBEB]')}`}
                  >
                    {hasVoted && <div aria-hidden="true" className={`absolute left-0 top-0 h-full rounded-xl overflow-hidden ${isMe ? 'bg-white/20' : 'bg-[#8B5CF6]/10'}`} style={{ width: `${percent}%` }} />}
                    <span className="relative z-10 flex items-center justify-between">
                      <span>{optText}</span>
                      {hasVoted && <span className="text-xs opacity-70">{votes.length} ({percent}%)</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            {hasVoted && <p className={`text-xs mt-2 ${isMe ? 'text-white/60' : 'text-[#8D8D8D]'}`}>{poll.totalVotes || 0} vote{(poll.totalVotes || 0) !== 1 ? 's' : ''}</p>}
          </div>
        </div>
      </motion.div>
    );
  }

  // ── Contact Card ──
  if (msg.type === 'contact_card' && msg.contactCard) {
    const card = msg.contactCard as unknown as Record<string, string>;
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${isSelected ? 'opacity-70' : ''}`}
      >
        {!isMe && avatarEl}
        <div className={`max-w-[70%] ${!isMe && !showAvatar ? 'ml-10' : ''}`}>
          <div className={`inline-block px-4 py-3 rounded-2xl ${isMe ? 'bg-[#00C300] text-white rounded-br-none' : 'bg-white text-[#111111] rounded-bl-none'} shadow-sm`}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center shrink-0 overflow-hidden">
                {card.avatar ? <img src={card.avatar} className="w-full h-full object-cover" alt="User avatar" /> : <img src={getDefaultAvatar(card.userId || card.name || 'U')} className="w-full h-full object-cover" alt="User avatar" />}
              </div>
              <div>
                <p className="text-sm font-semibold">{card.name}</p>
                {card.username && <p className="text-xs opacity-70">@{card.username}</p>}
              </div>
            </div>
            {card.phone && <p className="text-xs opacity-80 mb-1">📞 {card.phone}</p>}
            {card.email && <p className="text-xs opacity-80 mb-1">✉️ {card.email}</p>}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${isSelected ? 'opacity-70' : ''}`}>
      {!isMe && avatarEl}
      <div className={`max-w-[70%] relative ${!isMe && !showAvatar ? 'ml-10' : ''}`}>
        {/* Reply Preview */}
        {repliedInfo && (
          <div
            className={`${isMe ? 'bg-[#00C300]/20 mr-0' : 'bg-black/5 ml-0'} rounded-t-xl px-3 py-1.5 mb-0.5 cursor-pointer hover:opacity-80 transition-opacity`}
            onClick={() => onReplyClick?.(msg.replyTo!)}
          >
            <p className={`text-[10px] font-medium ${isMe ? 'text-white/70' : 'text-[#00C300]'}`}>
              Replying to {repliedInfo.senderName}
            </p>
            <p className={`text-[11px] truncate ${isMe ? 'text-white/60' : 'text-[#8D8D8D]'}`}>
              {repliedInfo.content}
            </p>
          </div>
        )}

        {/* Image */}
        {msg.type === 'image' && msg.mediaUrl && (
          <img
            src={msg.mediaUrl}
            onClick={() => onSetLightbox(msg.mediaUrl!)}
            className="rounded-2xl mb-1 max-w-full cursor-pointer hover:opacity-95 transition-opacity"
            alt="Shared image"
            loading="lazy"
          />
        )}

        {/* Video */}
        {msg.type === 'video' && msg.mediaUrl && (
          <video src={msg.mediaUrl} className="rounded-2xl mb-1 max-w-full" controls preload="metadata" />
        )}

        {/* Voice Message with Waveform */}
        {msg.type === 'voice' && msg.mediaUrl && (
          <div className={`rounded-2xl mb-1 px-3 py-2 ${isMe ? 'bg-[#00C300]' : 'bg-white'}`}>
            <VoiceWaveform audioUrl={msg.mediaUrl} isOwnMessage={isMe} />
          </div>
        )}

        {/* File */}
        {msg.type === 'file' && msg.mediaUrl && (
          <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 bg-black/10 rounded-xl px-3 py-2 mb-1 max-w-full hover:bg-black/20 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <FileText size={18} className={`shrink-0 ${isMe ? 'text-white' : 'text-[#111111]'}`} />
            <span className={`text-sm truncate ${isMe ? 'text-white' : 'text-[#111111]'}`}>{msg.content.replace('📁 ', '')}</span>
          </a>
        )}

        {/* Location */}
        {msg.type === 'location' && msg.mediaUrl && (
          <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 bg-black/10 rounded-xl px-3 py-2 mb-1 max-w-full hover:bg-black/20 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <MapPin size={18} className="text-[#FF3B30] shrink-0" />
            <span className={`text-sm ${isMe ? 'text-white' : 'text-[#111111]'}`}>Open in Maps</span>
          </a>
        )}

        {/* Deleted Message */}
        {msg.type === 'deleted' && (
          <div className={`inline-block px-3 py-2 rounded-2xl text-[13px] italic ${isMe ? 'bg-[#00C300]/60 text-white/80 rounded-br-none' : 'bg-white/60 text-[#8D8D8D] rounded-bl-none'}`}>
            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
          </div>
        )}

        {/* Text / Editing */}
        {msg.type !== 'deleted' && (() => {
          if (isEditing) {
            return (
              <div className={`inline-block px-3 py-2 rounded-2xl text-[15px] w-full ${isMe ? 'bg-[#00C300] text-white rounded-br-sm' : 'bg-white text-[#111111] rounded-bl-sm shadow-sm'}`}>
                <input
                  value={editInput}
                  onChange={(e) => onEditInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); onEditSave(msg.id); }
                    if (e.key === 'Escape') onEditCancel();
                  }}
                  autoFocus
                  aria-label="Edit message content"
                  className={`w-full bg-transparent focus:outline-none text-[15px] ${isMe ? 'text-white placeholder:text-white/50' : 'text-[#111111] placeholder:text-[#8D8D8D]'}`}
                />
              </div>
            );
          }

          if (msg.type === 'text' || (!msg.mediaUrl && msg.type !== 'image' && msg.type !== 'video' && msg.type !== 'voice' && msg.type !== 'file' && msg.type !== 'location')) {
            return (
              <div
                role="button"
                tabIndex={0}
                onDoubleClick={() => onDoubleClick(msg)}
                onContextMenu={(e) => onContextMenu(e, msg)}
                onClick={() => onReactionToggle(msg.id)}
                className={`inline-block px-3.5 py-2.5 rounded-2xl text-[15px] leading-relaxed cursor-pointer active:scale-[0.98] transition-transform ${isSearchMatch ? 'ring-2 ring-[#FFD700]' : ''
                  } ${isMe
                    ? 'bg-[#00C300] text-white rounded-br-sm shadow-[0_1px_2px_rgba(0,0,0,0.12)]'
                    : 'bg-white text-[#111111] rounded-bl-sm shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                  }`}
              >
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              </div>
            );
          }

          return null;
        })()}

        {/* Reactions */}
        {hasReactions && (
          <div className={`flex gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'} flex-wrap`}>
            {Object.entries(reactions).map(([reaction, users]) => {
              if ((users as string[]).length === 0) return null;
              const rc = reactionEmojis.find((r: ReactionEmoji) => r.label === reaction);
              if (!rc) return null;
              const isMeReacted = (users as string[]).includes(currentUserId);
              return (
                <button type="button" key={reaction} onClick={() => onReact(msg.id, reaction)}
                  className={`rounded-full px-1.5 py-0.5 text-xs shadow-sm flex items-center gap-0.5 border transition-all hover:scale-105 ${isMeReacted ? 'bg-[#00C300]/10 border-[#00C300]/30' : 'bg-white border-transparent'}`}
                >
                  <span className="text-sm">{rc.emoji}</span>
                  <span className="text-[#8D8D8D] text-[10px]">{(users as string[]).length}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Translation */}
        {(translatedText || isTranslating) && (
          <div className={`mt-1 px-3 py-1.5 rounded-xl text-[12px] border ${isMe ? 'bg-white/20 border-white/20 text-white/90' : 'bg-[#F0F9FF] border-[#2196F3]/20 text-[#111111]'}`}>
            <div className="flex items-center gap-1 mb-0.5">
              <Languages size={10} className={isMe ? 'text-white/60' : 'text-[#2196F3]'} />
              <span className={`text-[9px] font-medium ${isMe ? 'text-white/60' : 'text-[#2196F3]'}`}>Translation</span>
            </div>
            {isTranslating ? (
              <span className="opacity-60">Translating...</span>
            ) : (
              <span>{translatedText}</span>
            )}
          </div>
        )}

        {/* Delivery Status + Timestamp */}
        <div
          className={`flex items-center gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'
            }`}
          onClick={msg.deliveryStatus === 'failed' && onRetry ? () => onRetry(msg) : undefined}
          style={msg.deliveryStatus === 'failed' && onRetry ? { cursor: 'pointer' } : undefined}
        >
          <DeliveryStatusIcon status={msg.deliveryStatus} isMe={isMe} timestamp={msg.timestamp} />
          {!isMe && <span className="text-[10px] text-[#ADADAD]">{formatTime(msg.timestamp)}</span>}
          {msg.edited && <span className="text-[9px] italic text-[#ADADAD]">edited</span>}
          {msg.deliveryStatus === 'failed' && onRetry && (
            <RotateCcw size={10} className="text-[#FF3B30]" />
          )}
        </div>

        {/* Reaction Picker */}
        <AnimatePresence>
          {showReactions && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              className={`absolute -bottom-10 ${isMe ? 'right-0' : 'left-0'} z-30`}
            >
              <div className="bg-white rounded-full shadow-lg px-2 py-1 flex gap-0.5">
                {reactionEmojis.map((reaction: ReactionEmoji) => (
                  <button type="button" key={reaction.label}
                    onClick={() => onReact(msg.id, reaction.label)}
                    className="p-1.5 hover:bg-[#F5F5F5] rounded-full transition-all hover:scale-125 text-xl"
                    aria-label={`React with ${reaction.label}`}
                  >
                    {reaction.emoji}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});

