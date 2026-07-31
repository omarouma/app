/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart, MessageCircle, Share2, Bookmark, Music, Volume2, VolumeX,
  Play, Send, ChevronLeft, MoreHorizontal, UserPlus, Download, BarChart3,
  Loader, TrendingUp, Search, X
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
import { REEL_CATEGORIES } from '@/lib/demoReels';
import { isExternalReel, isYouTubeReel } from '@/lib/videoApis';
import YouTubePlayer from '@/components/YouTubePlayer';
import { hasAnyVideoKey } from '@/config/videoApis';
import BottomNav from '@/components/layout/BottomNav';
import EmptyState from '@/components/EmptyState';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import { getDefaultAvatar, sanitizeText } from '@/lib/utils';
import { toast } from 'sonner';
import type { Reel } from '@/types';

type FeedTab = 'foryou' | 'following' | 'trending';

export default function ReelsPage() {
  const { user } = useAuthStore();
  const { friends, subscribeFriends } = useFriendStore();
  const {
    reels, externalReels, loading, loadingMore, hasMore, searchingExternal,
    likeReel, unlikeReel, saveReel, shareReel, commentOnReel,
    loadMoreReels, subscribeReels, setActiveCategory, refreshReels,
    searchExternalVideos, clearExternalReels
  } = useReelStore();
  const navigate = useNavigate();

  const [activeIndex, setActiveIndex] = useState(0);
  const [localLiked, setLocalLiked] = useState<Record<string, boolean>>({});
  const [localSaved, setLocalSaved] = useState<Record<string, boolean>>({});
  const [muted, setMuted] = useState(true);
  const [showComments, setShowComments] = useState<Reel | null>(null);
  const [showInsights, setShowInsights] = useState<Reel | null>(null);
  const [commentText, setCommentText] = useState('');
  const [feedType, setFeedType] = useState<FeedTab>('foryou');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [, setPlaying] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const loadingMoreRef = useRef(false);
  const lastLoadIndexRef = useRef(0);

  // Subscribe to reels on mount
  useEffect(() => {
    const unsub = subscribeReels();
    return () => unsub();
  }, [subscribeReels]);

  // Subscribe to friends
  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeFriends(user.id);
    return () => unsub();
  }, [subscribeFriends, user?.id]);

  const friendIds = new Set(friends.map(f => f.id));

  // Filter reels based on feed type, category, and search mode
  const displayReels = (() => {
    // Search mode: show external reels + matching local reels
    if (searchMode) {
      const localMatch = reels.filter(r =>
        r.caption.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
      );
      // Mix external and local, deduplicate by id
      const seen = new Set<string>();
      const mixed: Reel[] = [];
      const all = [...externalReels, ...localMatch];
      for (const r of all) {
        if (!seen.has(r.id)) {
          seen.add(r.id);
          mixed.push(r);
        }
      }
      return mixed;
    }

    let result = reels;

    // Category filter (highest priority)
    if (selectedCategory) {
      result = result.filter(r => r.category === selectedCategory);
    }

    // Feed type filter
    if (feedType === 'following') {
      result = result.filter(r => friendIds.has(r.userId) || r.userId === user?.id);
    } else if (feedType === 'trending') {
      result = [...result].sort((a, b) => {
        const scoreA = a.viewCount + (a.likes?.length || 0) * 10;
        const scoreB = b.viewCount + (b.likes?.length || 0) * 10;
        return scoreB - scoreA;
      });
    }

    return result;
  })();

  // Auto-play/pause based on active index
  useEffect(() => {
    const reel = displayReels[activeIndex];
    if (!reel) return;
    Object.entries(videoRefs.current).forEach(([id, video]) => {
      if (!video) return;
      if (id === reel.id) {
        video.play().catch(() => {});
        setPlaying(prev => ({ ...prev, [id]: true }));
      } else {
        video.pause();
        setPlaying(prev => ({ ...prev, [id]: false }));
      }
    });
  }, [activeIndex, displayReels]);

  // IntersectionObserver for robust auto-play/pause on scroll
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    const container = scrollRef.current;
    if (!container) return;

    // Small delay to let video elements mount
    const timeout = setTimeout(() => {
      Object.entries(videoRefs.current).forEach(([id, video]) => {
        if (!video) return;
        const observer = new IntersectionObserver(
          ([entry]) => {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
              video.play().catch(() => {});
              setPlaying(prev => ({ ...prev, [id]: true }));
            } else {
              video.pause();
              setPlaying(prev => ({ ...prev, [id]: false }));
            }
          },
          { root: container, threshold: 0.6 }
        );
        observer.observe(video);
        observers.push(observer);
      });
    }, 500);

    return () => {
      clearTimeout(timeout);
      observers.forEach(o => o.disconnect());
    };
  }, [displayReels.length]);

  // Track view when reel becomes active (3 second watch)
  useEffect(() => {
    const reel = displayReels[activeIndex];
    if (!reel || !user?.id) return;
    const timer = setTimeout(() => {
      if (!reel.viewedBy?.includes(user.id)) {
        useReelStore.getState().viewReel?.(reel.id, user.id);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [activeIndex, displayReels, user?.id]);

  // Infinite scroll + active index tracking
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const scrollTop = scrollRef.current.scrollTop;
    const height = scrollRef.current.clientHeight;
    const index = Math.round(scrollTop / height);

    if (index !== activeIndex) {
      setActiveIndex(index);
    }

    // Infinite scroll: load more when near bottom
    const isNearBottom = index >= displayReels.length - 3;
    if (isNearBottom && hasMore && !loadingMore && !loadingMoreRef.current) {
      if (index > lastLoadIndexRef.current) {
        loadingMoreRef.current = true;
        lastLoadIndexRef.current = index;
        loadMoreReels(10).finally(() => {
          loadingMoreRef.current = false;
        });
      }
    }
  }, [activeIndex, displayReels.length, hasMore, loadingMore, loadMoreReels]);

  // Handle feed type change
  const handleFeedTypeChange = (type: FeedTab) => {
    setFeedType(type);
    setSelectedCategory(null);
    setActiveCategory(null);
    setActiveIndex(0);
    lastLoadIndexRef.current = 0;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;

    if (type === 'trending') {
      // Refresh to get latest for trending calculation
      refreshReels();
    } else {
      refreshReels();
    }
  };

  // Handle category change
  const handleCategoryChange = (cat: string | null) => {
    setSelectedCategory(cat);
    setActiveCategory(cat);
    setActiveIndex(0);
    lastLoadIndexRef.current = 0;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    refreshReels();
  };

  // Search handlers
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchMode(false);
      clearExternalReels();
      return;
    }
    setSearchMode(true);
    setActiveIndex(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    await searchExternalVideos(searchQuery.trim());
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
    if (e.key === 'Escape') {
      setShowSearch(false);
      setSearchMode(false);
      setSearchQuery('');
      clearExternalReels();
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchMode(false);
    setShowSearch(false);
    clearExternalReels();
  };

  const handleLike = async (reel: Reel) => {
    if (!user?.id) return;
    if (isExternalReel(reel)) {
      // External videos: just toggle local state, no backend
      setLocalLiked(prev => ({ ...prev, [reel.id]: !prev[reel.id] }));
      return;
    }
    const isLiked = localLiked[reel.id] ?? reel.likes.includes(user.id);
    setLocalLiked(prev => ({ ...prev, [reel.id]: !isLiked }));
    if (isLiked) {
      await unlikeReel(reel.id, user.id);
    } else {
      await likeReel(reel.id, user.id);
    }
  };

  const handleSave = async (reel: Reel) => {
    if (!user?.id) return;
    if (isExternalReel(reel)) {
      setLocalSaved(prev => ({ ...prev, [reel.id]: !prev[reel.id] }));
      return;
    }
    const isSaved = localSaved[reel.id] ?? reel.savedBy.includes(user.id);
    setLocalSaved(prev => ({ ...prev, [reel.id]: !isSaved }));
    await saveReel(reel.id, user.id);
  };

  const handleShare = async (reel: Reel) => {
    if (!user?.id) return;
    await shareReel(reel.id, user.id);
    try {
      let link = '';
      if (isYouTubeReel(reel)) {
        const videoId = reel.id.replace('yt-', '');
        link = `https://youtube.com/watch?v=${videoId}`;
      } else {
        link = `https://gagachat.app/reel/${reel.id}`;
      }
      await navigator.clipboard.writeText(link);
      toast.success('Link copied to clipboard');
    } catch { /* noop */ }
  };

  const handleDownload = async (reel: Reel) => {
    if (isYouTubeReel(reel)) {
      toast.info('YouTube videos cannot be downloaded. Open in YouTube to watch.');
      return;
    }
    if (!reel.videoUrl) { toast.error('No video to download'); return; }
    try {
      const a = document.createElement('a');
      a.href = reel.videoUrl;
      a.download = `gaga-reel-${reel.id.slice(0, 8)}.mp4`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success('Download started');
    } catch {
      toast.error('Download failed');
    }
  };

  const handleInsights = (reel: Reel) => {
    setShowInsights(reel);
  };

  const handleAddComment = async () => {
    if (!user?.id || !showComments || !commentText.trim()) return;
    await commentOnReel(showComments.id, user.id, commentText.trim());
    setCommentText('');
    refreshReels();
  };

  const isLiked = (reel: Reel) => {
    if (localLiked[reel.id] !== undefined) return localLiked[reel.id];
    return user?.id ? reel.likes.includes(user.id) : false;
  };

  const isSaved = (reel: Reel) => {
    if (localSaved[reel.id] !== undefined) return localSaved[reel.id];
    return user?.id ? reel.savedBy.includes(user.id) : false;
  };

  return (
    <div className="h-full flex flex-col bg-black relative">
      {/* Header overlay */}
      <div className="absolute top-0 left-0 right-0 z-20 flex flex-col px-4 pt-3 pb-1 bg-gradient-to-b from-black/80 via-black/50 to-transparent">
        <div className="flex items-center justify-between mb-2">
          <button type="button" onClick={() => navigate(-1)} className="text-white p-1">
            <ChevronLeft size={24} />
          </button>
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => handleFeedTypeChange('following')}
              className={`text-sm font-semibold transition-colors ${feedType === 'following' ? 'text-white' : 'text-white/50'}`}
            >
              Following
            </button>
            <button type="button" onClick={() => handleFeedTypeChange('foryou')}
              className={`text-sm font-semibold transition-colors ${feedType === 'foryou' ? 'text-white' : 'text-white/50'}`}
            >
              For You
            </button>
            <button type="button" onClick={() => handleFeedTypeChange('trending')}
              className={`text-sm font-semibold transition-colors flex items-center gap-1 ${feedType === 'trending' ? 'text-white' : 'text-white/50'}`}
            >
              <TrendingUp size={14} /> Trending
            </button>
          </div>
          <button type="button" onClick={() => setShowSearch(!showSearch)} className="text-white p-1">
            {showSearch ? <X size={24} /> : <Search size={24} />}
          </button>
        </div>

        {/* Search bar */}
        <AnimatePresence>
          {showSearch && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-2"
            >
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={hasAnyVideoKey() ? 'Search videos...' : 'Search local reels...'}
                  className="w-full bg-white/10 text-white px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]/50 placeholder:text-white/40"
                  autoFocus
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleSearch}
                  className="flex-1 py-2 rounded-xl bg-[#00C300] text-black text-sm font-semibold"
                >
                  Search
                </button>
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="px-4 py-2 rounded-xl bg-white/10 text-white text-sm font-medium"
                >
                  Clear
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <button
            type="button"
            onClick={() => handleCategoryChange(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              selectedCategory === null
                ? 'bg-[#00C300] text-black'
                : 'bg-white/10 text-white/80'
            }`}
          >
            All
          </button>
          {REEL_CATEGORIES.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => handleCategoryChange(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-[#00C300] text-black'
                  : 'bg-white/10 text-white/80'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
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

        {!loading && displayReels.length === 0 && !searchingExternal && (
          <div className="h-full flex items-center justify-center">
            <EmptyState
              icon={Play}
              title={searchMode ? 'No results found' : feedType === 'following' ? 'No reels from friends' : 'No reels yet'}
              description={searchMode
                ? hasAnyVideoKey() ? 'Try a different search term.' : 'Add YouTube/Pexels API keys in config to search external videos.'
                : feedType === 'following' ? 'Follow friends to see their reels here.' : 'Be the first to share a reel!'
              }
            />
          </div>
        )}

        {searchingExternal && displayReels.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader size={32} className="text-white/50 animate-spin" />
              <span className="text-white/50 text-sm">Searching videos...</span>
            </div>
          </div>
        )}

        {displayReels.map((reel, reelIndex) => (
          <div
            key={reel.id}
            className="h-full w-full snap-start relative shrink-0 overflow-hidden"
          >
            {/* External video indicator */}
            {isExternalReel(reel) && (
              <div className="absolute top-16 left-4 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/90 text-white text-xs font-semibold">
                {isYouTubeReel(reel) ? 'YouTube' : 'External'}
              </div>
            )}

            {/* Video rendering: native video for app content, thumbnail+link for YouTube */}
            {isYouTubeReel(reel) ? (
              <YouTubePlayer
                videoId={reel.id.replace('yt-', '')}
                playing={reelIndex === activeIndex}
                muted={muted}
                thumbnail={reel.thumbnailUrl || ''}
                onClick={() => {
                  if (reelIndex !== activeIndex) {
                    if (scrollRef.current) {
                      scrollRef.current.scrollTo({ top: reelIndex * scrollRef.current.clientHeight, behavior: 'smooth' });
                    }
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
                preload={reelIndex <= activeIndex + 2 ? 'auto' : 'metadata'}
                className="absolute inset-0 w-full h-full object-cover"
                poster={reel.thumbnailUrl}
                style={{ filter: filters[(reel as any).filter || 'none'] || '' }}
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

            {/* Play/Pause overlay tap */}
            <button type="button" className="absolute inset-0 z-10"
              onClick={() => {
                const video = videoRefs.current[reel.id];
                if (!video) return;
                if (video.paused) {
                  video.play().catch(() => {});
                  setPlaying(prev => ({ ...prev, [reel.id]: true }));
                } else {
                  video.pause();
                  setPlaying(prev => ({ ...prev, [reel.id]: false }));
                }
              }}
            />

            {/* Mute toggle */}
            <button type="button" onClick={() => setMuted(!muted)}
              className="absolute top-28 right-4 z-20 p-2 rounded-full bg-black/40 text-white"
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>

            {/* Right side actions */}
            <div className="absolute right-3 bottom-24 z-20 flex flex-col items-center gap-5">
              {/* Avatar */}
              <div className="relative">
                <img
                  src={reel.userAvatar || getDefaultAvatar(reel.userId)}
                  alt={reel.userName}
                  className="w-10 h-10 rounded-full object-cover border border-white/20"
                />
                <button type="button" className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-[#00C300] rounded-full p-0.5">
                  <UserPlus size={12} className="text-black" />
                </button>
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
              <button type="button" onClick={() => handleInsights(reel)} className="flex flex-col items-center gap-0.5">
                <BarChart3 size={28} className="text-white" />
                <span className="text-white text-xs font-medium">{reel.viewCount.toLocaleString()}</span>
              </button>

              {/* More */}
              <button type="button" className="text-white">
                <MoreHorizontal size={24} />
              </button>
            </div>

            {/* Bottom info */}
            <div className="absolute left-4 bottom-8 right-20 z-20">
              <div className="flex items-center gap-2 mb-2">
                <img
                  src={reel.userAvatar || getDefaultAvatar(reel.userId)}
                  alt="User avatar"
                  className="w-8 h-8 rounded-full object-cover"
                />
                <span className="text-white font-semibold text-sm">{sanitizeText(reel.userName) || 'User'}</span>
                <button type="button" className="px-3 py-1 rounded-full border border-white/30 text-white text-xs font-medium">
                  Follow
                </button>
              </div>
              <p className="text-white text-sm leading-relaxed mb-2 line-clamp-2">
                {sanitizeText(reel.caption)}
              </p>
              {reel.category && (
                <span className="inline-block px-2 py-0.5 rounded-md bg-white/10 text-white/80 text-xs font-medium mb-2">
                  {reel.category}
                </span>
              )}
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
                      {reel.musicTitle} • Original Sound
                    </motion.div>
                  </div>
                </div>
              )}
            </div>

            {/* Progress indicator */}
            <div className="absolute top-1 left-4 right-4 z-20 flex gap-1">
              {displayReels.map((_, i) => (
                <div key={i} className="h-0.5 flex-1 rounded-full bg-white/30 overflow-hidden">
                  {i === activeIndex && (
                    <motion.div
                      className="h-full bg-white"
                      initial={{ width: '0%' }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 5, ease: 'linear' }}
                    />
                  )}
                  {i < activeIndex && <div className="h-full bg-white" />}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Loading more indicator */}
        {loadingMore && displayReels.length > 0 && (
          <div className="h-20 flex items-center justify-center">
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
                  showComments.comments.map((comment: any) => (
                    <div key={comment.id || comment.userId + comment.timestamp} className="flex gap-3">
                      <img
                        src={comment.userAvatar || getDefaultAvatar(comment.userId)}
                        alt="User avatar"
                        className="w-8 h-8 rounded-full object-cover shrink-0"
                      />
                      <div className="flex-1">
                        <p className="text-white text-sm font-medium">{sanitizeText(comment.userName) || 'User'}</p>
                        <p className="text-[#8D8D8D] text-sm">{sanitizeText(comment.content)}</p>
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

      <BottomNav />
    </div>
  );
}
