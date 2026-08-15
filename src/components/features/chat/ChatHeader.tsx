import { memo, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Search, Wallet, Phone, Video, MoreHorizontal,
  X, Copy, Forward, Trash2, User, Info, UserMinus, Ban, Check, Flag, Palette,
} from 'lucide-react';
import { sanitizeMediaUrl, getDefaultAvatar } from '@/lib/utils';

interface ChatHeaderProps {
  displayUser: { name: string; avatar: string; id: string };
  userId: string;
  isUserOnline: boolean;
  lastSeen: string | null;
  activeTypingUsers: string[];
  showSearch: boolean;
  selectionMode: boolean;
  selectedCount: number;
  friendStatus: string;
  processingAction: boolean;
  onBack: () => void;
  onToggleSearch: () => void;
  onToggleBgPicker: () => void;
  onToggleTransfer: () => void;
  onVoiceCall: () => void;
  onVideoCall: () => void;
  onViewProfile: () => void;
  onChatInfo: () => void;
  onRemoveFriend: () => void;
  onBlockUser: () => void;
  onUnblockUser: () => void;
  onReport: () => void;
  onCopySelected: () => void;
  onForwardSelected: () => void;
  onDeleteSelected: () => void;
  onExitSelection: () => void;
}

export const ChatHeader = memo(function ChatHeader(props: ChatHeaderProps) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Close more menu on outside click
  useEffect(() => {
    if (!showMoreMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [showMoreMenu]);

  if (props.selectionMode) {
    return (
      <motion.div
        key="selection-header"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="shrink-0 flex justify-between items-center px-4 py-3 bg-[#00C300] border-b border-[#00A300] z-10"
      >
        <div className="flex items-center gap-3">
          <button type="button" onClick={props.onExitSelection} className="p-1 text-white" aria-label="Cancel selection">
            <X size={24} />
          </button>
          <span className="text-white font-bold text-base">{props.selectedCount} selected</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={props.onCopySelected} className="p-2 text-white hover:bg-white/20 rounded-full" aria-label="Copy selected">
            <Copy size={20} />
          </button>
          <button type="button" onClick={props.onForwardSelected} className="p-2 text-white hover:bg-white/20 rounded-full" aria-label="Forward selected">
            <Forward size={20} />
          </button>
          <button type="button" onClick={props.onDeleteSelected} className="p-2 text-white hover:bg-white/20 rounded-full" aria-label="Delete selected">
            <Trash2 size={20} />
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      key="normal-header"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="shrink-0 flex justify-between items-center px-2 py-3 bg-white border-b border-[#EBEBEB] z-10"
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <button type="button" onClick={props.onBack} aria-label="Go back" className="p-2 -ml-2 active:bg-gray-100 rounded-full text-[#111111]">
          <ChevronLeft size={28} strokeWidth={1.5} />
        </button>
        <div className="w-9 h-9 rounded-full bg-[#F5F5F5] flex items-center justify-center overflow-hidden shrink-0">
          {sanitizeMediaUrl(props.displayUser?.avatar) ? (
            <img src={sanitizeMediaUrl(props.displayUser?.avatar)} className="w-full h-full object-cover" alt="User avatar" />
          ) : (
            <img src={getDefaultAvatar(props.displayUser?.id || props.userId || props.displayUser?.name || 'U')} className="w-full h-full object-cover" alt="User avatar" />
          )}
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-[#111111] leading-tight truncate">{props.displayUser?.name || 'Chat'}</h3>
          <p className="text-[11px] text-[#8D8D8D] truncate">
            {props.activeTypingUsers.length > 0
              ? renderTypingText(props.activeTypingUsers)
              : props.isUserOnline ? 'Online' : props.lastSeen ? `last seen ${props.lastSeen}` : 'Offline'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 pr-3 text-[#111111]">
        <button type="button" onClick={props.onToggleSearch} className="active:opacity-60" aria-label="Search messages">
          <Search size={22} strokeWidth={1.5} className={props.showSearch ? 'text-[#00C300]' : ''} />
        </button>
        <button type="button" onClick={props.onToggleBgPicker} className="active:opacity-60" aria-label="Chat background">
          <Palette size={22} strokeWidth={1.5} />
        </button>
        <button type="button" onClick={props.onToggleTransfer} className="active:opacity-60" aria-label="Send money">
          <Wallet size={22} strokeWidth={1.5} className="text-[#00C300]" />
        </button>
        <button type="button" onClick={props.onVoiceCall} className="active:opacity-60" aria-label="Start voice call">
          <Phone size={22} strokeWidth={1.5} />
        </button>
        <button type="button" onClick={props.onVideoCall} className="active:opacity-60" aria-label="Start video call">
          <Video size={22} strokeWidth={1.5} />
        </button>

        <div className="relative" ref={moreMenuRef}>
          <button
            type="button"
            onClick={() => setShowMoreMenu(prev => !prev)}
            className="active:opacity-60"
            aria-label="Open chat options"
          >
            <MoreHorizontal size={22} strokeWidth={1.5} />
          </button>
          <AnimatePresence>
            {showMoreMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -5 }}
                className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-[#EBEBEB] py-1 z-50 w-44"
              >
                <button
                  type="button"
                  onClick={() => { setShowMoreMenu(false); props.onViewProfile(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#111111] hover:bg-[#F5F5F5] transition-colors text-left"
                >
                  <User size={14} /> View Profile
                </button>
                <button
                  type="button"
                  onClick={() => { setShowMoreMenu(false); props.onChatInfo(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#111111] hover:bg-[#F5F5F5] transition-colors text-left"
                >
                  <Info size={14} /> Chat Info
                </button>
                {props.friendStatus === 'friends' && (
                  <button
                    type="button"
                    onClick={() => { setShowMoreMenu(false); props.onRemoveFriend(); }}
                    disabled={props.processingAction}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#FF3B30] hover:bg-[#FF3B30]/10 transition-colors text-left disabled:opacity-50"
                  >
                    <UserMinus size={14} /> Remove Friend
                  </button>
                )}
                {props.friendStatus !== 'blocked' ? (
                  <button
                    type="button"
                    onClick={() => { setShowMoreMenu(false); props.onBlockUser(); }}
                    disabled={props.processingAction}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#111111] hover:bg-[#F5F5F5] transition-colors text-left disabled:opacity-50"
                  >
                    <Ban size={14} /> Block User
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setShowMoreMenu(false); props.onUnblockUser(); }}
                    disabled={props.processingAction}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#00C300] hover:bg-[#00C300]/10 transition-colors text-left disabled:opacity-50"
                  >
                    <Check size={14} /> Unblock User
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setShowMoreMenu(false); props.onReport(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#111111] hover:bg-[#F5F5F5] transition-colors text-left"
                >
                  <Flag size={14} /> Report User
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
});

const MAX_NAME_LEN = 16;
function truncateName(s: string): string {
  return s.length > MAX_NAME_LEN ? s.slice(0, MAX_NAME_LEN) + '\u2026' : s;
}

function renderTypingText(typingUsers: string[]): string {
  if (typingUsers.length === 1) return `${truncateName(typingUsers[0])} is typing...`;
  if (typingUsers.length === 2) return `${truncateName(typingUsers[0])} and ${truncateName(typingUsers[1])} are typing...`;
  return `${truncateName(typingUsers[0])} and ${typingUsers.length - 1} others are typing...`;
}
