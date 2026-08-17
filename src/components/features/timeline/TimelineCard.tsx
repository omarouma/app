import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart, MessageCircle, Share2, Bookmark, Trash2, Edit3,
  MoreHorizontal, Sparkles, Flag, ChevronDown, ChevronUp,
  ThumbsUp, Send, BadgeCheck, Eye,
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { isFirestoreAvailable, COLLECTIONS, updateDocById } from '@/lib/firestore';
import { formatTime, getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
import type { TimelinePost, PostComment } from '@/types';
import { findYouTubeIds } from '@/services/youtubeService';
import YouTubeEmbed from '@/components/features/feed/YouTubeEmbed';

interface TimelineCardProps {
  post: TimelinePost;
  index: number;
  onDelete?: (postId: string) => void;
  onEdit?: (post: TimelinePost) => void;
  onShare?: (post: TimelinePost) => void;
  onImageClick?: (img: string) => void;
  onTip?: (post: TimelinePost) => void;
  onReport?: (post: TimelinePost) => void;
  userName?: string;
  userAvatar?: string;
}

const REACTIONS = [
  { emoji: '❤️', label: 'Love' },
  { emoji: '😂', label: 'Haha' },
  { emoji: '😮', label: 'Wow' },
  { emoji: '😢', label: 'Sad' },
  { emoji: '😡', label: 'Angry' },
  { emoji: '👏', label: 'Clap' },
];

/** Determine whether a media URL points to a video, based on URL/extension heuristics. */
function isVideoUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  const clean = url.split('?')[0].toLowerCase();
  if (/\.(mp4|webm|mov|m4v|ogg|ogv|avi|mkv|3gp)(#|$)/.test(clean)) return true;
  if (clean.includes('video')) return true;
  return false;
}

/** Resolve the effective video URL for a post (explicit videoUrl, mediaType, or video image entry). */
function getPostVideoUrl(post: TimelinePost): string | undefined {
  if (post.videoUrl) return post.videoUrl;
  if (post.mediaType === 'video') {
    return (post.images && post.images[0]) || undefined;
  }
  const vid = (post.images || []).find((img) => isVideoUrl(img));
  return vid;
}

export default function TimelineCard({
  post, index, onDelete, onEdit, onShare, onImageClick, onTip, onReport, userName, userAvatar,
}: TimelineCardProps) {
  const { user: currentUser } = useAuthStore();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [localLikes, setLocalLikes] = useState<string[]>(post.likes || []);
  const [localComments, setLocalComments] = useState<PostComment[]>(post.comments || []);
  const [isSaved, setIsSaved] = useState(currentUser?.savedPosts?.includes(post.id));
  const [showMenu, setShowMenu] = useState(false);
  const [showHeartAnim, setShowHeartAnim] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [likedCommentIds, setLikedCommentIds] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const lastTap = useRef<number>(0);
  const likeHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLiked = currentUser ? localLikes.includes(currentUser.id) : false;

  const handleLike = async () => {
    if (!currentUser) return;
    const prev = [...localLikes];
    const next = isLiked
      ? localLikes.filter(id => id !== currentUser.id)
      : [...localLikes, currentUser.id];
    setLocalLikes(next);
    try {
      if (isFirestoreAvailable()) await updateDocById(COLLECTIONS.POSTS, post.id, { likes: next });
    } catch {
      setLocalLikes(prev);
      toast.error('Failed to update like');
    }
  };

  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (!isLiked && currentUser) {
        handleLike();
        setShowHeartAnim(true);
        setTimeout(() => setShowHeartAnim(false), 800);
      }
    }
    lastTap.current = now;
  };

  const handleReaction = async (emoji: string) => {
    setMyReaction(prev => prev === emoji ? null : emoji);
    setShowReactions(false);
    if (!isLiked && currentUser) await handleLike();
  };

  const handleComment = async () => {
    if (!currentUser || !commentText.trim()) return;
    const comment: PostComment = {
      id: `c_${Date.now()}`,
      userId: currentUser.id,
      content: commentText.trim(),
      timestamp: new Date(),
      likes: [],
    };
    setCommentText('');
    const next = [...localComments, comment];
    setLocalComments(next);
    if (!isFirestoreAvailable()) return;
    try { await updateDocById(COLLECTIONS.POSTS, post.id, { comments: next }); } catch { /* keep local */ }
  };

  const handleCommentLike = (id: string) => {
    const next = new Set(likedCommentIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setLikedCommentIds(next);
  };

  const handleCommentDelete = async (id: string) => {
    const next = localComments.filter(c => c.id !== id);
    setLocalComments(next);
    if (isFirestoreAvailable()) {
      try { await updateDocById(COLLECTIONS.POSTS, post.id, { comments: next }); } catch { /* keep local */ }
    }
  };

  const handleSave = async () => {
    if (!currentUser) return;
    const prev = isSaved;
    const next = isSaved
      ? (currentUser.savedPosts || []).filter(id => id !== post.id)
      : [...(currentUser.savedPosts || []), post.id];
    setIsSaved(!isSaved);
    try {
      if (isFirestoreAvailable()) await updateDocById(COLLECTIONS.USERS, currentUser.id, { savedPosts: next });
    } catch {
      setIsSaved(prev);
      toast.error('Failed to save post');
    }
  };

  const handlePollVote = async (optionIndex: number) => {
    if (!currentUser || !post.pollData) return;
    const nextOptions = post.pollData.options.map((opt, i) => ({
      ...opt,
      votes: i === optionIndex
        ? [...(opt.votes || []), currentUser.id]
        : (opt.votes || []).filter((id: string) => id !== currentUser.id),
    }));
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTIONS.POSTS, post.id, { pollData: { ...post.pollData, options: nextOptions } });
      toast.success('Vote recorded');
    } catch { toast.error('Failed to vote'); }
  };

  const renderContent = (text: string) => {
    const youtubePattern = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11}|youtu\.be\/[a-zA-Z0-9_-]{11}|youtube\.com\/shorts\/[a-zA-Z0-9_-]{11})/gi;
    const clean = text.replace(youtubePattern, '').replace(/\s{2,}/g, ' ').trim();
    const MAX = 180;
    const display = !expanded && clean.length > MAX ? clean.slice(0, MAX) + '…' : clean;
    return (
      <>
        <span>
          {display.split(/(\s+)/).map((word, i) => {
            if (word.startsWith('#')) return <span key={i} className="text-[#00C300] cursor-pointer hover:underline">{word}</span>;
            if (word.startsWith('@')) return <span key={i} className="text-[#2196F3] cursor-pointer hover:underline">{word}</span>;
            return word;
          })}
        </span>
        {clean.length > MAX && (
          <button type="button" onClick={() => setExpanded(v => !v)}
            className="ml-1 text-muted-foreground text-xs font-medium inline-flex items-center gap-0.5">
            {expanded ? <><ChevronUp size={12} /> less</> : <><ChevronDown size={12} /> more</>}
          </button>
        )}
      </>
    );
  };

  const totalVotes = post.pollData?.options.reduce((s, o) => s + (o.votes?.length || 0), 0) || 0;
  const hasVoted = post.pollData?.options.some(o => currentUser?.id && o.votes?.includes(currentUser.id));
  const youtubeIds = findYouTubeIds(post.content || '');
  const images = post.images || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.25), duration: 0.3 }}
      className="bg-card border-b border-border relative overflow-hidden"
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <div className="relative shrink-0">
          <div className="w-11 h-11 rounded-full overflow-hidden ring-2 ring-primary/40">
            <img
              src={sanitizeMediaUrl(userAvatar || post.userAvatar) || getDefaultAvatar(post.userId || 'U')}
              className="w-full h-full object-cover"
              alt="avatar"
            />
          </div>
          {/* Online dot */}
          <span className="absolute bottom-0 right-0 w-3 h-3 bg-primary rounded-full border-2 border-card" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-foreground font-semibold text-[14px] truncate">{userName || post.userName || 'User'}</p>
            {post.userId === currentUser?.id && (
              <BadgeCheck size={14} className="text-primary shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-muted-foreground text-[11px]">{formatTime(post.timestamp)}</p>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${post.visibility === 'public' ? 'text-primary bg-primary/10' :
              post.visibility === 'friends' ? 'text-[#2196F3] bg-[#2196F3]/10' :
                'text-muted-foreground bg-muted'
              }`}>
              {post.visibility === 'public' ? '🌍 Public' : post.visibility === 'friends' ? '👥 Friends' : '🔒 Only Me'}
            </span>
          </div>
        </div>
        {/* Menu */}
        <div className="relative">
          <button type="button" onClick={() => setShowMenu(v => !v)}
            className="p-2 rounded-full hover:bg-foreground/5 text-muted-foreground hover:text-foreground transition-colors">
            <MoreHorizontal size={18} />
          </button>
          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -4 }}
                className="absolute right-0 top-10 bg-popover border border-border rounded-2xl shadow-2xl py-1.5 z-30 w-36 overflow-hidden"
              >
                {post.userId === currentUser?.id ? (
                  <>
                    <button type="button" onClick={() => { onEdit?.(post); setShowMenu(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-popover-foreground hover:bg-foreground/5 transition-colors">
                      <Edit3 size={14} className="text-primary" /> Edit
                    </button>
                    <button type="button" onClick={() => { onDelete?.(post.id); setShowMenu(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors">
                      <Trash2 size={14} /> Delete
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => { onReport?.(post); setShowMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors">
                    <Flag size={14} /> Report
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Content ── */}
      {post.content && (
        <div className="px-4 pb-3 text-foreground/90 text-[14px] leading-relaxed" onClick={handleDoubleTap}>
          {renderContent(post.content)}
        </div>
      )}

      {/* ── Poll ── */}
      {post.pollData && (
        <div className="mx-4 mb-3 bg-muted rounded-2xl p-4 border border-border space-y-2.5">
          <p className="text-foreground text-sm font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            {post.pollData.question}
          </p>
          {post.pollData.options.map((opt, i) => {
            const votes = opt.votes?.length || 0;
            const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
            const isVoted = currentUser?.id && opt.votes?.includes(currentUser.id);
            return (
              <button type="button" key={i} onClick={() => handlePollVote(i)}
                disabled={!!(hasVoted && !isVoted)}
                className={`w-full relative rounded-xl overflow-hidden transition-all ${isVoted ? 'border-2 border-primary' : 'border border-border hover:border-primary/50'
                  } ${hasVoted && !isVoted ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-transparent transition-all duration-500"
                  style={{ width: `${pct}%` }} />
                <div className="relative px-4 py-2.5 flex items-center justify-between">
                  <span className="text-sm text-foreground font-medium">{opt.text}</span>
                  <span className="text-xs font-bold text-primary">{pct}%</span>
                </div>
              </button>
            );
          })}
          <p className="text-muted-foreground text-[11px] text-right">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</p>
        </div>
      )}

      {/* ── YouTube embeds ── */}
      {youtubeIds.length > 0 && (
        <div className="space-y-2 px-4 pb-3">
          {youtubeIds.map(id => <YouTubeEmbed key={id} videoId={id} />)}
        </div>
      )}

      {/* ── Media: video post vs image grid ── */}
      {(() => {
        const videoUrl = getPostVideoUrl(post);
        if (videoUrl) {
          return (
            <div className="relative" onClick={handleDoubleTap}>
              <video
                key={videoUrl}
                src={videoUrl}
                className="w-full bg-black"
                controls
                playsInline
                preload="metadata"
                poster={post.mediaType !== 'video' ? images[0] : undefined}
              />
            </div>
          );
        }
        if (images.length === 0) return null;
        return (
          <div className="relative" onClick={handleDoubleTap}>
            {images.length === 1 ? (
              <img src={images[0]} alt="Post" className="w-full max-h-[480px] object-cover cursor-pointer"
                onClick={() => onImageClick?.(images[0])} />
            ) : (
              <>
                <div className={`grid gap-0.5 ${images.length === 2 ? 'grid-cols-2' : images.length === 3 ? 'grid-cols-2' : 'grid-cols-2'}`}>
                  {images.slice(0, 4).map((img, i) => (
                    <div key={i} className={`overflow-hidden relative ${images.length === 3 && i === 0 ? 'col-span-2' : ''}`}>
                      <img src={img} alt={`Post image ${i + 1}`}
                        className={`w-full object-cover cursor-pointer hover:brightness-90 transition-all ${images.length === 3 && i === 0 ? 'h-52' : 'h-44'
                          }`}
                        onClick={() => { setActiveImage(i); onImageClick?.(img); }}
                      />
                      {i === 3 && images.length > 4 && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center cursor-pointer"
                          onClick={() => onImageClick?.(img)}>
                          <span className="text-white text-2xl font-bold">+{images.length - 4}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {images.length > 1 && (
                  <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full">
                    {activeImage + 1}/{images.length}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* ── Double-tap heart ── */}
      <AnimatePresence>
        {showHeartAnim && (
          <motion.div initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1.5 }} exit={{ opacity: 0, scale: 2 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <Heart size={80} className="text-[#FF3B30] fill-current drop-shadow-2xl" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Engagement stats ── */}
      {(localLikes.length > 0 || localComments.length > 0) && (
        <div className="flex items-center justify-between px-4 py-2 text-muted-foreground text-xs">
          <div className="flex items-center gap-1.5">
            {localLikes.length > 0 && (
              <span className="flex items-center gap-1">
                <span className="text-sm">{myReaction || '❤️'}</span>
                <span className="text-muted-foreground">{localLikes.length.toLocaleString()}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {localComments.length > 0 && (
              <button type="button" onClick={() => setShowComments(v => !v)}
                className="hover:text-foreground transition-colors">
                {localComments.length} comment{localComments.length !== 1 ? 's' : ''}
              </button>
            )}
            {(post.shares?.length || 0) > 0 && (
              <span className="flex items-center gap-1">
                <Share2 size={11} /> {(post.shares?.length || 0).toLocaleString()}
              </span>
            )}
            {(post as TimelinePost & { viewCount?: number }).viewCount ? (
              <span className="flex items-center gap-1">
                <Eye size={11} /> {((post as TimelinePost & { viewCount?: number }).viewCount || 0).toLocaleString()}
              </span>
            ) : null}
          </div>
        </div>
      )}

      {/* ── Action bar ── */}
      <div className="flex items-center border-t border-border px-1">
        {/* Like with hold-for-reactions */}
        <div className="relative flex-1">
          <button
            type="button"
            className={`w-full flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-medium transition-colors ${isLiked ? 'text-destructive' : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
              }`}
            onClick={handleLike}
            onMouseEnter={() => { likeHoldTimer.current = setTimeout(() => setShowReactions(true), 400); }}
            onMouseLeave={() => { if (likeHoldTimer.current) clearTimeout(likeHoldTimer.current); }}
            onTouchStart={() => { likeHoldTimer.current = setTimeout(() => setShowReactions(true), 500); }}
            onTouchEnd={() => { if (likeHoldTimer.current) clearTimeout(likeHoldTimer.current); }}
          >
            <Heart size={19} className={isLiked ? 'fill-current' : ''} />
            <span className="text-xs">{isLiked ? 'Liked' : 'Like'}</span>
          </button>
          {/* Reactions picker */}
          <AnimatePresence>
            {showReactions && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.9 }}
                className="absolute bottom-14 left-0 bg-popover border border-border rounded-2xl px-3 py-2 flex gap-2 shadow-2xl z-30"
                onMouseLeave={() => setShowReactions(false)}
              >
                {REACTIONS.map(r => (
                  <button key={r.emoji} type="button" onClick={() => handleReaction(r.emoji)}
                    className="text-2xl hover:scale-125 transition-transform" title={r.label}>
                    {r.emoji}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button type="button" onClick={() => setShowComments(v => !v)}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors text-sm font-medium">
          <MessageCircle size={19} />
          <span className="text-xs">Comment</span>
        </button>

        <button type="button" onClick={() => onShare?.(post)}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors text-sm font-medium">
          <Share2 size={19} />
          <span className="text-xs">Share</span>
        </button>

        <button type="button" onClick={() => onTip?.(post)}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-muted-foreground hover:text-[#FFD700] hover:bg-[#FFD700]/5 transition-colors text-sm font-medium">
          <Sparkles size={17} />
          <span className="text-xs">Tip</span>
        </button>

        <button type="button" onClick={handleSave}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl transition-colors text-sm font-medium ${isSaved ? 'text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
            }`}>
          <Bookmark size={19} className={isSaved ? 'fill-current' : ''} />
          <span className="text-xs">{isSaved ? 'Saved' : 'Save'}</span>
        </button>
      </div>

      {/* ── Comments ── */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border"
          >
            <div className="px-4 py-3 space-y-3 max-h-64 overflow-y-auto">
              {localComments.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">No comments yet. Be the first!</p>
              ) : (
                localComments.map(comment => {
                  const isCommentLiked = likedCommentIds.has(comment.id);
                  const isOwn = comment.userId === currentUser?.id;
                  return (
                    <div key={comment.id} className="flex gap-2.5">
                      <img
                        src={sanitizeMediaUrl((comment as PostComment & { userAvatar?: string }).userAvatar) || getDefaultAvatar(comment.userId || 'U')}
                        className="w-8 h-8 rounded-full object-cover shrink-0"
                        alt="avatar"
                      />
                      <div className="flex-1 bg-muted rounded-2xl px-3 py-2">
                        <p className="text-foreground text-xs font-semibold mb-0.5">
                          {(comment as PostComment & { userName?: string }).userName || 'User'}
                        </p>
                        <p className="text-foreground/80 text-sm leading-snug">{comment.content}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-muted-foreground text-[10px]">{formatTime(comment.timestamp)}</span>
                          <button type="button" onClick={() => handleCommentLike(comment.id)}
                            className={`text-[10px] flex items-center gap-0.5 font-medium transition-colors ${isCommentLiked ? 'text-destructive' : 'text-muted-foreground hover:text-foreground'
                              }`}>
                            <ThumbsUp size={10} /> Like
                          </button>
                          {isOwn && (
                            <button type="button" onClick={() => handleCommentDelete(comment.id)}
                              className="text-[10px] text-destructive font-medium hover:text-red-400 transition-colors">
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {/* Comment input */}
            <div className="flex gap-2 px-4 pb-3">
              <img
                src={sanitizeMediaUrl(currentUser?.avatar) || getDefaultAvatar(currentUser?.id || 'me')}
                className="w-8 h-8 rounded-full object-cover shrink-0"
                alt="me"
              />
              <div className="flex-1 flex items-center gap-2 bg-muted rounded-full px-4 py-2 border border-border focus-within:border-primary/50 transition-colors">
                <input
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleComment()}
                  placeholder="Write a comment…"
                  className="flex-1 bg-transparent text-foreground text-sm placeholder:text-muted-foreground focus:outline-none"
                />
                {commentText.trim() && (
                  <button type="button" onClick={handleComment}
                    className="text-primary shrink-0 hover:text-primary/80 transition-colors">
                    <Send size={16} />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
