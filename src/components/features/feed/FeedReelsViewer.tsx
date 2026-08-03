import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart, MessageCircle, Share2, Bookmark, Music, Volume2, VolumeX,
  Play, Send, ChevronLeft, MoreHorizontal, UserPlus, Download, BarChart3, Camera, Loader,
  Flag, Check, UserCheck, X
} from 'lucide-react';

const filters: Record<string, string> = {
  none: '',
  warm: 'sepia(0.3) contrast(1.1)',
  cool: 'hue-rotate(180deg) saturate(0.8)',
  bw: 'grayscale(1)',
  vivid: 'saturate(1.5) contrast(1.2)',
  fade: 'brightness(1.1) contrast(0.9) saturate(0.8)',
};
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useReelStore } from '@/store/useReelStore';
import { isYouTubeReel } from '@/lib/videoApis';
import YouTubePlayer from '@/components/YouTubePlayer';
import EmptyState from '@/components/EmptyState';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import { getDefaultAvatar } from '@/lib/utils';
import { toast } from 'sonner';
import type { Reel } from '@/types';

interface FeedReelsViewerProps {
  onClose?: () => void;
}

export default function FeedReelsViewer({ onClose }: FeedReelsViewerProps) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { friends, subscribeFriends, followUser, unfollowUser } = useFriendStore();
  const { reels, loading, subscribeReels, likeReel, unlikeReel, saveReel, shareReel, commentOnReel, viewReel, loadMoreReels, externalReels, searchExternalVideos, searchingExternal, clearExternalReels } = useReelStore();
  
  const [activeIndex, setActiveIndex] = useState(0);
  const [localLiked, setLocalLiked] = useState<Record<string, boolean>>({});
  const [localSaved, setLocalSaved] = useState<Record<string, boolean>>({});
  const [localFollowed, setLocalFollowed] = useState<Record<string, boolean>>({});
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [showHeartAnim, setShowHeartAnim] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [showComments, setShowComments] = useState<Reel | null>(null);
  const [showInsights, setShowInsights] = useState<Reel | null>(null);
  const [showShareOptions, setShowShareOptions] = useState<Reel | null>(null);
  const [showMoreOptions, setShowMoreOptions] = useState<Reel | null>(null);
  const [commentText, setCommentText] = useState('');
  const [feedType, setFeedType] = useState<'foryou' | 'following'>('foryou');
  const lastTapRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  // ─── Real-time subscription ───
  useEffect(() => {
    const unsub = subscribeReels();
    return () => unsub();
  }, [subscribeReels]);

  // ─── Friends subscription ───
  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeFriends(user.id);
    return () => unsub();
  }, [subscribeFriends, user?.id]);

  // ─── Auto-load external YouTube/Pexels videos when no user reels exist ───
  const loadedExternalRef = useRef(false);
  useEffect(() => {
    if (loading || loadedExternalRef.current || searchingExternal) return;
    if (feedType === 'foryou' && reels.length === 0) {
      loadedExternalRef.current = true;
      searchExternalVideos('trending', undefined);
    }
  }, [loading, searchingExternal, feedType, reels.length, searchExternalVideos]);

  // ─── Clear external reels when switching to 'following'; reset load flag when switching back ───
  useEffect(() => {
    if (feedType === 'following') {
      clearExternalReels();
      loadedExternalRef.current = false;
    }
  }, [feedType, clearExternalReels]);

  const friendIds = useMemo(() => new Set(friends.map(f => f.id)), [friends]);
  const followingIds = useMemo(() => new Set(user?.following || []), [user?.following]);

  // ─── Merge user reels + external reels, interleaved ───
  const mergedReels = useMemo(() => {
    if (feedType === 'following') {
      return reels.filter(r => friendIds.has(r.userId) || r.userId === user?.id || followingIds.has(r.userId));
    }
    // Interleave: user reels first, then fill gaps with external reels
    const userReels = [...reels];
    const externals = [...externalReels];
    
    if (userReels.length === 0 && externals.length === 0) return [];
    if (userReels.length === 0) return externals;
    if (externals.length === 0) return userReels;

    // Interleave: place external reels every 4th position
    const result: Reel[] = [];
    let userIdx = 0;
    let extIdx = 0;
    while (userIdx < userReels.length || extIdx < externals.length) {
      // Add 3 user reels (or remaining)
      for (let i = 0; i < 3 && userIdx < userReels.length; i++) {
        result.push(userReels[userIdx++]);
      }
      // Add 1 external reel
      if (extIdx < externals.length) {
        result.push(externals[extIdx++]);
      }
    }
    return result;
  }, [reels, externalReels, feedType, friendIds, followingIds, user?.id]);

  const displayReels = mergedReels;

  // Auto-play/pause based on active index
  useEffect(() => {
    const reel = displayReels[activeIndex];
    if (!reel) return;
    Object.entries(videoRefs.current).forEach(([id, video]) => {
      if (!video) return;
      if (id === reel.id) {
        video.muted = muted;
        video.playbackRate = playbackSpeed;
        video.play().catch(() => {});
      } else {
        video.pause();
        video.currentTime = 0;
      }
    });
  }, [activeIndex, displayReels, muted, playbackSpeed]);


  // Track view when reel becomes active (3 second watch)
  useEffect(() => {
    const reel = displayReels[activeIndex];
    if (!reel || !user?.id) return;
    const timer = setTimeout(() => {
      viewReel(reel.id, user.id);
    }, 3000);
    return () => clearTimeout(timer);
  }, [activeIndex, displayReels, user?.id, viewReel]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const scrollTop = scrollRef.current.scrollTop;
    const height = scrollRef.current.clientHeight;
    const index = Math.round(scrollTop / height);
    if (index !== activeIndex && index >= 0 && index < displayReels.length) {
      setPaused(false);
      setVideoProgress(0);
      setActiveIndex(index);
    }

    // Load more when near bottom
    if (scrollTop + height >= scrollRef.current.scrollHeight - 200 && !loading && displayReels.length > 0) {
      loadMoreReels();
    }
  }, [activeIndex, displayReels.length, loading, loadMoreReels]);

  const handleDoubleTap = (reel: Reel) => {
    const now = new Date().getTime();
    if (now - lastTapRef.current < 300) {
      if (!isLiked(reel)) {
        handleLike(reel);
        setShowHeartAnim(true);
        setTimeout(() => setShowHeartAnim(false), 900);
      }
    }
    lastTapRef.current = now;
  };

  const handleTogglePause = (reel: Reel) => {
    const video = videoRefs.current[reel.id];
    if (!video) return;
    if (video.paused) { video.play().catch(() => {}); setPaused(false); }
    else { video.pause(); setPaused(true); }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    const reel = displayReels[activeIndex];
    if (reel) {
      const video = videoRefs.current[reel.id];
      if (video) video.playbackRate = speed;
    }
    setShowSpeedMenu(false);
  };

  const handleLike = async (reel: Reel) => {
    if (!user?.id) { toast.error('Please log in'); return; }
    const isLiked = localLiked[reel.id] ?? reel.likes.includes(user.id);
    setLocalLiked(prev => ({ ...prev, [reel.id]: !isLiked }));
    try {
      if (isLiked) {
        await unlikeReel(reel.id, user.id);
      } else {
        await likeReel(reel.id, user.id);
      }
    } catch {
      setLocalLiked(prev => ({ ...prev, [reel.id]: isLiked }));
    }
  };

  const handleSave = async (reel: Reel) => {
    if (!user?.id) { toast.error('Please log in'); return; }
    const isSaved = localSaved[reel.id] ?? reel.savedBy.includes(user.id);
    setLocalSaved(prev => ({ ...prev, [reel.id]: !isSaved }));
    try {
      await saveReel(reel.id, user.id);
    } catch {
      setLocalSaved(prev => ({ ...prev, [reel.id]: isSaved }));
    }
  };

  const handleShare = async (reel: Reel) => {
    if (!user?.id) return;
    await shareReel(reel.id, user.id);
    setShowShareOptions(reel);
  };

  const handleCopyLink = async (reel: Reel) => {
    try {
      await navigator.clipboard.writeText(`https://gagachat.app/reel/${reel.id}`);
      toast.success('Link copied to clipboard');
    } catch { toast.error('Failed to copy'); }
    setShowShareOptions(null);
  };

  const handleShareToChat = async () => {
    if (!user?.id) return;
    navigate('/chats');
    toast.success('Select a chat to share to');
    setShowShareOptions(null);
  };

  const handleDownload = async (reel: Reel) => {
    if (!reel.videoUrl) { toast.error('No video to download'); return; }
    try {
      const url = new URL(reel.videoUrl);
      if (!['https:', 'http:'].includes(url.protocol)) { toast.error('Invalid video URL'); return; }
      const a = document.createElement('a');
      a.href = url.href;
      a.download = `gaga-reel-${reel.id.slice(0, 8)}.mp4`;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success('Download started');
    } catch {
      toast.error('Download failed');
    }
  };

  const handleFollow = async (reel: Reel) => {
    if (!user?.id) { toast.error('Please log in'); return; }
    const isFollowing = localFollowed[reel.userId] ?? followingIds.has(reel.userId);
    setLocalFollowed(prev => ({ ...prev, [reel.userId]: !isFollowing }));
    try {
      if (isFollowing) {
        await unfollowUser(reel.userId, user.id);
        toast.success('Unfollowed');
      } else {
        await followUser(reel.userId, user.id);
        toast.success('Following');
      }
    } catch {
      setLocalFollowed(prev => ({ ...prev, [reel.userId]: isFollowing }));
    }
  };

  const handleReport = () => {
    toast.success('Report submitted. Thank you for keeping GaGa Chat safe.');
    setShowMoreOptions(null);
  };

  const handleNotInterested = () => {
    toast.success('We\'ll show you fewer reels like this');
    setShowMoreOptions(null);
  };

  const handleAddComment = async () => {
    if (!user?.id || !showComments || !commentText.trim()) return;
    try {
      await commentOnReel(showComments.id, user.id, commentText.trim());
      setCommentText('');
      toast.success('Comment added');
    } catch {
      toast.error('Failed to add comment');
    }
  };

  const isLiked = (reel: Reel) => {
    if (localLiked[reel.id] !== undefined) return localLiked[reel.id];
    return user?.id ? reel.likes.includes(user.id) : false;
  };

  const isSaved = (reel: Reel) => {
    if (localSaved[reel.id] !== undefined) return localSaved[reel.id];
    return user?.id ? reel.savedBy.includes(user.id) : false;
  };

  const isFollowing = (reel: Reel) => {
    if (localFollowed[reel.userId] !== undefined) return localFollowed[reel.userId];
    return followingIds.has(reel.userId) || friendIds.has(reel.userId);
  };

  return (
    <div className="h-full flex flex-col bg-black relative">
      {/* Header overlay */}
      <div className="absolute top-0 left-0 right-0 z-20 flex flex-col px-4 py-3 bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex items-center justify-between mb-2">
          <button type="button" onClick={onClose} className="text-white p-1">
            <ChevronLeft size={24} />
          </button>
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => setFeedType('following')}
              className={`text-sm font-semibold transition-colors ${feedType === 'following' ? 'text-white' : 'text-white/50'}`}
            >
              Following
            </button>
            <button type="button" onClick={() => setFeedType('foryou')}
              className={`text-sm font-semibold transition-colors ${feedType === 'foryou' ? 'text-white' : 'text-white/50'}`}
            >
              For You
            </button>
          </div>
          <button type="button" onClick={() => navigate('/create-reel')} className="text-white p-1">
            <Camera size={22} />
          </button>
          <button type="button" onClick={() => onClose?.()} className="text-white p-1">
            <X size={24} />
          </button>
        </div>
        {feedType === 'following' && friendIds.size === 0 && (
          <div className="text-center py-2">
            <span className="text-white/50 text-xs">Follow friends to see their reels here</span>
          </div>
        )}
      </div>

      {/* Reels feed */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto snap-y snap-mandatory scroll-smooth"
      >
        {loading && displayReels.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <LoadingSkeleton />
          </div>
        )}

        {!loading && displayReels.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <EmptyState
              icon={Play}
              title={feedType === 'following' ? 'No reels from friends' : 'No reels yet'}
              description={feedType === 'following' ? 'Follow friends to see their reels here.' : 'Be the first to share a reel!'}
            />
          </div>
        )}

{displayReels.map((reel, reelIndex) => (
          <div
            key={reel.id}
            className="h-full w-full snap-start relative shrink-0 overflow-hidden"
          >
            {/* Video / Placeholder */}
            {isYouTubeReel(reel) ? (
              <YouTubePlayer
                videoId={reel.id.replace('yt-', '')}
                playing={reelIndex === activeIndex}
                muted={muted}
                thumbnail={reel.thumbnailUrl || ''}
                onClick={() => {
                  if (reelIndex !== activeIndex && scrollRef.current) {
                    scrollRef.current.scrollTo({ top: reelIndex * scrollRef.current.clientHeight, behavior: 'smooth' });
                  }
                }}
              />
            ) : reel.videoUrl ? (
              <video
                ref={el => { videoRefs.current[reel.id] = el; }}
                src={reel.videoUrl}
                muted={muted}
                loop
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
                poster={reel.thumbnailUrl}
                style={{ filter: filters[(reel as { filter?: string }).filter || 'none'] || '' }}
                onTimeUpdate={(e) => {
                  const v = e.currentTarget;
                  if (v.duration) setVideoProgress(v.currentTime / v.duration);
                }}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d] flex items-center justify-center">
                <div className="w-24 h-24 rounded-full bg-[#2a2a2a] flex items-center justify-center">
                  <Play size={40} className="text-white/50" />
                </div>
              </div>
            )}

            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 pointer-events-none" />

            {/* Play/Pause + double-tap like overlay (single tap toggles pause, double-tap likes) */}
            <button type="button" className="absolute inset-0 z-10"
              onClick={() => {
                const now = Date.now();
                const isDouble = now - lastTapRef.current < 300;
                lastTapRef.current = now;
                // Double-tap triggers like; single tap toggles pause.
                if (isDouble) {
                  handleDoubleTap(reel);
                } else {
                  handleTogglePause(reel);
                }
              }}
            />

            {/* Double-tap heart animation */}
            <AnimatePresence>
              {showHeartAnim && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1.4 }}
                  exit={{ opacity: 0, scale: 2 }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
                >
                  <Heart size={90} className="text-red-500 fill-red-500 drop-shadow-2xl" />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Paused indicator */}
            {paused && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                <div className="w-16 h-16 rounded-full bg-black/50 flex items-center justify-center">
                  <Play size={32} className="text-white fill-white ml-1" />
                </div>
              </div>
            )}

            {/* Mute + Speed controls */}
            <div className="absolute top-20 right-4 z-20 flex flex-col gap-2">
              <button type="button" onClick={() => setMuted(!muted)}
                className="p-2 rounded-full bg-black/40 text-white">
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <div className="relative">
                <button type="button" onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                  className="p-2 rounded-full bg-black/40 text-white text-[10px] font-bold w-9 h-9 flex items-center justify-center">
                  {playbackSpeed}x
                </button>
                <AnimatePresence>
                  {showSpeedMenu && (
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                      className="absolute right-10 top-0 bg-[#1a1a1a] rounded-xl overflow-hidden shadow-xl border border-white/10 z-30">
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map(s => (
                        <button key={s} type="button" onClick={() => handleSpeedChange(s)}
                          className={`block w-full px-4 py-2 text-xs font-medium text-left transition-colors ${
                            playbackSpeed === s ? 'bg-[#00C300] text-black' : 'text-white hover:bg-white/10'
                          }`}>
                          {s}x
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Right side actions */}
            <div className="absolute right-3 bottom-24 z-20 flex flex-col items-center gap-5">
              {/* Avatar with Follow */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => navigate(`/profile/${reel.userId}`)}
                  className="block"
                >
                  <img
                    src={reel.userAvatar || getDefaultAvatar(reel.userId)}
                    alt={reel.userName}
                    className="w-10 h-10 rounded-full object-cover border border-white/20"
                  />
                </button>
                {reel.userId !== user?.id && (
                  <button
                    type="button"
                    onClick={() => handleFollow(reel)}
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-[#00C300] rounded-full p-0.5"
                  >
                    {isFollowing(reel) ? (
                      <Check size={12} className="text-black" />
                    ) : (
                      <UserPlus size={12} className="text-black" />
                    )}
                  </button>
                )}
              </div>

              {/* Like */}
              <button type="button" onClick={() => handleLike(reel)} className="flex flex-col items-center gap-0.5">
                <Heart
                  size={28}
                  className={isLiked(reel) ? 'text-red-500 fill-red-500' : 'text-white'}
                />
                <span className="text-white text-xs font-medium">
                  {(reel.likes.length + (localLiked[reel.id] && !reel.likes.includes(user?.id || '') ? 1 : 0)).toLocaleString()}
                </span>
              </button>

              {/* Comment */}
              <button type="button" onClick={() => setShowComments(reel)} className="flex flex-col items-center gap-0.5">
                <MessageCircle size={28} className="text-white" />
                <span className="text-white text-xs font-medium">{reel.comments.length}</span>
              </button>

              {/* Save */}
              <button type="button" onClick={() => handleSave(reel)} className="flex flex-col items-center gap-0.5">
                <Bookmark
                  size={28}
                  className={isSaved(reel) ? 'text-[#00C300] fill-[#00C300]' : 'text-white'}
                />
              </button>

              {/* Share */}
              <button type="button" onClick={() => handleShare(reel)} className="flex flex-col items-center gap-0.5">
                <Share2 size={28} className="text-white" />
                <span className="text-white text-xs font-medium">{reel.shares.length}</span>
              </button>

              {/* Download */}
              <button type="button" onClick={() => handleDownload(reel)} className="flex flex-col items-center gap-0.5">
                <Download size={28} className="text-white" />
                <span className="text-white text-xs font-medium">Save</span>
              </button>

              {/* Insights */}
              <button type="button" onClick={() => setShowInsights(reel)} className="flex flex-col items-center gap-0.5">
                <BarChart3 size={28} className="text-white" />
                <span className="text-white text-xs font-medium">{reel.viewCount.toLocaleString()}</span>
              </button>

              {/* More */}
              <button type="button" onClick={() => setShowMoreOptions(reel)} className="text-white">
                <MoreHorizontal size={24} />
              </button>
            </div>

            {/* Bottom info */}
            <div className="absolute left-4 bottom-8 right-20 z-20">
              <div className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => navigate(`/profile/${reel.userId}`)}
                  className="block"
                >
                  <img
                    src={reel.userAvatar || getDefaultAvatar(reel.userId)}
                    alt="User avatar"
                    className="w-8 h-8 rounded-full object-cover"
                  />
                </button>
                <span className="text-white font-semibold text-sm">{reel.userName || 'User'}</span>
                {reel.userId !== user?.id && (
                  <button
                    type="button"
                    onClick={() => handleFollow(reel)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      isFollowing(reel)
                        ? 'bg-white/20 text-white'
                        : 'bg-white text-black'
                    }`}
                  >
                    {isFollowing(reel) ? 'Following' : 'Follow'}
                  </button>
                )}
              </div>
              <p className="text-white text-sm leading-relaxed mb-2 line-clamp-2">
                {reel.caption}
              </p>
              {reel.tags && reel.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {reel.tags.map(tag => (
                    <span key={tag} className="text-[#00C300] text-sm">#{tag}</span>
                  ))}
                </div>
              )}
              {reel.musicTitle && (
                <div className="flex items-center gap-2">
                  <Music size={14} className="text-white" />
                  <div className="overflow-hidden w-40">
                    <motion.div
                      animate={{ x: [0, -80, 0] }}
                      transition={{ repeat: Infinity, duration: 8, ease: 'linear' }}
                      className="text-white text-xs whitespace-nowrap"
                    >
                      {reel.musicTitle} &bull; Original Sound
                    </motion.div>
                  </div>
                </div>
              )}
            </div>

            {/* Video progress bar at bottom */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20 z-20">
              <div className="h-full bg-[#00C300] transition-all duration-100" style={{ width: `${videoProgress * 100}%` }} />
            </div>
          </div>
        ))}
        {/* Loading more */}
        {displayReels.length > 0 && (
          <div className="h-20 shrink-0 flex items-center justify-center">
            <Loader size={24} className="text-white/50 animate-spin" />
          </div>
        )}
      </div>

      {/* Comments Sheet */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-end"
            onClick={() => setShowComments(null)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-[#1a1a1a] rounded-t-2xl w-full max-h-[70vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-center py-3 border-b border-[#2a2a2a]">
                <div className="w-10 h-1 rounded-full bg-[#8D8D8D]" />
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {showComments.comments.length === 0 ? (
                  <p className="text-center text-[#8D8D8D] text-sm py-8">No comments yet</p>
                ) : (
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  showComments.comments.map((comment: any) => (
                    <div key={comment.id || comment.userId + comment.timestamp} className="flex gap-3">
                      <img
                        src={comment.userAvatar || getDefaultAvatar(comment.userId)}
                        alt="User avatar"
                        className="w-8 h-8 rounded-full object-cover shrink-0"
                      />
                      <div className="flex-1">
                        <p className="text-white text-sm font-medium">{comment.userName || 'User'}</p>
                        <p className="text-[#8D8D8D] text-sm">{comment.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="p-3 border-t border-[#2a2a2a] flex gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 bg-[#2a2a2a] text-white rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                  onKeyDown={e => e.key === 'Enter' && handleAddComment()}
                />
                <button type="button" onClick={handleAddComment}
                  disabled={!commentText.trim()}
                  className="p-2 rounded-full bg-[#00C300] text-black disabled:opacity-50"
                >
                  <Send size={18} />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Insights Sheet */}
      <AnimatePresence>
        {showInsights && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-end"
            onClick={() => setShowInsights(null)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-[#1a1a1a] rounded-t-2xl w-full max-h-[50vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-center py-3 border-b border-[#2a2a2a]">
                <div className="w-10 h-1 rounded-full bg-[#8D8D8D]" />
              </div>
              <div className="p-6 space-y-4">
                <h3 className="text-white font-bold text-lg">Reel Insights</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-white text-2xl font-bold">{showInsights.viewCount.toLocaleString()}</p>
                    <p className="text-[#8D8D8D] text-xs">Views</p>
                  </div>
                  <div className="text-center">
                    <p className="text-white text-2xl font-bold">{showInsights.likes.length.toLocaleString()}</p>
                    <p className="text-[#8D8D8D] text-xs">Likes</p>
                  </div>
                  <div className="text-center">
                    <p className="text-white text-2xl font-bold">{showInsights.comments.length.toLocaleString()}</p>
                    <p className="text-[#8D8D8D] text-xs">Comments</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <p className="text-white text-2xl font-bold">{showInsights.shares.length.toLocaleString()}</p>
                    <p className="text-[#8D8D8D] text-xs">Shares</p>
                  </div>
                  <div className="text-center">
                    <p className="text-white text-2xl font-bold">{showInsights.savedBy.length.toLocaleString()}</p>
                    <p className="text-[#8D8D8D] text-xs">Saves</p>
                  </div>
                </div>
                <button type="button" onClick={() => setShowInsights(null)}
                  className="w-full py-3 bg-[#2a2a2a] text-white rounded-xl text-sm font-bold"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Share Options Sheet */}
      <AnimatePresence>
        {showShareOptions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-end"
            onClick={() => setShowShareOptions(null)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-[#1a1a1a] rounded-t-2xl w-full p-6 space-y-3"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-center mb-2">
                <div className="w-10 h-1 rounded-full bg-[#8D8D8D]" />
              </div>
              <h3 className="text-white font-semibold mb-2">Share Reel</h3>
              <button
                type="button"
                onClick={() => handleCopyLink(showShareOptions)}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#2a2a2a] text-white hover:bg-[#333] transition-colors"
              >
                <Share2 size={18} /> Copy Link
              </button>
              <button
                type="button"
                onClick={() => handleShareToChat()}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#2a2a2a] text-white hover:bg-[#333] transition-colors"
              >
                <MessageCircle size={18} /> Share to Chat
              </button>
              {navigator.share && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.share({
                      title: 'GaGa Chat Reel',
                      text: showShareOptions.caption || 'Check out this reel',
                      url: `https://gagachat.app/reel/${showShareOptions.id}`,
                    });
                    setShowShareOptions(null);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#2a2a2a] text-white hover:bg-[#333] transition-colors"
                >
                  <Send size={18} /> Share via...
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowShareOptions(null)}
                className="w-full py-3 bg-[#2a2a2a] text-white rounded-xl text-sm font-bold"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* More Options Sheet */}
      <AnimatePresence>
        {showMoreOptions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-end"
            onClick={() => setShowMoreOptions(null)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-[#1a1a1a] rounded-t-2xl w-full p-6 space-y-3"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-center mb-2">
                <div className="w-10 h-1 rounded-full bg-[#8D8D8D]" />
              </div>
              <h3 className="text-white font-semibold mb-2">Options</h3>
              <button
                type="button"
                onClick={() => { handleNotInterested(); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#2a2a2a] text-white hover:bg-[#333] transition-colors"
              >
                <X size={18} /> Not Interested
              </button>
              <button
                type="button"
                onClick={() => { navigate(`/profile/${showMoreOptions.userId}`); setShowMoreOptions(null); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#2a2a2a] text-white hover:bg-[#333] transition-colors"
              >
                <UserCheck size={18} /> View Profile
              </button>
              {showMoreOptions.userId !== user?.id && (
                <button
                  type="button"
                  onClick={() => handleReport()}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#2a2a2a] text-[#FF3B30] hover:bg-[#333] transition-colors"
                >
                  <Flag size={18} /> Report
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowMoreOptions(null)}
                className="w-full py-3 bg-[#2a2a2a] text-white rounded-xl text-sm font-bold"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
