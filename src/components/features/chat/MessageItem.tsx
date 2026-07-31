import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3, FileText, MapPin, Check
} from 'lucide-react';
import { formatTime, getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
import { reactionEmojis } from '@/lib/chatConstants';
import { ReadReceipt } from './ReadReceipt';
import type { Message } from '@/types';
import type { ReactionEmoji } from '@/lib/chatConstants';

export interface MessageItemProps {
  msg: Message;
  isMe: boolean;
  showAvatar: boolean;
  showDate: boolean;
  msgDate: string;
  showUnreadSeparator: boolean;
  isSelected: boolean;
  isSearchMatch: boolean;
  editingMessageId: string | null;
  editInput: string;
  selectionMode: boolean;
  selectedReactionMsg: string | null;
  displayUser: { name: string; avatar: string; id: string };
  userId: string;
  currentUserId: string;
  msgs: Message[];
  translatedText?: string;
  isTranslating?: boolean;

  onContextMenu: (e: React.MouseEvent, msg: Message) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (msg: Message) => void;
  onMouseDown: (msg: Message) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onClick: (msg: Message) => void;
  onDoubleClick: (msg: Message) => void;
  onReact: (msgId: string, reaction: string) => void;
  onSetReactionMsg: (id: string | null) => void;
  onEditInputChange: (v: string) => void;
  onEditSave: (msgId: string) => void;
  onEditCancel: () => void;
  onSetReplyingTo: (msg: Message) => void;
  onSetLightbox: (url: string) => void;
  onVotePoll: (chatId: string, msgId: string, idx: number, userId: string) => void;
  onNavigate: (path: string) => void;
  onRetry?: (msg: Message) => void;
  chatId: string;
}

export const MessageItem = memo(function MessageItem(props: MessageItemProps) {
  const {
    msg, isMe, showAvatar, showDate, msgDate, showUnreadSeparator, isSelected,
    isSearchMatch, editingMessageId, editInput, selectionMode, selectedReactionMsg,
    displayUser, userId, currentUserId, msgs,
    translatedText, isTranslating,
    onContextMenu, onTouchStart, onTouchMove, onTouchEnd, onMouseDown, onMouseUp,
    onMouseLeave, onClick, onDoubleClick, onReact, onSetReactionMsg, onEditInputChange,
    onEditSave, onEditCancel, onSetLightbox, onVotePoll, onNavigate, onRetry, chatId,
  } = props;

  const avatarEl = showAvatar ? (
    <div className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center mr-2 self-end shrink-0 overflow-hidden">
      {sanitizeMediaUrl(displayUser?.avatar) ? (
        <img src={sanitizeMediaUrl(displayUser?.avatar)} className="w-full h-full object-cover" alt="" />
      ) : (
        <img src={getDefaultAvatar(displayUser?.id || userId || displayUser?.name || 'U')} className="w-full h-full object-cover" alt="" />
      )}
    </div>
  ) : null;

  const reactions = msg.reactions || {};
  const hasReactions = Object.values(reactions).some((u) => (u as string[]).length > 0);
  const isEditing = editingMessageId === msg.id;

  return (
    <div>
      {/* Date Separator */}
      {showDate && (
        <div className="flex justify-center my-4">
          <span className="bg-[#E4E6EB] text-[#8D8D8D] text-[11px] px-3 py-1 rounded-full font-medium">
            {msgDate}
          </span>
        </div>
      )}

      {/* New Messages Separator */}
      {showUnreadSeparator && (
        <div className="flex justify-center my-3">
          <div className="flex items-center gap-2 px-4 py-1.5 bg-[#FF3B30]/10 rounded-full">
            <span className="w-2 h-2 bg-[#FF3B30] rounded-full" />
            <span className="text-[#FF3B30] text-[11px] font-medium">New Messages</span>
          </div>
        </div>
      )}

      {/* Money Transfer */}
      {msg.type === 'money_transfer' && msg.transferData && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex justify-center my-3">
          <div className={`rounded-2xl px-5 py-3 max-w-[80%] text-center border border-[#EBEBEB] ${msg.transferData.toUserId === currentUserId ? 'bg-[#00C300]/10' : 'bg-white'}`}>
            <p className="text-[#00C300] text-xs font-medium mb-1">
              {msg.transferData.toUserId === currentUserId ? '\u{1F4B0} You received' : '\u{1F4B8} You sent'}
            </p>
            <p className="text-[#111111] text-xl font-bold">
              {msg.transferData.currency === 'BDT' ? `\u09F3${msg.transferData.amount}` : `${msg.transferData.amount} coins`}
            </p>
            {msg.transferData.note && <p className="text-[#8D8D8D] text-xs mt-1">{msg.transferData.note}</p>}
            <p className="text-[#8D8D8D] text-[10px] mt-1">{formatTime(msg.timestamp)}</p>
          </div>
        </motion.div>
      )}

      {/* Poll */}
      {msg.type === 'poll' && msg.pollData && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${isSelected ? 'opacity-70' : ''}`}
        >
          {avatarEl}
          <div className={`max-w-[70%] ${!isMe && !showAvatar ? 'ml-10' : ''}`}>
            <div className={`inline-block px-4 py-3 rounded-2xl ${isMe ? 'bg-[#8B5CF6] text-white rounded-br-none' : 'bg-white text-[#111111] rounded-bl-none'}`}>
              <div className="flex items-center gap-1.5 mb-2"><BarChart3 size={14} /><span className="text-xs font-medium">Poll</span></div>
              <p className="text-sm font-medium mb-2">{msg.pollData.question}</p>
              <div className="space-y-1.5">
                {(msg.pollData.options || []).map((opt: string, i: number) => {
                  const votes = (msg.pollData!.votes?.[String(i)] || []) as string[];
                  const total = msg.pollData!.totalVotes || 0;
                  const percent = total > 0 ? Math.round((votes.length / total) * 100) : 0;
                  const isVoted = votes.includes(currentUserId);
                  const hasVoted = Object.values(msg.pollData!.votes || {}).flat().includes(currentUserId);
                  return (
                    <button type="button" key={i}
                      onClick={() => onVotePoll(chatId, msg.id, i, currentUserId)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all relative overflow-hidden ${
                        isVoted ? isMe ? 'bg-white/30 text-white' : 'bg-[#8B5CF6]/10 text-[#8B5CF6]'
                          : isMe ? 'bg-white/10 text-white/90 hover:bg-white/20' : 'bg-[#F5F5F5] text-[#111111] hover:bg-[#EBEBEB]'
                      }`}
                    >
                      {hasVoted && <div aria-hidden="true" className={`absolute left-0 top-0 h-full rounded-xl overflow-hidden ${isMe ? 'bg-white/20' : 'bg-[#8B5CF6]/10'}`} style={{ width: `${percent}%` }} />}
                      <span className="relative z-10 flex items-center justify-between">
                        <span>{opt}</span>
                        {hasVoted && <span className="text-xs opacity-70">{votes.length} ({percent}%)</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
              <ReadReceipt isMe={isMe} timestamp={msg.timestamp} read={msg.read} />
            </div>
          </div>
        </motion.div>
      )}

      {/* Contact Card */}
      {msg.type === 'contact_card' && msg.contactCard && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${isSelected ? 'opacity-70' : ''}`}
        >
          {avatarEl}
          <div className={`max-w-[70%] ${!isMe && !showAvatar ? 'ml-10' : ''}`}>
            <div className={`inline-block px-4 py-3 rounded-2xl ${isMe ? 'bg-[#00C300] text-white rounded-br-none' : 'bg-white text-[#111111] rounded-bl-none'} shadow-sm`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center shrink-0 overflow-hidden">
                  {msg.contactCard.avatar ? <img src={msg.contactCard.avatar} className="w-full h-full object-cover" alt="" /> : <img src={getDefaultAvatar(msg.contactCard.userId || msg.contactCard.name || 'U')} className="w-full h-full object-cover" alt="" />}
                </div>
                <div>
                  <p className="text-sm font-semibold">{msg.contactCard.name}</p>
                  {msg.contactCard.username && <p className="text-xs opacity-70">@{msg.contactCard.username}</p>}
                </div>
              </div>
              {msg.contactCard.phone && <p className="text-xs opacity-80 mb-1">📞 {msg.contactCard.phone}</p>}
              {msg.contactCard.email && <p className="text-xs opacity-80 mb-1">✉️ {msg.contactCard.email}</p>}
              {msg.contactCard.bio && <p className="text-xs opacity-70 line-clamp-2">{msg.contactCard.bio}</p>}
              <button type="button" onClick={() => onNavigate(`/profile/${msg.contactCard!.userId}`)}
                className={`mt-2 w-full py-1.5 rounded-lg text-xs font-medium transition-colors ${isMe ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-[#F5F5F5] text-[#111111] hover:bg-[#EBEBEB]'}`}
              >
                View Profile
              </button>
            </div>
            <ReadReceipt isMe={isMe} timestamp={msg.timestamp} read={msg.read} />
          </div>
        </motion.div>
      )}

      {/* Regular Messages (text, image, video, voice, file, location, deleted) */}
      {msg.type !== 'money_transfer' && msg.type !== 'poll' && msg.type !== 'contact_card' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${isSelected ? 'opacity-70' : ''}`}
          onContextMenu={(e: React.MouseEvent) => { if (msg.type !== 'deleted') onContextMenu(e, msg); }}
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={() => onTouchEnd(msg)}
          onMouseDown={() => onMouseDown(msg)} onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}
          onClick={() => onClick(msg)}
        >
          {avatarEl}
          <div className={`max-w-[70%] relative ${!isMe && !showAvatar ? 'ml-10' : ''}`}>
            {/* Reply-to Preview */}
            {msg.replyTo && (
              <div className="bg-black/10 rounded-t-2xl px-3 py-1.5 mb-0.5">
                <p className={`text-[10px] truncate ${isMe ? 'text-white/70' : 'text-[#8D8D8D]'}`}>
                  {(() => {
                    const r = msgs.find(m => m.id === msg.replyTo);
                    return r ? r.content.substring(0, 30) + (r.content.length > 30 ? '...' : '') : 'Replying to message';
                  })()}
                </p>
              </div>
            )}

            {/* Image */}
            {msg.type === 'image' && msg.mediaUrl && (
              <img
                src={msg.mediaUrl} onClick={() => onSetLightbox(msg.mediaUrl!)}
                className="rounded-2xl mb-1 max-w-full cursor-pointer hover:opacity-95 transition-opacity"
                alt="Shared image"
                loading="lazy"
              />
            )}

            {/* Video */}
            {msg.type === 'video' && msg.mediaUrl && (
              <video src={msg.mediaUrl} className="rounded-2xl mb-1 max-w-full" controls preload="metadata" />
            )}

            {/* Voice Message */}
            {msg.type === 'voice' && msg.mediaUrl && (
              <audio src={msg.mediaUrl} className="max-w-full mb-1" controls />
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

            {/* Text Content / Editing */}
            {msg.type !== 'deleted' && msg.type !== 'image' && msg.type !== 'video' && msg.type !== 'voice' && msg.type !== 'file' && msg.type !== 'location' && (
              <>
                {isEditing ? (
                  <div className={`inline-block px-3 py-2 rounded-2xl text-[15px] w-full ${isMe ? 'bg-[#00C300] text-white rounded-br-none' : 'bg-white text-[#111111] rounded-bl-none'}`}>
                    <input value={editInput} onChange={(e) => onEditInputChange(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEditSave(msg.id); } if (e.key === 'Escape') onEditCancel(); }}
                      autoFocus aria-label="Edit message content"
                      className={`w-full bg-transparent focus:outline-none text-[15px] ${isMe ? 'text-white placeholder:text-white/50' : 'text-[#111111] placeholder:text-[#8D8D8D]'}`}
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <button type="button" onClick={() => onEditSave(msg.id)} aria-label="Save edit" className={isMe ? 'text-white/80 hover:text-white' : 'text-[#00C300] hover:text-[#00A300]'}><Check size={16} /></button>
                      <button type="button" onClick={onEditCancel} aria-label="Cancel edit" className={isMe ? 'text-white/70 hover:text-white' : 'text-[#8D8D8D] hover:text-[#111111]'}><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                    </div>
                  </div>
                ) : (
                  <div
                    role="button" tabIndex={0} aria-label="Open reactions or double tap to reply"
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (selectionMode) { onClick(msg); } else { onSetReactionMsg(selectedReactionMsg === msg.id ? null : msg.id); } } }}
                    className={`inline-block px-3 py-2 rounded-2xl text-[15px] cursor-pointer active:scale-[0.98] transition-transform ${isSearchMatch ? 'ring-2 ring-[#FFD700]' : ''} ${isMe ? 'bg-[#00C300] text-white rounded-br-none' : 'bg-white text-[#111111] rounded-bl-none'}`}
                    onClick={() => onSetReactionMsg(selectedReactionMsg === msg.id ? null : msg.id)}
                    onDoubleClick={() => onDoubleClick(msg)}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                )}
                {/* Translation */}
                {(translatedText || isTranslating) && !isEditing && (
                  <div className={`mt-1 px-3 py-1.5 rounded-xl text-[12px] border ${isMe ? 'bg-white/20 border-white/20 text-white/90' : 'bg-[#F0F9FF] border-[#2196F3]/20 text-[#111111]'}`}>
                    <p className={`text-[9px] font-medium mb-0.5 ${isMe ? 'text-white/60' : 'text-[#2196F3]'}`}>Translation</p>
                    {isTranslating ? <span className="opacity-60">Translating...</span> : <span>{translatedText}</span>}
                  </div>
                )}
              </>
            )}

            {/* Reactions Row */}
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

            {/* Read Receipt */}
            <ReadReceipt isMe={isMe} timestamp={msg.timestamp} read={msg.read} />
            {/* Retry on failed */}
            {msg.deliveryStatus === 'failed' && onRetry && (
              <button
                type="button"
                onClick={() => onRetry(msg)}
                className="text-[10px] text-[#FF3B30] flex items-center gap-1 mt-0.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                Tap to retry
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* Reaction Picker Overlay */}
      <AnimatePresence>
        {selectedReactionMsg === msg.id && (
          <motion.div initial={{ opacity: 0, scale: 0.9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className={`flex ${isMe ? 'justify-end' : 'justify-start'} mt-1`}
          >
            <div className="bg-white rounded-full shadow-lg px-2 py-1 flex gap-0.5">
              {reactionEmojis.map((reaction: ReactionEmoji) => (
                <button type="button" key={reaction.label} onClick={() => onReact(msg.id, reaction.label)}
                  className="p-1.5 hover:bg-[#F5F5F5] rounded-full transition-all hover:scale-125 text-xl"
                  aria-label={`React with ${reaction.label}`}
                >{reaction.emoji}</button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

