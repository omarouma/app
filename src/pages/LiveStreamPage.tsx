import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Users, Heart, Flame, Star, ThumbsUp, Smile, Hand,
  MessageSquare, Gift, Share2, Monitor, PhoneOff, Zap, X, Crown,
  Send, Pin, Radio, Video, Copy, Check
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useLiveStore } from '@/store/useLiveStore';
import { useWalletStore } from '@/store/useWalletStore';
import { getDefaultAvatar } from '@/lib/utils';
import { getDocById, updateDocById, COLLECTIONS } from '@/lib/firestore';
import { toast } from 'sonner';
import type { LiveStream, LiveComment, LiveReactions } from '@/types';

/* Gift configuration */
const GIFT_CONFIG: { type: 'rose' | 'heart' | 'star' | 'crown' | 'diamond' | 'rocket'; label: string; cost: number; icon: React.ReactNode }[] = [
  { type: 'rose', label: 'Rose', cost: 5, icon: <Heart size={20} className="text-red-500" /> },
  { type: 'heart', label: 'Heart', cost: 10, icon: <Heart size={20} className="text-pink-500" /> },
  { type: 'star', label: 'Star', cost: 25, icon: <Star size={20} className="text-yellow-400" /> },
  { type: 'crown', label: 'Crown', cost: 50, icon: <Crown size={20} className="text-amber-400" /> },
  { type: 'diamond', label: 'Diamond', cost: 100, icon: <Zap size={20} className="text-cyan-400" /> },
  { type: 'rocket', label: 'Rocket', cost: 500, icon: <Zap size={20} className="text-orange-500" /> },
];

/* Reaction buttons config */
const REACTIONS: { key: keyof LiveReactions; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'like', label: 'Like', icon: <ThumbsUp size={18} />, color: '#00C300' },
  { key: 'love', label: 'Love', icon: <Heart size={18} />, color: '#FF4081' },
  { key: 'haha', label: 'Haha', icon: <Smile size={18} />, color: '#FFD700' },
  { key: 'wow', label: 'Wow', icon: <Star size={18} />, color: '#00BFFF' },
  { key: 'fire', label: 'Fire', icon: <Flame size={18} />, color: '#FF6B00' },
  { key: 'clap', label: 'Clap', icon: <Hand size={18} />, color: '#8D8D8D' },
];

/* Inline helper to deduct coins since the wallet store lacks a direct spend method */
async function spendCoins(userId: string, amount: number, description: string): Promise<boolean> {
  try {
    const wallet = await getDocById(COLLECTIONS.WALLETS, userId);
    if (!wallet) return false;
    const coins = (wallet.coins as number) || 0;
    if (coins < amount) return false;
    const tx = {
      id: `tx_${Date.now()}_gift`,
      type: 'spend',
      amount,
      currency: 'coins',
      description,
      timestamp: new Date().toISOString(),
      status: 'completed',
    };
    await updateDocById(COLLECTIONS.WALLETS, userId, {
      coins: coins - amount,
      transactions: [...(wallet.transactions || []), tx],
    });
    return true;
  } catch (err) {
    console.error('spendCoins error:', err);
    return false;
  }
}

export default function LiveStreamPage() {
  const { streamId } = useParams<{ streamId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    getStreamById, joinLive, leaveLive, sendLiveComment,
    sendLiveReaction, sendLiveGift, pinComment, toggleScreenShare,
    endLive, saveReplay
  } = useLiveStore();
  const { wallet, subscribeWallet } = useWalletStore();

  const [stream, setStream] = useState<LiveStream | null>(null);
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [duration, setDuration] = useState(0);
  const [chatInput, setChatInput] = useState('');
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [reactionBubbles, setReactionBubbles] = useState<Array<{ id: string; key: string; x: number; color: string }>>([]);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [pinnedComment, setPinnedComment] = useState<LiveComment | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [copied, setCopied] = useState(false);

  const chatRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const joinedAsViewer = useRef(false);

  const isBroadcaster = stream?.userId === user?.id;

  /* Responsive desktop check */
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  /* Fetch stream, join, subscribe wallet, start timers & polling */
  useEffect(() => {
    if (!streamId || !user?.id) return;
    let mounted = true;

    const init = async () => {
      setLoading(true);
      const s = await getStreamById(streamId);
      if (!mounted) return;
      if (s) {
        setStream(s);
        setComments(s.comments || []);
        setIsScreenSharing(s.isScreenSharing || false);
        if (s.pinnedComment) {
          const pinned = (s.comments || []).find((c) => c.id === s.pinnedComment);
          if (pinned) setPinnedComment(pinned);
        }
        if (s.userId !== user.id) {
          await joinLive(streamId, user.id);
          joinedAsViewer.current = true;
        }
      }
      setLoading(false);
    };

    init();

    const unsubWallet = subscribeWallet(user.id);

    pollRef.current = setInterval(async () => {
      const s = await getStreamById(streamId);
      if (!mounted || !s) return;
      setStream(s);
      setComments((prev) => {
        const serverIds = new Set(s.comments.map((c) => c.id));
        const localOnly = prev.filter((c) => !serverIds.has(c.id) && c.id.startsWith('temp_'));
        return [...s.comments, ...localOnly].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      });
      if (s.pinnedComment) {
        const pinned = (s.comments || []).find((c) => c.id === s.pinnedComment);
        if (pinned) setPinnedComment(pinned);
      } else {
        setPinnedComment(null);
      }
      setIsScreenSharing(s.isScreenSharing || false);

      // If stream ended, navigate back for viewers (not broadcaster)
      if (!s.isLive && s.userId !== user.id) {
        toast.info('Stream ended');
        navigate('/live-streams');
      }
    }, 5000);

    return () => {
      mounted = false;
      if (pollRef.current) clearInterval(pollRef.current);
      if (joinedAsViewer.current && streamId) {
        leaveLive(streamId, user.id);
      }
      unsubWallet();
    };
  }, [streamId, user?.id]);

  /* Duration based on stream start time */
  useEffect(() => {
    if (!stream) return;
    const start = stream.startedAt.getTime();
    const update = () => setDuration(Math.floor((Date.now() - start) / 1000));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [stream?.startedAt]);

  /* Auto-scroll chat to bottom */
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [comments]);

  const formatDuration = useCallback((secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h > 0 ? `${h}:` : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }, []);

  const handleSendComment = async () => {
    if (!chatInput.trim() || !streamId || !user?.id) return;
    const content = chatInput.trim();
    const tempId = `temp_${Date.now()}`;
    const newComment: LiveComment = {
      id: tempId,
      userId: user.id,
      content,
      timestamp: new Date(),
      userName: user.name || 'You',
      isPinned: false,
      isModerator: false,
    };
    setComments((prev) => [...prev, newComment]);
    setChatInput('');
    await sendLiveComment(streamId, user.id, content);
  };

  const handleReaction = async (key: keyof LiveReactions) => {
    if (!streamId) return;
    const config = REACTIONS.find((r) => r.key === key);
    const id = `${Date.now()}_${Math.random()}`;
    setReactionBubbles((prev) => [...prev, { id, key, x: Math.random() * 60 + 20, color: config?.color || '#00C300' }]);
    setTimeout(() => {
      setReactionBubbles((prev) => prev.filter((r) => r.id !== id));
    }, 2000);
    await sendLiveReaction(streamId, key);
  };

  const handleSendGift = async (type: 'rose' | 'heart' | 'star' | 'crown' | 'diamond' | 'rocket', cost: number) => {
    if (!streamId || !user?.id) return;
    if ((wallet?.coins || 0) < cost) {
      toast.error('Not enough coins');
      return;
    }
    const ok = await spendCoins(user.id, cost, `Sent ${type} gift in live stream`);
    if (!ok) {
      toast.error('Failed to spend coins');
      return;
    }
    await sendLiveGift(streamId, user.id, { type, amount: cost, currency: 'coins', userId: user.id });
    toast.success(`Sent ${type}!`);
    setShowGiftPanel(false);
  };

  const handlePin = async (commentId: string) => {
    if (!streamId) return;
    await pinComment(streamId, commentId);
    const target = comments.find((c) => c.id === commentId);
    if (target) setPinnedComment(target);
    toast.success('Comment pinned');
  };

  const handleToggleScreenShare = async () => {
    if (!streamId || !isBroadcaster) return;
    const next = !isScreenSharing;
    setIsScreenSharing(next);
    await toggleScreenShare(streamId, next);
  };

  const handleEndStream = async () => {
    if (!streamId || !isBroadcaster) return;
    if (!window.confirm('End your live stream?')) return;
    await endLive(streamId);
    await saveReplay(streamId, '');
    toast.success('Stream ended');
    navigate('/live-streams');
  };

  const handleLeave = async () => {
    if (!streamId || !user?.id) return;
    if (!isBroadcaster) {
      await leaveLive(streamId, user.id);
    }
    navigate('/live-streams');
  };

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      toast.success('Link copied');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) {
    return (
      <div className="h-[100dvh] bg-[#0d0d0d] text-white flex items-center justify-center">
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="flex flex-col items-center gap-3"
        >
          <div className="w-12 h-12 rounded-full bg-[#00C300]/20 flex items-center justify-center">
            <Radio size={24} className="text-[#00C300]" />
          </div>
          <p className="text-[#8D8D8D] text-sm">Loading stream...</p>
        </motion.div>
      </div>
    );
  }

  if (!stream) {
    return (
      <div className="h-[100dvh] bg-[#0d0d0d] text-white flex items-center justify-center">
        <div className="text-center px-6">
          <div className="w-16 h-16 rounded-full bg-[#1a1a1a] flex items-center justify-center mx-auto mb-4">
            <Video size={28} className="text-[#8D8D8D]" />
          </div>
          <p className="text-[#8D8D8D] mb-2">Stream not found or has ended</p>
          <button
            type="button"
            onClick={() => navigate('/live-streams')}
            className="px-5 py-2 bg-[#00C300] text-black rounded-full text-sm font-bold"
          >
            Back to Streams
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-[#0d0d0d] text-white flex flex-col md:flex-row overflow-hidden">
      {/* Video / Stream Placeholder Area */}
      <div className="relative flex-1 bg-black flex flex-col min-h-0">
        <div className="relative flex-1 flex items-center justify-center bg-gradient-to-br from-[#0d0d0d] to-[#1a1a1a]">
          <div className="text-center">
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <Video size={48} className="text-[#8D8D8D] mx-auto mb-3" />
            </motion.div>
            <p className="text-[#8D8D8D] text-sm font-medium">{isBroadcaster ? 'You are live' : 'Live Stream'}</p>
            {isScreenSharing && (
              <p className="text-[#00C300] text-xs mt-1 flex items-center justify-center gap-1">
                <Monitor size={12} /> Screen Sharing
              </p>
            )}
          </div>

          {/* Floating reaction bubbles */}
          <AnimatePresence>
            {reactionBubbles.map((bubble) => (
              <motion.div
                key={bubble.id}
                initial={{ opacity: 1, y: 0, scale: 1 }}
                animate={{ opacity: 0, y: -250, scale: 1.6 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2, ease: 'easeOut' }}
                className="absolute bottom-20 pointer-events-none"
                style={{ left: `${bubble.x}%` }}
              >
                <div style={{ color: bubble.color }}>
                  {REACTIONS.find((r) => r.key === bubble.key)?.icon}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Top overlay info */}
          <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <button type="button" onClick={handleLeave} className="p-2 rounded-full bg-black/40 backdrop-blur-sm shrink-0">
                  <ChevronLeft size={22} />
                </button>
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{stream.title}</p>
                  <p className="text-[10px] text-white/70 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-[#FF3B30] rounded-full animate-pulse" />
                    {stream.userName || 'Streamer'} • {formatDuration(duration)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full text-xs flex items-center gap-1">
                  <Users size={12} /> {stream.viewerCount || 0}
                </div>
                {isBroadcaster && (
                  <button
                    type="button"
                    onClick={handleToggleScreenShare}
                    className={`p-2 rounded-full backdrop-blur-sm ${isScreenSharing ? 'bg-[#00C300]/40 text-[#00C300]' : 'bg-black/40'}`}
                    title="Toggle screen share"
                  >
                    <Monitor size={18} />
                  </button>
                )}
                <button type="button" onClick={() => setShowShareSheet(true)} className="p-2 rounded-full bg-black/40 backdrop-blur-sm">
                  <Share2 size={18} />
                </button>
                {!isDesktop && (
                  <button type="button" onClick={() => setShowChat(true)} className="p-2 rounded-full bg-black/40 backdrop-blur-sm">
                    <MessageSquare size={18} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Bottom overlay controls */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
            {isBroadcaster ? (
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={handleEndStream}
                  className="px-5 py-2.5 bg-[#FF3B30] text-white rounded-full text-sm font-bold flex items-center gap-2 hover:bg-[#FF3B30]/90 transition-colors"
                >
                  <PhoneOff size={16} /> End Stream
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3">
                {REACTIONS.map((r) => (
                  <motion.button
                    key={r.key}
                    type="button"
                    whileTap={{ scale: 0.75 }}
                    onClick={() => handleReaction(r.key)}
                    className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center transition-colors hover:bg-black/60"
                    style={{ color: r.color }}
                    title={r.label}
                  >
                    {r.icon}
                  </motion.button>
                ))}
                <button
                  type="button"
                  onClick={() => setShowGiftPanel(true)}
                  className="w-10 h-10 rounded-full bg-[#FFD700]/20 text-[#FFD700] flex items-center justify-center hover:bg-[#FFD700]/30 transition-colors"
                  title="Send gift"
                >
                  <Gift size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat / Comments Panel */}
      <AnimatePresence>
        {(showChat || isDesktop) && (
          <motion.div
            initial={isDesktop ? false : { opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-40 bg-[#0d0d0d] md:static md:w-96 md:border-l md:border-[#2a2a2a] flex flex-col"
          >
            {/* Chat header */}
            <div className="shrink-0 px-4 py-3 border-b border-[#2a2a2a] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-[#00C300]" />
                <h2 className="text-sm font-bold">Live Chat</h2>
                <span className="text-[10px] text-[#8D8D8D] bg-[#1a1a1a] px-2 py-0.5 rounded-full">{comments.length}</span>
              </div>
              <button type="button" onClick={() => setShowChat(false)} className="md:hidden p-1">
                <X size={18} className="text-[#8D8D8D]" />
              </button>
            </div>

            {/* Viewer list */}
            <div className="shrink-0 px-4 py-2 border-b border-[#2a2a2a] flex items-center gap-2 overflow-x-auto scrollbar-hide">
              <span className="text-[10px] text-[#8D8D8D] whitespace-nowrap">Viewers:</span>
              {(stream.viewers || []).slice(0, 15).map((viewerId) => (
                <img
                  key={viewerId}
                  src={getDefaultAvatar(viewerId)}
                  alt="Viewer"
                  className="w-6 h-6 rounded-full object-cover shrink-0 border border-[#2a2a2a]"
                />
              ))}
              {(stream.viewers || []).length > 15 && (
                <span className="text-[10px] text-[#8D8D8D] shrink-0">+{(stream.viewers || []).length - 15}</span>
              )}
            </div>

            {/* Pinned comment */}
            <AnimatePresence>
              {pinnedComment && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="shrink-0 mx-3 mt-2 p-2 bg-[#00C300]/10 border border-[#00C300]/30 rounded-lg flex items-start gap-2"
                >
                  <Pin size={12} className="text-[#00C300] shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-[#00C300] font-medium">{pinnedComment.userName || 'User'}</p>
                    <p className="text-xs text-white truncate">{pinnedComment.content}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Comments */}
            <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
              {comments.length === 0 ? (
                <p className="text-center text-[#8D8D8D] text-xs py-8">No comments yet. Say hello!</p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="flex gap-2 group">
                    <img
                      src={getDefaultAvatar(comment.userId)}
                      alt="User"
                      className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] font-medium text-[#8D8D8D]">{comment.userName || 'User'}</span>
                        {comment.isModerator && (
                          <span className="text-[8px] bg-[#00C300]/20 text-[#00C300] px-1 rounded">MOD</span>
                        )}
                        {isBroadcaster && (
                          <button
                            type="button"
                            onClick={() => handlePin(comment.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Pin comment"
                          >
                            <Pin size={10} className="text-[#8D8D8D]" />
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-white break-words">{comment.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Chat input */}
            <div className="shrink-0 p-3 border-t border-[#2a2a2a] flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendComment()}
                placeholder="Say something..."
                className="flex-1 bg-[#1a1a1a] rounded-full px-4 py-2 text-xs text-white placeholder:text-[#8D8D8D] outline-none focus:ring-2 focus:ring-[#00C300]/30"
              />
              <button
                type="button"
                onClick={handleSendComment}
                disabled={!chatInput.trim()}
                className="p-2 rounded-full bg-[#00C300] text-black disabled:opacity-50 hover:bg-[#00A300] transition-colors"
              >
                <Send size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gift Panel */}
      <AnimatePresence>
        {showGiftPanel && (
          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-[#1a1a1a] border-t border-[#2a2a2a] rounded-t-2xl p-4 max-h-[50vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold">Send a Gift</h3>
              <div className="flex items-center gap-3">
                <div className="text-xs text-[#8D8D8D] flex items-center gap-1">
                  <Zap size={12} className="text-[#FFD700]" />
                  {wallet?.coins || 0} coins
                </div>
                <button type="button" onClick={() => setShowGiftPanel(false)}>
                  <X size={18} className="text-[#8D8D8D]" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {GIFT_CONFIG.map((gift) => (
                <button
                  key={gift.type}
                  type="button"
                  onClick={() => handleSendGift(gift.type, gift.cost)}
                  disabled={(wallet?.coins || 0) < gift.cost}
                  className="flex flex-col items-center gap-1 p-3 rounded-xl bg-[#2a2a2a] hover:bg-[#333] transition-colors disabled:opacity-40"
                >
                  {gift.icon}
                  <span className="text-xs text-white font-medium">{gift.label}</span>
                  <span className="text-[10px] text-[#FFD700] flex items-center gap-0.5">
                    <Zap size={10} /> {gift.cost}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share Sheet */}
      <AnimatePresence>
        {showShareSheet && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center"
            onClick={() => setShowShareSheet(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-[#1a1a1a] rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-sm border border-[#2a2a2a]"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-bold mb-4">Share Stream</h3>
              <button
                type="button"
                onClick={handleCopyLink}
                className="w-full py-3 bg-[#2a2a2a] rounded-xl text-sm text-white hover:bg-[#333] transition-colors flex items-center justify-center gap-2"
              >
                {copied ? <Check size={16} className="text-[#00C300]" /> : <Copy size={16} />}
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
