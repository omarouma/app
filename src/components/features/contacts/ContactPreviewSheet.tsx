import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageCircle, Phone, Video, Ban, UserPlus, Star, StarOff,
  User as UserIcon, BadgeCheck, X, Loader,
} from 'lucide-react';
import { getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
import type { User } from '@/types';

export interface ContactPreviewSheetProps {
  /** The user to preview. `null` closes the sheet. */
  user: User | null;
  /** Whether the previewed user is already a friend. */
  isFriend: boolean;
  /** Whether the previewed user is a favorite of the current user. */
  isFavorite: boolean;
  /** Whether the current user has blocked this user. */
  isBlocked: boolean;
  /** Whether the current user has a pending outgoing request to this user. */
  requestSent?: boolean;
  /** Whether the current user has an incoming request from this user. */
  requestReceived?: boolean;
  onClose: () => void;
  onMessage: (userId: string) => void;
  onVoiceCall: (userId: string) => void;
  onVideoCall: (userId: string) => void;
  onToggleFavorite: (userId: string) => void;
  onBlock: (userId: string) => void;
  onUnblock: (userId: string) => void;
  onAddFriend: (userId: string) => void;
  onViewProfile: (userId: string) => void;
}

/**
 * Bottom-sheet contact preview shown before starting a chat. Gives the user a
 * quick look at who they are about to message plus the primary actions
 * (Message / Voice / Video / Star / Block / Add friend).
 */
export default function ContactPreviewSheet({
  user,
  isFriend,
  isFavorite,
  isBlocked,
  requestSent,
  requestReceived,
  onClose,
  onMessage,
  onVoiceCall,
  onVideoCall,
  onToggleFavorite,
  onBlock,
  onUnblock,
  onAddFriend,
  onViewProfile,
}: ContactPreviewSheetProps) {
  const [busy, setBusy] = useState(false);

  // Reset busy state whenever a new user is previewed.
  useEffect(() => { setBusy(false); }, [user?.id]);

  const run = async (fn: () => void | Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const avatarSrc = user
    ? sanitizeMediaUrl(user.avatar) || getDefaultAvatar(user.id || user.name || 'U')
    : '';

  return (
    <AnimatePresence>
      {user && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="bg-white rounded-t-3xl w-full max-w-lg pb-[max(16px,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-[#EBEBEB] rounded-full mx-auto mt-3 mb-4" />

            <div className="px-5">
              <div className="flex items-start gap-4">
                <div className="relative shrink-0">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-[#F5F5F5]">
                    <img src={avatarSrc} className="w-full h-full object-cover" alt={`${user.name}'s avatar`} />
                  </div>
                  {isBlocked && (
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#FF3B30] flex items-center justify-center border-2 border-white">
                      <Ban size={12} className="text-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-lg font-bold text-[#111111] truncate">{user.name || 'User'}</h3>
                    {user.verified && <BadgeCheck size={16} className="text-[#00C300] shrink-0" />}
                  </div>
                  <p className="text-sm text-[#8D8D8D] truncate">@{user.username || 'user'}</p>
                  {user.bio && <p className="text-xs text-[#8D8D8D] mt-1 line-clamp-2">{user.bio}</p>}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {isFriend && (
                      <span className="text-[10px] font-medium bg-[#00C300]/10 text-[#00C300] px-2 py-0.5 rounded-full">Friend</span>
                    )}
                    {isFavorite && (
                      <span className="text-[10px] font-medium bg-[#FF9800]/10 text-[#FF9800] px-2 py-0.5 rounded-full">Favorite</span>
                    )}
                    {requestSent && (
                      <span className="text-[10px] font-medium bg-[#2196F3]/10 text-[#2196F3] px-2 py-0.5 rounded-full">Request sent</span>
                    )}
                    {requestReceived && (
                      <span className="text-[10px] font-medium bg-[#9C27B0]/10 text-[#9C27B0] px-2 py-0.5 rounded-full">Wants to connect</span>
                    )}
                    {isBlocked && (
                      <span className="text-[10px] font-medium bg-[#FF3B30]/10 text-[#FF3B30] px-2 py-0.5 rounded-full">Blocked</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F5F5F5] shrink-0"
                  aria-label="Close preview"
                >
                  <X size={18} className="text-[#8D8D8D]" />
                </button>
              </div>

              {/* Primary actions */}
              <div className="grid grid-cols-3 gap-2 mt-5">
                <button
                  type="button"
                  disabled={busy || isBlocked}
                  onClick={() => run(() => onMessage(user.id))}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-[#00C300]/10 text-[#00C300] font-medium text-xs active:bg-[#00C300]/20 transition-colors disabled:opacity-40"
                >
                  <MessageCircle size={20} /> Message
                </button>
                <button
                  type="button"
                  disabled={busy || isBlocked}
                  onClick={() => run(() => onVoiceCall(user.id))}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-[#2196F3]/10 text-[#2196F3] font-medium text-xs active:bg-[#2196F3]/20 transition-colors disabled:opacity-40"
                >
                  <Phone size={20} /> Voice
                </button>
                <button
                  type="button"
                  disabled={busy || isBlocked}
                  onClick={() => run(() => onVideoCall(user.id))}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-[#9C27B0]/10 text-[#9C27B0] font-medium text-xs active:bg-[#9C27B0]/20 transition-colors disabled:opacity-40"
                >
                  <Video size={20} /> Video
                </button>
              </div>

              {/* Secondary actions */}
              <div className="mt-2 space-y-1">
                {!isFriend && !isBlocked && !requestSent && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => onAddFriend(user.id))}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#F5F5F5] transition-colors text-left disabled:opacity-40"
                  >
                    <UserPlus size={18} className="text-[#00C300]" />
                    <span className="text-sm font-medium text-[#111111]">Add friend</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => onToggleFavorite(user.id))}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#F5F5F5] transition-colors text-left disabled:opacity-40"
                >
                  {isFavorite
                    ? <><StarOff size={18} className="text-[#FF9800]" /><span className="text-sm font-medium text-[#111111]">Remove from favorites</span></>
                    : <><Star size={18} className="text-[#FF9800]" /><span className="text-sm font-medium text-[#111111]">Add to favorites</span></>}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => onViewProfile(user.id))}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#F5F5F5] transition-colors text-left disabled:opacity-40"
                >
                  <UserIcon size={18} className="text-[#2196F3]" />
                  <span className="text-sm font-medium text-[#111111]">View full profile</span>
                </button>
                {isBlocked ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => onUnblock(user.id))}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#F5F5F5] transition-colors text-left disabled:opacity-40"
                  >
                    <Ban size={18} className="text-[#00C300]" />
                    <span className="text-sm font-medium text-[#00C300]">Unblock</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => onBlock(user.id))}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#F5F5F5] transition-colors text-left disabled:opacity-40"
                  >
                    <Ban size={18} className="text-[#FF3B30]" />
                    <span className="text-sm font-medium text-[#FF3B30]">Block</span>
                  </button>
                )}
              </div>

              {busy && (
                <div className="flex items-center justify-center gap-2 py-2 text-[#8D8D8D] text-xs">
                  <Loader size={14} className="animate-spin" /> Working…
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
