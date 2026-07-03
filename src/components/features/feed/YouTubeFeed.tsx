import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Search, RefreshCw, TrendingUp, Loader, Youtube, X } from 'lucide-react';
import { fetchTrendingVideos, searchYouTube, clearYouTubeCache, type YouTubeVideo } from '@/services/youtubeService';
import YouTubeVideoCard from './YouTubeVideoCard';
import EmptyState from '@/components/EmptyState';

export default function YouTubeFeed() {
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadTrending = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchTrendingVideos('US', 16);
      setVideos(data);
    } catch (err) {
      setError('Failed to load YouTube videos');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!searchQuery.trim()) {
      loadTrending();
      return;
    }
    setIsSearching(true);
    setLoading(true);
    setError('');
    try {
      const data = await searchYouTube(searchQuery.trim(), 16);
      setVideos(data);
    } catch (err) {
      setError('Search failed');
    } finally {
      setLoading(false);
      setIsSearching(false);
    }
  };

  const handleRefresh = () => {
    clearYouTubeCache();
    if (searchQuery.trim()) {
      handleSearch();
    } else {
      loadTrending();
    }
  };

  useEffect(() => {
    loadTrending();
  }, []);

  return (
    <div className="h-full flex flex-col bg-[#0d0d0d]">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-[#1a1a1a] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-600/20 flex items-center justify-center">
              <Youtube size={18} className="text-red-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">YouTube Videos</h2>
              <p className="text-[10px] text-[#8D8D8D]">
                {searchQuery ? `Search: "${searchQuery}"` : 'Trending now'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="p-2 rounded-lg hover:bg-[#1a1a1a] text-[#8D8D8D]"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search YouTube videos..."
            className="w-full bg-[#1a1a1a] text-white pl-9 pr-9 py-2.5 rounded-xl text-sm placeholder:text-[#8D8D8D] focus:outline-none focus:ring-2 focus:ring-red-500/50"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); loadTrending(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8D8D8D] hover:text-white"
            >
              <X size={14} />
            </button>
          )}
        </form>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && videos.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-[#1a1a1a] rounded-xl overflow-hidden border border-[#2a2a2a]">
                <div className="aspect-video bg-[#222] animate-pulse" />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-[#222] rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-[#222] rounded animate-pulse w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : error && videos.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="No videos found"
            description={error}
            action={
              <button
                type="button"
                onClick={handleRefresh}
                className="px-4 py-2 bg-[#00C300] text-white rounded-full text-sm font-medium"
              >
                Try again
              </button>
            }
          />
        ) : videos.length === 0 ? (
          <EmptyState
            icon={Youtube}
            title="No videos yet"
            description="Add a YouTube API key to see trending videos, or search for specific content."
          />
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={14} className="text-red-500" />
              <span className="text-xs font-medium text-[#8D8D8D] uppercase tracking-wider">
                {searchQuery ? 'Search Results' : 'Trending Videos'}
              </span>
              {loading && <Loader size={14} className="animate-spin text-[#8D8D8D]" />}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {videos.map((video, index) => (
                <motion.div
                  key={video.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <YouTubeVideoCard video={video} index={index} />
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
