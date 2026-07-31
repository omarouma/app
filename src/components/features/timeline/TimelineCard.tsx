import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, MessageCircle, Share2, Bookmark, Trash2, Edit3, ThumbsUp, MoreHorizontal, Sparkles, Flag } from 'lucide-react';
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

const visibilityLabels: Record<string, { text: string; color: string }> = {
  public: { text: 'Public', color: 'text-[#00C300] bg-[#00C300]/10' },
  friends: { text: 'Friends', color: 'text-[#2196F3] bg-[#2196F3]/10' },
  private: { text: 'Only Me', color: 'text-[#8D8D8D] bg-[#F5F5F5]' },
};

export default function TimelineCard({ post, index, onDelete, onEdit, onShare, onImageClick, onTip, onReport, userName, userAvatar }: TimelineCardProps) {
  const { user: currentUser } = useAuthStore();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [localLikes, setLocalLikes] = useState<string[]>(post.likes || []);
  const [localComments, setLocalComments] = useState<PostComment[]>(post.comments || []);
  const [localShares] = useState<number>(post.shares?.length || 0);
  const [isSaved, setIsSaved] = useState(currentUser?.savedPosts?.includes(post.id));
  const [showMenu, setShowMenu] = useState(false);
  const [showHeartAnim, setShowHeartAnim] = useState(false);
  const [likedCommentIds, setLikedCommentIds] = useState<Set<string>>(new Set());
  const isLiked = currentUser ? localLikes.includes(currentUser.id) : false;
  const lastTap = useRef<number>(0);

  const handleLike = async () => {
    if (!currentUser) return;
    const prevLikes = [...localLikes];
    const nextLikes = isLiked
      ? localLikes.filter(id => id !== currentUser.id)
      : [...localLikes, currentUser.id];
    // Optimistic update
    setLocalLikes(nextLikes);
    // Rollback on failure
    try {
      if (isFirestoreAvailable()) {
        await updateDocById(COLLECTIONS.POSTS, post.id, { likes: nextLikes });
      }
    } catch {
      setLocalLikes(prevLikes);
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
    const newComments = [...localComments, comment];
    setLocalComments(newComments);
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTIONS.POSTS, post.id, { comments: newComments });
    } catch {
      // keep local
    }
  };

  const handleCommentLike = (commentId: string) => {
    if (!currentUser) return;
    const next = new Set(likedCommentIds);
    if (next.has(commentId)) next.delete(commentId);
    else next.add(commentId);
    setLikedCommentIds(next);
  };

  const handleCommentDelete = async (commentId: string) => {
    const next = localComments.filter(c => c.id !== commentId);
    setLocalComments(next);
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTIONS.POSTS, post.id, { comments: next });
    } catch {
      // Optionally rollback local state
    }
  };

  const handleShare = () => {
    onShare?.(post);
  };

  const handleSave = async () => {
    if (!currentUser) return;
    const prevSaved = isSaved;
    const nextSaved = isSaved
      ? (currentUser.savedPosts || []).filter(id => id !== post.id)
      : [...(currentUser.savedPosts || []), post.id];
    // Optimistic update
    setIsSaved(!isSaved);
    // Rollback on failure
    try {
      if (isFirestoreAvailable()) {
        await updateDocById(COLLECTIONS.USERS, currentUser.id, { savedPosts: nextSaved });
      }
    } catch {
      setIsSaved(prevSaved);
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
    const nextPoll = { ...post.pollData, options: nextOptions };
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTIONS.POSTS, post.id, { pollData: nextPoll });
      toast.success('Vote recorded');
    } catch {
      toast.error('Failed to vote');
    }
  };

  const renderHashtags = (text: string) => {    // If there are YouTube links, we'll show them as embeds below, so filter them out of the text
    let cleanText = text;
    const youtubePattern = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11}|youtu\.be\/[a-zA-Z0-9_-]{11}|youtube\.com\/embed\/[a-zA-Z0-9_-]{11}|youtube\.com\/shorts\/[a-zA-Z0-9_-]{11})/gi;
    cleanText = cleanText.replace(youtubePattern, '');
    cleanText = cleanText.replace(/\s{2,}/g, ' ').trim();
    
    return cleanText.split(/(\s+)/).map((word, i) => {
      if (word.startsWith('#')) {
        return <span key={i} className="text-[#00C300] cursor-pointer hover:underline">{word}</span>;
      }
      if (word.startsWith('@')) {
        return <span key={i} className="text-[#2196F3] cursor-pointer hover:underline">{word}</span>;
      }
      return word;
    });
  };

  const vis = visibilityLabels[post.visibility] || visibilityLabels.public;
  const totalVotes = post.pollData?.options.reduce((sum, o) => sum + (o.votes?.length || 0), 0) || 0;
  const hasVoted = post.pollData?.options.some(o => currentUser?.id && o.votes?.includes(currentUser.id));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.3) }}
      className="bg-white border-b border-[#EBEBEB] space-y-3 relative"
    >
      {/* Author */}
      <div className="flex items-center gap-3 px-4 pt-4">
        <div className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center overflow-hidden shrink-0">
          {sanitizeMediaUrl(userAvatar || post.userAvatar) ? <img src={sanitizeMediaUrl(userAvatar || post.userAvatar)} className="w-full h-full object-cover" alt="User avatar" /> : <img src={getDefaultAvatar(post.userId || userName || 'U')} className="w-full h-full object-cover" alt="User avatar" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[#111111] font-semibold text-[15px]">{userName || post.userName || 'User'}</p>
          <div className="flex items-center gap-1.5">
            <p className="text-[#8D8D8D] text-xs">{formatTime(post.timestamp)}</p>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${vis.color}`}>{vis.text}</span>
          </div>
        </div>
        {/* Post menu - show for all posts */}
        <div className="relative">
          <button type="button" onClick={() => setShowMenu(!showMenu)} className="text-[#C7C7CC] hover:text-[#111111] p-1">
            <MoreHorizontal size={18} />
          </button>
          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute right-0 top-8 bg-white rounded-xl shadow-lg border border-[#EBEBEB] py-1 z-20 w-32"
              >
                {post.userId === currentUser?.id ? (
                  <>
                    <button type="button" onClick={() => { onEdit?.(post); setShowMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#111111] hover:bg-[#F5F5F5]"
                    >
                      <Edit3 size={14} /> Edit
                    </button>
                    <button type="button" onClick={() => { onDelete?.(post.id); setShowMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#FF3B30] hover:bg-[#FF3B30]/10"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => { onReport?.(post); setShowMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#FF3B30] hover:bg-[#FF3B30]/10"
                    >
                      <Flag size={14} /> Report
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Content */}
      {post.content && (
        <p className="text-[#111111] text-[15px] leading-relaxed whitespace-pre-wrap px-4" onClick={handleDoubleTap}>
          {renderHashtags(post.content)}
        </p>
      )}

      {/* Poll */}
      {post.pollData && (
        <div className="bg-gradient-to-br from-[#F5F5F5] to-white rounded-xl p-4 space-y-3 border border-[#EBEBEB] mx-4">
          <p className="text-sm font-semibold text-[#111111] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#00C300] animate-pulse"></span>
            {post.pollData.question}
          </p>
          {post.pollData.options.map((opt, i) => {
            const votes = opt.votes?.length || 0;
            const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
            const isVoted = currentUser?.id && opt.votes?.includes(currentUser.id);
            return (
              <button type="button" key={i}
                onClick={() => handlePollVote(i)}
                disabled={hasVoted && !isVoted}
                className={`w-full relative rounded-lg overflow-hidden transition-all duration-300 ${isVoted ? 'bg-[#00C300]/10 border-2 border-[#00C300]' : 'bg-white border-2 border-transparent hover:border-[#00C300]/50'} ${hasVoted && !isVoted ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div
                  className="absolute top-0 left-0 h-full bg-gradient-to-r from-[#00C300]/20 to-[#00C300]/40 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
                <div className="relative px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-[#111111]">{opt.text}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#00C300]">{pct}%</span>
                    <span className="text-xs text-[#8D8D8D] bg-[#F5F5F5] px-2 py-1 rounded-full">{votes}</span>
                  </div>
                </div>
              </button>
            );
          })}
          <div className="flex items-center justify-between text-[10px] text-[#8D8D8D]">
            <span>{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</span>
            <span>Vote to see results</span>
          </div>
        </div>
      )}

      {/* YouTube embeds */}
      {(() => {
        const ids = findYouTubeIds(post.content || '');
        if (ids.length === 0) return null;
        return (
          <div className="space-y-2 px-4">
            {ids.map(id => (
              <YouTubeEmbed key={id} videoId={id} />
            ))}
          </div>
        );
      })()}

      {/* Images */}
      {post.images && post.images.length > 0 && (
        <div className={`gap-0.5 ${
          post.images.length === 1 ? 'block' :
          post.images.length === 2 ? 'grid grid-cols-2' :
          post.images.length === 3 ? 'grid grid-cols-2' :
          'grid grid-cols-2'
        }`}>
          {post.images.map((img, i) => (
            <div
              key={i}
              className={`overflow-hidden ${
                post.images.length === 1 ? 'w-full' :
                post.images.length === 3 && i === 0 ? 'col-span-2' : ''
              }`}
            >
              <img
                src={img}
                alt="Post image"
                className={`w-full object-cover cursor-pointer hover:opacity-95 transition-opacity ${
                  post.images.length === 1 ? 'max-h-[400px]' : 'h-48'
                }`}
                onClick={() => onImageClick?.(img)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Double-tap heart animation */}
      <AnimatePresence>
        {showHeartAnim && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1.5 }}
            exit={{ opacity: 0, scale: 2 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
          >
            <Heart size={80} className="text-[#FF3B30] fill-current drop-shadow-lg" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Engagement Stats */}
      {(localLikes.length > 0 || localComments.length > 0 || localShares > 0) && (
        <div className="flex items-center gap-3 text-xs text-[#8D8D8D] px-4">
          {localLikes.length > 0 && (
            <span className="flex items-center gap-1">
              <Heart size={11} className="fill-[#FF3B30] text-[#FF3B30]" />
              {localLikes.length}
            </span>
          )}
          {localComments.length > 0 && <span>{localComments.length} comment{localComments.length !== 1 ? 's' : ''}</span>}
          {localShares > 0 && <span>{localShares} share{localShares !== 1 ? 's' : ''}</span>}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 px-2 py-1 border-t border-[#EBEBEB]">
        <button type="button" onClick={handleLike}
          className={`flex items-center gap-1.5 flex-1 justify-center py-2 rounded-xl transition-colors text-sm font-medium ${
            isLiked ? 'text-[#FF3B30]' : 'text-[#8D8D8D] hover:bg-[#F5F5F5]'
          }`}
        >
          <Heart size={18} className={isLiked ? 'fill-current' : ''} />
          <span className="text-xs">{isLiked ? 'Liked' : 'Like'}</span>
        </button>
        <button type="button" onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-1.5 flex-1 justify-center py-2 rounded-xl text-[#8D8D8D] hover:bg-[#F5F5F5] transition-colors"
        >
          <MessageCircle size={18} />
          <span className="text-xs">Comment</span>
        </button>
        <button type="button" onClick={handleShare}
          className="flex items-center gap-1.5 flex-1 justify-center py-2 rounded-xl text-[#8D8D8D] hover:bg-[#F5F5F5] transition-colors"
        >
          <Share2 size={18} />
          <span className="text-xs">Share</span>
        </button>
        <button type="button" onClick={() => onTip?.(post)}
          className="flex items-center gap-1.5 flex-1 justify-center py-2 rounded-xl text-[#8D8D8D] hover:text-[#FFD700] hover:bg-[#FFF9E6] transition-colors"
          title="Tip creator"
        >
          <Sparkles size={16} />
          <span className="text-xs">Tip</span>
        </button>
        <button type="button" onClick={handleSave}
          className={`flex items-center gap-1.5 flex-1 justify-center py-2 rounded-xl transition-colors ${
            isSaved ? 'text-[#00C300]' : 'text-[#8D8D8D] hover:bg-[#F5F5F5]'
          }`}
        >
          <Bookmark size={18} className={isSaved ? 'fill-current' : ''} />
          <span className="text-xs">{isSaved ? 'Saved' : 'Save'}</span>
        </button>
      </div>

      {/* Comments */}
      <AnimatePresence>
        {showComments && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="space-y-2 px-4 pb-3">
            {localComments.map((comment) => {
              const isCommentLiked = likedCommentIds.has(comment.id);
              const isOwnComment = comment.userId === currentUser?.id;
              return (
                <div key={comment.id} className="flex gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center shrink-0 overflow-hidden">
                    {sanitizeMediaUrl((comment as PostComment & { userAvatar?: string }).userAvatar) ? (
                      <img src={sanitizeMediaUrl((comment as PostComment & { userAvatar?: string }).userAvatar)} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <img src={getDefaultAvatar(comment.userId || 'U')} className="w-full h-full object-cover" alt="" />
                    )}
                  </div>
                  <div className="bg-[#F5F5F5] rounded-2xl px-3 py-2 flex-1">
                    <p className="text-[#111111] text-xs font-semibold mb-0.5">
                      {(comment as PostComment & { userName?: string }).userName || 'User'}
                    </p>
                    <p className="text-[#111111] text-sm">{comment.content}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-[#C7C7CC] text-[10px]">{formatTime(comment.timestamp)}</p>
                      <button type="button" onClick={() => handleCommentLike(comment.id)}
                        className={`text-[10px] flex items-center gap-0.5 font-medium ${
                          isCommentLiked ? 'text-[#FF3B30]' : 'text-[#8D8D8D]'
                        }`}
                      >
                        <ThumbsUp size={10} /> Like
                      </button>
                      {isOwnComment && (
                        <button type="button" onClick={() => handleCommentDelete(comment.id)}
                          className="text-[10px] text-[#FF3B30] font-medium"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="flex gap-2 pt-1">
              <div className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center shrink-0 overflow-hidden">
                <img src={getDefaultAvatar(currentUser?.id || 'me')} className="w-full h-full object-cover" alt="" />
              </div>
              <div className="flex-1 flex items-center gap-2 bg-[#F5F5F5] rounded-full px-3 py-1.5">
                <input
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleComment()}
                  placeholder="Write a comment..."
                  className="flex-1 bg-transparent text-[#111111] text-sm placeholder:text-[#8D8D8D] focus:outline-none"
                />
                {commentText.trim() && (
                  <button type="button" onClick={handleComment} className="text-[#00C300] text-sm font-semibold shrink-0">Post</button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
