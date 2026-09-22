import { memo, useMemo } from 'react';
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
  otherUserName?: string;
  userId: string;
  currentUserId: string;
  msgIdMap?: Map<string, Message>;
  translatedText?: string;
  isTranslating?: boolean;
  /** Per-message sender info (used by group chat where each message has a
   *  different author). When provided it overrides `displayUser` for the
   *  avatar and reply-preview fallback name. */
  senderInfo?: { id: string; name: string; avatar?: string };
  /** Show the sender's name above the bubble (group chat, non-me messages). */
  showSenderName?: boolean;
  /** Resolve a senderId to a display name (group chat reply previews). */
  resolveSenderName?: (senderId: string) => string;

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
    displayUser, otherUserName, userId, currentUserId, msgIdMap,
    translatedText, isTranslating, senderInfo, showSenderName, resolveSenderName,
    onContextMenu, onTouchStart, onTouchMove, onTouchEnd, onMouseDown, onMouseUp,
    onMouseLeave, onClick, onDoubleClick, onReact, onEditInputChange,
    onEditSave, onEditCancel, onSetReplyingTo, onSetLightbox, onVotePoll, onNavigate, onRetry, chatId,
  } = props;

  const avatarSrc = senderInfo ? senderInfo.avatar : displayUser?.avatar;
  const avatarId = senderInfo ? senderInfo.id : (displayUser?.id || userId || displayUser?.name || 'U');
  const avatarEl = showAvatar ? (
    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center mr-2 self-end shrink-0 overflow-hidden">
      {sanitizeMediaUrl(avatarSrc) ? (
        <img src={sanitizeMediaUrl(avatarSrc)} className="w-full h-full object-cover" alt="" />
      ) : (
        <img src={getDefaultAvatar(avatarId)} className="w-full h-full object-cover" alt="" />
      )}
    </div>
  ) : null;

  const reactions = msg.reactions || {};
  const hasReactions = Object.values(reactions).some((u) => (u as string[]).length > 0);
  const isEditing = editingMessageId === msg.id;

  const MessageComponent = messageComponentMap[msg.type] || TextMessage;

  const repliedInfo = useMemo(() => {
    if (!msg.replyTo) return null;
    const r = msgIdMap?.get(msg.replyTo);
    if (!r) return null;
    const senderIsMe = r.senderId === currentUserId;
    const senderIsSystem = r.senderId === 'system';
    const fallbackName = otherUserName ?? senderInfo?.name ?? displayUser?.name ?? 'Chat';
    const senderName = senderIsMe
      ? 'You'
      : senderIsSystem
        ? 'System'
        : (resolveSenderName ? resolveSenderName(r.senderId) : fallbackName);
    const previewText = typeof r.content === 'string' ? r.content : '';
    return {
      message: r,
      preview: previewText.length > 60 ? `${previewText.slice(0, 60)}...` : previewText,
      senderName,
    };
  }, [msg.replyTo, msgIdMap, currentUserId, otherUserName, displayUser?.name, senderInfo?.name, resolveSenderName]);

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

  const failed = msg.deliveryStatus === 'failed' && !!onRetry;

  return (
    <div className="px-1">
      {showDate && (
        <div className="flex justify-center my-4">
          <span className="bg-muted text-muted-foreground text-[11px] px-3 py-1 rounded-full font-medium shadow-sm">
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
          className={`flex items-end ${isMe ? 'justify-end' : 'justify-start'} ${showAvatar ? 'mt-2.5' : 'mt-0.5'} ${
            isSelected ? 'opacity-70' : ''
          } ${failed ? 'cursor-pointer' : ''}`}
          onContextMenu={(e: React.MouseEvent) => {
            if (msg.type !== 'deleted') onContextMenu(e, msg);
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onMouseDown={() => onMouseDown(msg)}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          onClick={() => onClick(msg)}
          onDoubleClick={() => onDoubleClick(msg)}
        >
          {avatarEl}
          <div
            className={`max-w-[75%] relative ${!isMe && !showAvatar ? 'ml-10' : ''} ${
              failed ? 'active:bg-[#FF3B30]/5 rounded-xl' : ''
            }`}
            onClick={(e) => {
              if (failed && onRetry) {
                e.stopPropagation();
                onRetry(msg);
              }
            }}
          >
            {showSenderName && !isMe && senderInfo?.name && (
              <p className="text-[11px] font-medium text-muted-foreground mb-0.5 ml-1 truncate">{senderInfo.name}</p>
            )}

            {msg.replyTo && (
              <div
                className={`rounded-t-2xl px-3 py-1.5 mb-0.5 cursor-pointer hover:opacity-80 transition-opacity border-l-2 ${
                  isMe ? 'bg-black/15 border-white/60' : 'bg-muted border-[#00C300]'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (repliedInfo?.message) onSetReplyingTo(repliedInfo.message);
                }}
              >
                {repliedInfo?.senderName && (
                  <p className={`text-[10px] font-semibold mb-0.5 truncate ${isMe ? 'text-white/80' : 'text-[#00C300]'}`}>
                    {repliedInfo.senderName}
                  </p>
                )}
                <p className={`text-[11px] truncate ${isMe ? 'text-white/70' : 'text-muted-foreground'}`}>
                  {repliedInfo?.preview || 'Replying to message'}
                </p>
              </div>
            )}

            {renderMessageContent()}

            {(translatedText || isTranslating) && !isEditing && msg.type === 'text' && (
              <div className={`mt-1 px-3 py-1.5 rounded-xl text-[12px] border ${isMe ? 'bg-white/20 border-white/20 text-white/90' : 'bg-info/10 border-info/20 text-foreground'}`}>
                <p className={`text-[9px] font-medium mb-0.5 ${isMe ? 'text-white/60' : 'text-info'}`}>Translation</p>
                {isTranslating ? <span className="opacity-60">Translating...</span> : <span>{translatedText}</span>}
              </div>
            )}

            {hasReactions && (
              <div className={`flex gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'} flex-wrap`}>
                {Object.entries(reactions).map(([reaction, users]) => {
                  if ((users as string[]).length === 0) return null;
                  const rc = reactionEmojis.find((r: ReactionEmoji) => r.label === reaction)
                    ?? reactionEmojis.find((r: ReactionEmoji) => r.emoji === reaction);
                  if (!rc) return null;
                  const isMeReacted = (users as string[]).includes(currentUserId);
                  return (
                    <button
                      type="button"
                      key={reaction}
                      onClick={(e) => {
                        e.stopPropagation();
                        onReact(msg.id, reaction);
                      }}
                      className={`rounded-full px-1.5 py-0.5 text-xs shadow-sm flex items-center gap-0.5 border transition-all hover:scale-105 ${isMeReacted ? 'bg-[#00C300]/10 border-[#00C300]/30' : 'bg-background border-transparent'}`}
                    >
                      <span className="text-sm">{rc.emoji}</span>
                      <span className="text-muted-foreground text-[10px]">{(users as string[]).length}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div
              onClick={(e) => {
                if (failed && onRetry) {
                  e.stopPropagation();
                  onRetry(msg);
                }
              }}
              style={failed ? { cursor: 'pointer' } : undefined}
            >
              <ReadReceipt
                isMe={isMe}
                timestamp={msg.timestamp}
                deliveryStatus={msg.deliveryStatus}
                edited={msg.edited}
                highlightFailed={failed}
              />
            </div>
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
            <div className="bg-background rounded-full shadow-lg px-2 py-1 flex gap-0.5">
              {reactionEmojis.map((reaction: ReactionEmoji) => (
                <button
                  type="button"
                  key={reaction.label}
                  onClick={() => onReact(msg.id, reaction.label)}
                  className="p-1.5 hover:bg-muted rounded-full transition-all hover:scale-125 text-xl"
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
