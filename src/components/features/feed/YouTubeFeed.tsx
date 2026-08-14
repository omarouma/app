import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, RefreshCw, TrendingUp, Loader, Youtube, X, Video,
  Clock, ListVideo, Trash2, ChevronRight, Play, Flame, Music2,
  Gamepad2, Newspaper, Dumbbell, Utensils, Plane, Microscope
} from 'lucide-react';
import { fetchTrendingVideos, searchYouTube, clearYouTubeCache, type YouTubeVideo } from '@/services/youtubeService';
import { fetchPopularPexelsVideos, searchPexels, clearPexelsCache, type PexelsVideo } from '@/services/pexelsService';
import { safeGetJsonStorageItem, safeRemoveStorageItem, safeSetStorageItem } from '@/lib/safeStorage';
import YouTubeVideoCard from './YouTubeVideoCard';
import { YouTubeModalPlayer, PexelsModalPlayer } from '@/components/YouTubePlayer';
import EmptyState from '@/components/EmptyState';

type VideoSource = 'youtube' | 'pexels';
type FeedVideo = YouTubeVideo | PexelsVideo;

const HISTORY_KEY = 'gaga_video_history';
const MAX_HISTORY = 30;

const CATEGORIES = [
  { label: 'Trending', icon: Flame, query: '' },
  { label: 'Music', icon: Music2, query: 'music 2024' },
  { label: 'Gaming', icon: Gamepad2, query: 'gaming highlights' },
  { label: 'News', icon: Newspaper, query: 'world news today' },
  { label: 'Fitness', icon: Dumbbell, query: 'workout fitness' },
  { label: 'Food', icon: Utensils, query: 'cooking recipes' },
  { label: 'Travel', icon: Plane, query: 'travel vlog' },
  { label: 'Science', icon: Microscope, query: 'science technology' },
];

interface WatchHistoryItem {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle?: string;
  source: VideoSource;
  watchedAt: number;
}

function loadHistory(): WatchHistoryItem[] {
  return safeGetJsonStorageItem<WatchHistoryItem[]>(HISTORY_KEY, []);
}

function saveToHistory(video: FeedVideo, source: VideoSource) {
  try {
    const history = loadHistory();
    const item: WatchHistoryItem = {
      id: video.id as string,
      title: video.title,
      thumbnail: video.thumbnail,
      channelTitle: 'channelTitle' in video ? video.channelTitle : ('user' in video ? video.user.name : ''),
      source,
      watchedAt: Date.now(),
    };
    const filtered = history.filter(h => h.id !== item.id);
    safeSetStorageItem(HISTORY_KEY, JSON.stringify([item, ...filtered].slice(0, MAX_HISTORY)));
  } catch { /* ignore */ }
}

function clearHistory() {
  safeRemoveStorageItem(HISTORY_KEY);
}

export default function YouTubeFeed() {
  const [videoSource, setVideoSource] = useState<VideoSource>('youtube');
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [activeVideo, setActiveVideo] = useState<FeedVideo | null>(null);
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState(0);
  const [tab, setTab] = useState<'feed' | 'history' | 'queue'>('feed');
  const [history, setHistory] = useState<WatchHistoryItem[]>(loadHistory);
  const [queue, setQueue] = useState<FeedVideo[]>([]);
  const [showQueueToast, setShowQueueToast] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadVideos = useCallback(async (query?: string) => {
    setLoading(true);
    setError('');
    try {
      let data: FeedVideo[];
      const q = query ?? (activeCategory > 0 ? CATEGORIES[activeCategory].query : '');
      if (videoSource === 'youtube') {
        data = q ? await searchYouTube(q, 20) : await fetchTrendingVideos('US', 20);
      } else {
        data = q ? await searchPexels(q, 20) : await fetchPopularPexelsVideos(20);
      }
      setVideos(data);
    } catch {
      setError('Failed to load videos');
    } finally {
      setLoading(false);
    }
  }, [videoSource, activeCategory]);

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!searchQuery.trim()) { void loadVideos(); return; }
    setActiveCategory(0);
    void loadVideos(searchQuery.trim());
  };

  const handleRefresh = () => {
    if (videoSource === 'youtube') clearYouTubeCache();
    else clearPexelsCache();
    loadVideos(searchQuery.trim() || undefined);
  };

  const handleCategorySelect = (idx: number) => {
    setActiveCategory(idx);
    setSearchQuery('');
  };

  const handlePlay = (video: FeedVideo) => {
    const idx = videos.indexOf(video);
    setActiveVideo(video);
    setActiveVideoIndex(idx >= 0 ? idx : 0);
    saveToHistory(video, videoSource);
    setHistory(loadHistory());
  };

  const handlePlayFromHistory = (item: WatchHistoryItem) => {
    // Create a minimal video object to play
    const fakeVideo = { id: item.id, title: item.title, thumbnail: item.thumbnail, channelTitle: item.channelTitle || '' } as YouTubeVideo;
    setActiveVideo(fakeVideo);
    setActiveVideoIndex(0);
  };

  const handlePlayFromQueue = (video: FeedVideo, idx: number) => {
    setActiveVideo(video);
    setActiveVideoIndex(idx);
    saveToHistory(video, videoSource);
    setHistory(loadHistory());
  };

  const handleAddToQueue = (video: FeedVideo, e: React.MouseEvent) => {
    e.stopPropagation();
    if (queue.find(q => q.id === video.id)) return;
    setQueue(prev => [...prev, video]);
    setShowQueueToast(true);
    setTimeout(() => setShowQueueToast(false), 2000);
  };

  const handleRemoveFromQueue = (id: string | number) => {
    setQueue(prev => prev.filter(v => v.id !== id));
  };

  const handleNavigate = (idx: number) => {
    const list = queue.length > 0 ? queue : videos;
    if (idx >= 0 && idx < list.length) {
      setActiveVideo(list[idx]);
      setActiveVideoIndex(idx);
      saveToHistory(list[idx], videoSource);
      setHistory(loadHistory());
    }
  };

  useEffect(() => { void loadVideos(); }, [loadVideos]);

  const isYouTubeVideo = (v: FeedVideo): v is YouTubeVideo => 'channelTitle' in v;

  return (
    <div className="h-full flex flex-col bg-[#0d0d0d]">
      {/* Header */}
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-[#1a1a1a] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${videoSource === 'youtube' ? 'bg-red-600/20' : 'bg-green-600/20'}`}>
              {videoSource === 'youtube' ? <Youtube size={18} className="text-red-500" /> : <Video size={18} className="text-green-500" />}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Videos</h2>
              <p className="text-[10px] text-[#8D8D8D]">
                {searchQuery ? `"${searchQuery}"` : activeCategory > 0 ? CATEGORIES[activeCategory].label : (videoSource === 'youtube' ? 'YouTube Trending' : 'Pexels Popular')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-[#1a1a1a] rounded-lg p-1">
              <button type="button" onClick={() => setVideoSource('youtube')}
                className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${videoSource === 'youtube' ? 'bg-red-600 text-white' : 'text-[#8D8D8D] hover:text-white'}`}>
                YouTube
              </button>
              <button type="button" onClick={() => setVideoSource('pexels')}
                className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${videoSource === 'pexels' ? 'bg-green-600 text-white' : 'text-[#8D8D8D] hover:text-white'}`}>
                Pexels
              </button>
            </div>
            <button type="button" onClick={handleRefresh}
              className="p-2 rounded-lg hover:bg-[#1a1a1a] text-[#8D8D8D]" aria-label="Refresh">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]" />
          <input ref={searchInputRef} type="text" value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search videos..."
            className="w-full bg-[#1a1a1a] text-white pl-9 pr-9 py-2.5 rounded-xl text-sm placeholder:text-[#8D8D8D] focus:outline-none focus:ring-2 focus:ring-red-500/50"
          />
          {searchQuery && (
            <button type="button" onClick={() => { setSearchQuery(''); void loadVideos(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8D8D8D] hover:text-white">
              <X size={14} />
            </button>
          )}
        </form>

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {CATEGORIES.map((cat, idx) => {
            const Icon = cat.icon;
            return (
              <button key={cat.label} type="button" onClick={() => handleCategorySelect(idx)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                  activeCategory === idx && !searchQuery
                    ? 'bg-[#00C300] text-black'
                    : 'bg-[#1a1a1a] text-[#8D8D8D] hover:text-white'
                }`}>
                <Icon size={12} />
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {(['feed', 'history', 'queue'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                tab === t ? 'bg-white/10 text-white' : 'text-[#8D8D8D] hover:text-white'
              }`}>
              {t === 'feed' && <Play size={11} />}
              {t === 'history' && <Clock size={11} />}
              {t === 'queue' && <ListVideo size={11} />}
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'queue' && queue.length > 0 && (
                <span className="bg-[#00C300] text-black text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{queue.length}</span>
              )}
              {t === 'history' && history.length > 0 && (
                <span className="text-[#8D8D8D] text-[9px]">{history.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* ── FEED TAB ── */}
        {tab === 'feed' && (
          <div className="p-4">
            {loading && videos.length === 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-[#1a1a1a] rounded-xl overflow-hidden">
                    <div className="aspect-video bg-[#222] animate-pulse" />
                    <div className="p-3 space-y-2">
                      <div className="h-4 bg-[#222] rounded animate-pulse w-3/4" />
                      <div className="h-3 bg-[#222] rounded animate-pulse w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error && videos.length === 0 ? (
              <EmptyState icon={TrendingUp} title="No videos found" description={error}
                action={<button type="button" onClick={handleRefresh} className="px-4 py-2 bg-[#00C300] text-white rounded-full text-sm font-medium">Try again</button>}
              />
            ) : videos.length === 0 ? (
              <EmptyState icon={Youtube} title="No videos yet" description="Search for content or select a category." />
            ) : (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp size={14} className="text-red-500" />
                  <span className="text-xs font-medium text-[#8D8D8D] uppercase tracking-wider">
                    {searchQuery ? 'Search Results' : activeCategory > 0 ? CATEGORIES[activeCategory].label : 'Trending'}
                  </span>
                  {loading && <Loader size={14} className="animate-spin text-[#8D8D8D]" />}
                  <span className="text-[#8D8D8D] text-xs ml-auto">{videos.length} videos</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {videos.map((video, index) => (
                    <motion.div key={video.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}
                      className="relative group">
                      <YouTubeVideoCard video={video} index={index} onPlay={handlePlay} />
                      {/* Add to queue button */}
                      <button type="button" onClick={(e) => handleAddToQueue(video, e)}
                        className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 text-white rounded-full p-1.5 hover:bg-[#00C300] hover:text-black"
                        title="Add to queue">
                        <ListVideo size={12} />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === 'history' && (
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-[#8D8D8D]" />
                <span className="text-xs font-medium text-[#8D8D8D] uppercase tracking-wider">Watch History</span>
              </div>
              {history.length > 0 && (
                <button type="button" onClick={() => { clearHistory(); setHistory([]); }}
                  className="flex items-center gap-1 text-xs text-[#FF3B30] hover:text-red-400 transition-colors">
                  <Trash2 size={12} /> Clear all
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <EmptyState icon={Clock} title="No watch history" description="Videos you watch will appear here." />
            ) : (
              <div className="space-y-3">
                {history.map((item) => (
                  <motion.div key={`${item.id}-${item.watchedAt}`}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    className="flex gap-3 bg-[#1a1a1a] rounded-xl overflow-hidden cursor-pointer hover:bg-[#222] transition-colors group"
                    onClick={() => handlePlayFromHistory(item)}>
                    <div className="relative w-28 shrink-0 aspect-video bg-black">
                      <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                      <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${item.source === 'youtube' ? 'bg-red-600/80' : 'bg-green-600/80'}`}>
                          <Play size={14} className="text-white fill-white ml-0.5" />
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 py-2 pr-3">
                      <p className="text-white text-sm font-medium line-clamp-2 leading-snug">{item.title}</p>
                      {item.channelTitle && <p className="text-[#8D8D8D] text-xs mt-1 truncate">{item.channelTitle}</p>}
                      <p className="text-[#555] text-[10px] mt-1">
                        {new Date(item.watchedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <ChevronRight size={16} className="text-[#555] self-center mr-2 shrink-0" />
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── QUEUE TAB ── */}
        {tab === 'queue' && (
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ListVideo size={14} className="text-[#8D8D8D]" />
                <span className="text-xs font-medium text-[#8D8D8D] uppercase tracking-wider">Up Next ({queue.length})</span>
              </div>
              {queue.length > 0 && (
                <button type="button" onClick={() => setQueue([])}
                  className="flex items-center gap-1 text-xs text-[#FF3B30] hover:text-red-400 transition-colors">
                  <Trash2 size={12} /> Clear queue
                </button>
              )}
            </div>
            {queue.length === 0 ? (
              <EmptyState icon={ListVideo} title="Queue is empty"
                description="Hover over a video and tap the queue icon to add it here." />
            ) : (
              <div className="space-y-3">
                {queue.map((video, idx) => (
                  <motion.div key={video.id} layout
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="flex gap-3 bg-[#1a1a1a] rounded-xl overflow-hidden cursor-pointer hover:bg-[#222] transition-colors group"
                    onClick={() => handlePlayFromQueue(video, idx)}>
                    <div className="relative w-28 shrink-0 aspect-video bg-black">
                      <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" loading="lazy" />
                      <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isYouTubeVideo(video) ? 'bg-red-600/80' : 'bg-green-600/80'}`}>
                          <Play size={14} className="text-white fill-white ml-0.5" />
                        </div>
                      </div>
                      <div className="absolute top-1 left-1 bg-black/70 text-white text-[9px] font-bold rounded px-1">{idx + 1}</div>
                    </div>
                    <div className="flex-1 min-w-0 py-2">
                      <p className="text-white text-sm font-medium line-clamp-2 leading-snug">{video.title}</p>
                      {isYouTubeVideo(video) && <p className="text-[#8D8D8D] text-xs mt-1 truncate">{video.channelTitle}</p>}
                    </div>
                    <button type="button" onClick={(e) => { e.stopPropagation(); handleRemoveFromQueue(video.id); }}
                      className="text-[#555] hover:text-[#FF3B30] transition-colors self-center mr-3 shrink-0 p-1">
                      <X size={14} />
                    </button>
                  </motion.div>
                ))}
                {queue.length > 0 && (
                  <button type="button" onClick={() => handlePlayFromQueue(queue[0], 0)}
                    className="w-full py-3 bg-[#00C300] text-black rounded-xl text-sm font-bold flex items-center justify-center gap-2 mt-2">
                    <Play size={16} className="fill-black" /> Play All
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Queue added toast */}
      <AnimatePresence>
        {showQueueToast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-[#1a1a1a] text-white text-xs font-medium px-4 py-2 rounded-full shadow-lg flex items-center gap-2 border border-[#333]">
            <ListVideo size={12} className="text-[#00C300]" /> Added to queue
          </motion.div>
        )}
      </AnimatePresence>

      {/* In-app modal player */}
      <AnimatePresence>
        {activeVideo && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {isYouTubeVideo(activeVideo) ? (
              <YouTubeModalPlayer
                videoId={activeVideo.id as string}
                title={activeVideo.title}
                channelTitle={activeVideo.channelTitle}
                onClose={() => setActiveVideo(null)}
                playlist={(queue.length > 0 ? queue : videos).filter(isYouTubeVideo).map(v => v.id as string)}
                playlistIndex={activeVideoIndex}
                onNavigate={handleNavigate}
              />
            ) : (
              <PexelsModalPlayer
                video={activeVideo as PexelsVideo}
                onClose={() => setActiveVideo(null)}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
