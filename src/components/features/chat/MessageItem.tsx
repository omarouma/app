import { memo } from 'react';
import type React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TextMessage, ImageMessage, VideoMessage, VoiceMessage, FileMessage,
  LocationMessage, DeletedMessage, PollMessage, ContactCardMessage, MoneyTransferMessage
} from './messages';
import { getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
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
  onTouchEnd: () => void;
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

const messageComponentMap = {
  text: TextMessage,
  image: ImageMessage,
  video: VideoMessage,
  voice: VoiceMessage,
  file: FileMessage,
  location: LocationMessage,
  deleted: DeletedMessage,
  poll: PollMessage,
  contact_card: ContactCardMessage,
  money_transfer: MoneyTransferMessage,
  sticker: TextMessage,
} as Record<string, React.ComponentType<any>>;

export const MessageItem = memo(function MessageItem(props: MessageItemProps) {
const {
    msg, isMe, showAvatar, showDate, msgDate, showUnreadSeparator, isSelected,
    editingMessageId, editInput, selectionMode: _selectionMode, selectedReactionMsg,
    displayUser, userId, currentUserId, msgs,
    translatedText, isTranslating,
    onContextMenu, onTouchStart, onTouchMove, onTouchEnd, onMouseDown, onMouseUp,
    onMouseLeave, onClick, onReact, onEditInputChange,
    onEditSave, onEditCancel, onSetReplyingTo, onSetLightbox, onVotePoll, onNavigate, onRetry, chatId,
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

  const MessageComponent = messageComponentMap[msg.type] || TextMessage;

  const renderMessageContent = () => {
    const componentProps = {
      msg,
      isMe,
      isEditing,
      editInput,
      onEditInputChange,
      onEditSave,
      onEditCancel,
      onSetLightbox,
      currentUserId,
      chatId,
      onVotePoll,
      onNavigate,
    };
    return <MessageComponent {...componentProps} />;
  };

  return (
    <div>
      {showDate && (
        <div className="flex justify-center my-4">
          <span className="bg-[#E4E6EB] text-[#8D8D8D] text-[11px] px-3 py-1 rounded-full font-medium">
            {msgDate}
          </span>
        </div>
      )}

      {showUnreadSeparator && (
        <div className="flex justify-center my-3">
          <div className="flex items-center gap-2 px-4 py-1.5 bg-[#FF3B30]/10 rounded-full">
            <span className="w-2 h-2 bg-[#FF3B30] rounded-full" />
            <span className="text-[#FF3B30] text-[11px] font-medium">New Messages</span>
          </div>
        </div>
      )}

      {msg.type === 'money_transfer' ? (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex justify-center my-3">
          <MoneyTransferMessage msg={msg} currentUserId={currentUserId} />
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${isSelected ? 'opacity-70' : ''}`}
          onContextMenu={(e: React.MouseEvent) => { if (msg.type !== 'deleted') onContextMenu(e, msg); }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onMouseDown={() => onMouseDown(msg)}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          onClick={() => onClick(msg)}
        >
          {avatarEl}
          <div className={`max-w-[70%] relative ${!isMe && !showAvatar ? 'ml-10' : ''}`}>
            {msg.replyTo && (
              <div
                className="bg-black/10 rounded-t-2xl px-3 py-1.5 mb-0.5 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={(e) => { e.stopPropagation(); const r = msgs.find(m => m.id === msg.replyTo); if (r) onSetReplyingTo(r); }}
              >
                <p className={`text-[10px] truncate ${isMe ? 'text-white/70' : 'text-[#8D8D8D]'}`}>
                  {(() => {
                    const r = msgs.find(m => m.id === msg.replyTo);
                    return r ? r.content.substring(0, 30) + (r.content.length > 30 ? '...' : '') : 'Replying to message';
                  })()}
                </p>
              </div>
            )}

            {renderMessageContent()}

            {(translatedText || isTranslating) && !isEditing && msg.type === 'text' && (
              <div className={`mt-1 px-3 py-1.5 rounded-xl text-[12px] border ${isMe ? 'bg-white/20 border-white/20 text-white/90' : 'bg-[#F0F9FF] border-[#2196F3]/20 text-[#111111]'}`}>
                <p className={`text-[9px] font-medium mb-0.5 ${isMe ? 'text-white/60' : 'text-[#2196F3]'}`}>Translation</p>
                {isTranslating ? <span className="opacity-60">Translating...</span> : <span>{translatedText}</span>}
              </div>
            )}

            {hasReactions && (
              <div className={`flex gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'} flex-wrap`}>
                {Object.entries(reactions).map(([reaction, users]) => {
                  if ((users as string[]).length === 0) return null;
                  const rc = reactionEmojis.find((r: ReactionEmoji) => r.label === reaction);
                  if (!rc) return null;
                  const isMeReacted = (users as string[]).includes(currentUserId);
                  return (
                    <button
                      type="button"
                      key={reaction}
                      onClick={() => onReact(msg.id, reaction)}
                      className={`rounded-full px-1.5 py-0.5 text-xs shadow-sm flex items-center gap-0.5 border transition-all hover:scale-105 ${isMeReacted ? 'bg-[#00C300]/10 border-[#00C300]/30' : 'bg-white border-transparent'}`}
                    >
                      <span className="text-sm">{rc.emoji}</span>
                      <span className="text-[#8D8D8D] text-[10px]">{(users as string[]).length}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <ReadReceipt isMe={isMe} timestamp={msg.timestamp} read={msg.read} deliveryStatus={msg.deliveryStatus} edited={msg.edited} />
            
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

      <AnimatePresence>
        {selectedReactionMsg === msg.id && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className={`flex ${isMe ? 'justify-end' : 'justify-start'} mt-1`}
          >
            <div className="bg-white rounded-full shadow-lg px-2 py-1 flex gap-0.5">
              {reactionEmojis.map((reaction: ReactionEmoji) => (
                <button
                  type="button"
                  key={reaction.label}
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
  );
});