import { useState, useEffect, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video, Search, Users, Radio,X, Hash,TrendingUp,Circle, Zap, Play
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useLiveStore } from '@/store/useLiveStore';
import { getDefaultAvatar } from '@/lib/utils';
const STREAM_CATEGORIES = [
  'All', 'Gaming', 'Music', 'Tech', 'Sports', 'Business',
  'Education', 'Health', 'Comedy', 'News', 'Lifestyle', 'Science'
];

/* LazyComponent wrapper for heavy components */
function LazyComponent({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return <Suspense fallback={fallback ?? null}>{children}</Suspense>;
}

export default function LiveStreamsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    activeStreams, loading, subscribeActiveStreams, getActiveStreams, startLive
  } = useLiveStore();

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [showGoLiveModal, setShowGoLiveModal] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Gaming');
  const [newHashtags, setNewHashtags] = useState('');
  const [isStarting, setIsStarting] = useState(false);

  /* Subscribe to active streams on mount */
  useEffect(() => {
    const unsub = subscribeActiveStreams();
    // Fallback fetch in case subscription is slow or unavailable
    getActiveStreams(50).catch(() => {});
    return () => unsub();
  }, [subscribeActiveStreams, getActiveStreams]);

  const filtered = activeStreams.filter((s) => {
    if (activeCategory !== 'All' && s.category !== activeCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.title.toLowerCase().includes(q) ||
        (s.userName || '').toLowerCase().includes(q) ||
        (s.category || '').toLowerCase().includes(q) ||
        (s.hashtags || []).some((h) => h.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const trending = [...filtered].sort((a, b) => b.viewerCount - a.viewerCount).slice(0, 5);

  const handleGoLive = async () => {
    if (!user?.id || !newTitle.trim()) return;
    setIsStarting(true);
    const hashtags = newHashtags
      .split(/[,\s]+/)
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean);
    const streamId = await startLive(user.id, {
      title: newTitle.trim(),
      category: newCategory,
      hashtags: hashtags.length ? hashtags : undefined,
    });
    setIsStarting(false);
    if (streamId) {
      setShowGoLiveModal(false);
      setNewTitle('');
      setNewHashtags('');
      navigate(`/live/${streamId}`);
    }
  };

  const formatCount = (count: number) => {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return count.toString();
  };

  return (
    <div className="h-[100dvh] bg-[#0d0d0d] text-white flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-5 py-4 border-b border-[#2a2a2a]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-[#00C300]/20 flex items-center justify-center">
              <Radio size={18} className="text-[#00C300]" />
            </div>
            <h1 className="text-xl font-bold">Live Streams</h1>
          </div>
          <button
            type="button"
            onClick={() => setShowGoLiveModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#00C300] text-black rounded-full text-sm font-bold hover:bg-[#00A300] transition-colors"
          >
            <Video size={16} /> Go Live
          </button>
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search streams, categories, hosts..."
            className="w-full bg-[#1a1a1a] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-[#8D8D8D] focus:outline-none focus:ring-2 focus:ring-[#00C300]/30"
          />
        </div>
      </div>

      {/* Category pills */}
      <div className="shrink-0 flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide border-b border-[#2a2a2a]">
        {STREAM_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              activeCategory === cat
                ? 'bg-[#00C300] text-black'
                : 'bg-[#1a1a1a] text-[#8D8D8D] hover:text-white'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Stream list */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-20">
        {loading && activeStreams.length === 0 ? (
          <div className="space-y-4 py-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-[#1a1a1a] rounded-xl p-3 animate-pulse">
                <div className="h-40 bg-[#2a2a2a] rounded-lg mb-3" />
                <div className="h-4 bg-[#2a2a2a] rounded w-2/3 mb-2" />
                <div className="h-3 bg-[#2a2a2a] rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-16 h-16 rounded-full bg-[#1a1a1a] flex items-center justify-center mb-4">
              <Video size={28} className="text-[#8D8D8D]" />
            </div>
            <h3 className="text-white font-semibold mb-1">No live streams</h3>
            <p className="text-[#8D8D8D] text-sm mb-4">
              No one is streaming right now. Be the first to go live!
            </p>
            <button
              type="button"
              onClick={() => setShowGoLiveModal(true)}
              className="px-5 py-2 bg-[#00C300] text-black rounded-full text-sm font-bold"
            >
              Start Streaming
            </button>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Trending section */}
            {trending.length > 0 && !search && activeCategory === 'All' && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp size={16} className="text-[#FF4081]" />
                  <h2 className="text-sm font-bold text-white">Trending Now</h2>
                </div>
                <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
                  {trending.map((stream) => (
                    <button
                      key={stream.id}
                      type="button"
                      onClick={() => navigate(`/live/${stream.id}`)}
                      className="shrink-0 w-52 bg-[#1a1a1a] rounded-xl overflow-hidden text-left hover:ring-2 hover:ring-[#00C300]/40 transition-all"
                    >
                      <div className="relative h-28 bg-[#2a2a2a]">
                        {stream.thumbnailUrl ? (
                          <img
                            src={stream.thumbnailUrl}
                            alt="Thumbnail"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Play size={28} className="text-[#8D8D8D]" />
                          </div>
                        )}
                        <div className="absolute top-2 left-2 bg-[#FF3B30] text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Circle size={6} className="fill-white animate-pulse" /> LIVE
                        </div>
                        <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Users size={10} /> {formatCount(stream.viewerCount)}
                        </div>
                      </div>
                      <div className="p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <img
                            src={stream.userAvatar || getDefaultAvatar(stream.userId)}
                            alt="Streamer"
                            className="w-6 h-6 rounded-full object-cover"
                          />
                          <p className="text-white text-xs font-medium truncate">{stream.userName || 'Streamer'}</p>
                        </div>
                        <p className="text-white text-sm font-semibold truncate mb-1">{stream.title}</p>
                        <p className="text-[#8D8D8D] text-[10px] truncate">{stream.category}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* All streams grid */}
            <div>
              <h2 className="text-sm font-bold text-white mb-3">
                {search ? 'Search Results' : activeCategory === 'All' ? 'All Streams' : `${activeCategory} Streams`}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filtered.map((stream) => (
                  <motion.button
                    key={stream.id}
                    type="button"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => navigate(`/live/${stream.id}`)}
                    className="w-full bg-[#1a1a1a] rounded-xl overflow-hidden text-left hover:bg-[#222] transition-colors border border-[#2a2a2a]"
                  >
                    <div className="relative h-44 bg-[#2a2a2a]">
                      {stream.thumbnailUrl ? (
                        <img
                          src={stream.thumbnailUrl}
                          alt="Thumbnail"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Play size={32} className="text-[#8D8D8D]" />
                        </div>
                      )}
                      <div className="absolute top-2 left-2 bg-[#FF3B30] text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Circle size={6} className="fill-white animate-pulse" /> LIVE
                      </div>
                      <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Users size={10} /> {formatCount(stream.viewerCount)}
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <img
                          src={stream.userAvatar || getDefaultAvatar(stream.userId)}
                          alt="Streamer"
                          className="w-7 h-7 rounded-full object-cover"
                        />
                        <div className="min-w-0">
                          <p className="text-white text-xs font-medium truncate">{stream.userName || 'Streamer'}</p>
                        </div>
                      </div>
                      <p className="text-white text-sm font-semibold truncate mb-1">{stream.title}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {stream.category && (
                          <span className="text-[#8D8D8D] text-[10px] bg-[#2a2a2a] px-2 py-0.5 rounded-full">
                            {stream.category}
                          </span>
                        )}
                        {(stream.hashtags || []).slice(0, 2).map((tag) => (
                          <span key={tag} className="text-[#00C300] text-[10px] flex items-center gap-0.5">
                            <Hash size={8} /> {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Go Live Modal wrapped in LazyComponent */}
      <LazyComponent fallback={<div className="fixed inset-0 z-50 bg-black/70" />}>
        <AnimatePresence>
          {showGoLiveModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center"
              onClick={() => setShowGoLiveModal(false)}
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="bg-[#1a1a1a] rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md border border-[#2a2a2a]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-white">Go Live</h2>
                  <button type="button" onClick={() => setShowGoLiveModal(false)}>
                    <X size={20} className="text-[#8D8D8D]" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-[#8D8D8D] mb-1 block">Stream Title</label>
                    <input
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="What's your stream about?"
                      maxLength={80}
                      className="w-full bg-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-white placeholder:text-[#8D8D8D] outline-none focus:ring-2 focus:ring-[#00C300]/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#8D8D8D] mb-1 block">Category</label>
                    <div className="flex gap-2 flex-wrap">
                      {STREAM_CATEGORIES.slice(1).map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setNewCategory(cat)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                            newCategory === cat
                              ? 'bg-[#00C300] text-black'
                              : 'bg-[#2a2a2a] text-[#8D8D8D]'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[#8D8D8D] mb-1 block">Hashtags</label>
                    <input
                      value={newHashtags}
                      onChange={(e) => setNewHashtags(e.target.value)}
                      placeholder="#gaming, #fun (comma separated)"
                      className="w-full bg-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-white placeholder:text-[#8D8D8D] outline-none focus:ring-2 focus:ring-[#00C300]/30"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleGoLive}
                    disabled={!newTitle.trim() || isStarting}
                    className="w-full py-3 bg-[#00C300] text-black rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-[#00A300] transition-colors flex items-center justify-center gap-2"
                  >
                    {isStarting ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                      >
                        <Zap size={16} />
                      </motion.div>
                    ) : (
                      <Video size={16} />
                    )}
                    {isStarting ? 'Starting...' : 'Start Live Stream'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </LazyComponent>
    </div>
  );
}
