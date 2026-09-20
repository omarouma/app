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
        className="shrink-0 flex justify-between items-center px-3 py-2.5 bg-primary border-b border-primary/80 z-10"
        style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top, 0px))' }}
      >
        <div className="flex items-center gap-2">
          <button type="button" onClick={props.onExitSelection} className="icon-btn w-10 h-10 text-primary-foreground" aria-label="Cancel selection">
            <X size={22} />
          </button>
          <span className="text-primary-foreground font-bold text-base">{props.selectedCount} selected</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={props.onCopySelected} className="icon-btn w-10 h-10 text-primary-foreground" aria-label="Copy selected">
            <Copy size={20} />
          </button>
          <button type="button" onClick={props.onForwardSelected} className="icon-btn w-10 h-10 text-primary-foreground" aria-label="Forward selected">
            <Forward size={20} />
          </button>
          <button type="button" onClick={props.onDeleteSelected} className="icon-btn w-10 h-10 text-primary-foreground" aria-label="Delete selected">
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
      className="shrink-0 flex justify-between items-center gap-1 px-2 pb-2 bg-card border-b border-border z-10"
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
    >
      {/* Left: back + avatar + name/status */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <button
          type="button"
          onClick={props.onBack}
          aria-label="Go back"
          className="icon-btn w-10 h-10 -ml-1 shrink-0 text-foreground"
        >
          <ChevronLeft size={26} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={props.onViewProfile}
          className="flex items-center gap-2.5 min-w-0 flex-1 text-left rounded-xl active:bg-accent px-1 py-0.5"
          aria-label="View profile"
        >
          <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0">
            {sanitizeMediaUrl(props.displayUser?.avatar) ? (
              <img src={sanitizeMediaUrl(props.displayUser?.avatar)} className="w-full h-full object-cover" alt="User avatar" />
            ) : (
              <img src={getDefaultAvatar(props.displayUser?.id || props.userId || props.displayUser?.name || 'U')} className="w-full h-full object-cover" alt="User avatar" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-foreground leading-tight truncate">{props.displayUser?.name || 'Chat'}</h3>
            <p className="text-[11px] text-muted-foreground truncate leading-tight">
              {props.activeTypingUsers.length > 0
                ? renderTypingText(props.activeTypingUsers)
                : props.isUserOnline ? 'Online' : props.lastSeen ? `last seen ${props.lastSeen}` : 'Offline'}
            </p>
          </div>
        </button>
      </div>

      {/* Right: essential actions only (voice, video, more) */}
      <div className="flex items-center gap-0.5 shrink-0 text-foreground">
        <button
          type="button"
          onClick={props.onToggleSearch}
          className="icon-btn w-10 h-10"
          aria-label="Search messages"
        >
          <Search size={21} strokeWidth={1.75} className={props.showSearch ? 'text-primary' : ''} />
        </button>
        <button
          type="button"
          onClick={props.onVoiceCall}
          className="icon-btn w-10 h-10"
          aria-label="Start voice call"
        >
          <Phone size={21} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={props.onVideoCall}
          className="icon-btn w-10 h-10"
          aria-label="Start video call"
        >
          <Video size={21} strokeWidth={1.75} />
        </button>

        <div className="relative" ref={moreMenuRef}>
          <button
            type="button"
            onClick={() => setShowMoreMenu(prev => !prev)}
            className="icon-btn w-10 h-10"
            aria-label="Open chat options"
            aria-expanded={showMoreMenu}
          >
            <MoreHorizontal size={21} strokeWidth={1.75} />
          </button>
          <AnimatePresence>
            {showMoreMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -5 }}
                className="absolute right-0 top-full mt-1 bg-card rounded-xl shadow-xl border border-border py-1 z-50 w-48"
              >
                <button
                  type="button"
                  onClick={() => { setShowMoreMenu(false); props.onViewProfile(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors text-left"
                >
                  <User size={16} /> View Profile
                </button>
                <button
                  type="button"
                  onClick={() => { setShowMoreMenu(false); props.onChatInfo(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors text-left"
                >
                  <Info size={16} /> Chat Info
                </button>
                <button
                  type="button"
                  onClick={() => { setShowMoreMenu(false); props.onToggleBgPicker(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors text-left"
                >
                  <Palette size={16} /> Chat Background
                </button>
                <button
                  type="button"
                  onClick={() => { setShowMoreMenu(false); props.onToggleTransfer(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors text-left"
                >
                  <Wallet size={16} className="text-primary" /> Send Money
                </button>
                <div className="h-px bg-border my-1" />
                {props.friendStatus === 'friends' && (
                  <button
                    type="button"
                    onClick={() => { setShowMoreMenu(false); props.onRemoveFriend(); }}
                    disabled={props.processingAction}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors text-left disabled:opacity-50"
                  >
                    <UserMinus size={16} /> Remove Friend
                  </button>
                )}
                {props.friendStatus !== 'blocked' ? (
                  <button
                    type="button"
                    onClick={() => { setShowMoreMenu(false); props.onBlockUser(); }}
                    disabled={props.processingAction}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors text-left disabled:opacity-50"
                  >
                    <Ban size={16} /> Block User
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setShowMoreMenu(false); props.onUnblockUser(); }}
                    disabled={props.processingAction}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-primary hover:bg-primary/10 transition-colors text-left disabled:opacity-50"
                  >
                    <Check size={16} /> Unblock User
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setShowMoreMenu(false); props.onReport(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors text-left"
                >
                  <Flag size={16} /> Report User
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
