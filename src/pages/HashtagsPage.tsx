import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useEnhancedTimelineStore } from '@/store/useEnhancedTimelineStore';
import {
  TrendingUp, Hash, Search, Bookmark, X, Flame
} from 'lucide-react';

export default function HashtagsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { trendingHashtags, followedHashtags, getTrendingHashtags, subscribeTrendingHashtags, followHashtag, unfollowHashtag } = useEnhancedTimelineStore();
  const [tab, setTab] = useState<'trending' | 'following' | 'discover'>('trending');
  const [search, setSearch] = useState('');

  useEffect(() => {
    getTrendingHashtags(20);
    const unsub = subscribeTrendingHashtags(20);
    return () => unsub();
  }, [getTrendingHashtags, subscribeTrendingHashtags]);

  // Only real, server-backed hashtags are shown — never fabricated placeholders.
  const displayHashtags = trendingHashtags;

  const filtered = displayHashtags.filter((h) =>
    h.tag.toLowerCase().includes(search.toLowerCase()) ||
    h.description?.toLowerCase().includes(search.toLowerCase())
  );

  const followed = followedHashtags.map((h) => h.id);

  const handleFollow = (hashtagId: string) => {
    if (followed.includes(hashtagId)) {
      unfollowHashtag(hashtagId, user?.id || '');
    } else {
      followHashtag(hashtagId, user?.id || '');
    }
  };

  const isFollowing = (id: string) => followed.includes(id);

  const getTrendIcon = (rank?: number) => {
    if (!rank) return null;
    if (rank <= 3) return <Flame size={14} className="text-orange-500" />;
    return <TrendingUp size={14} className="text-[#00C300]" />;
  };

  return (
    <div className="min-h-[100dvh] bg-white">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 z-10 px-4 py-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full">
            <X size={20} className="text-gray-500" />
          </button>
          <h1 className="font-bold text-lg text-gray-900">Hashtags</h1>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search hashtags..."
            className="w-full pl-9 pr-3 py-2.5 bg-gray-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#00C300]/20"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 pb-3 flex gap-1">
        {(['trending', 'following', 'discover'] as const).map((t) => (
          <button type="button" key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${tab === t ? 'bg-[#00C300] text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            {t === 'trending' ? 'Trending' : t === 'following' ? 'Following' : 'Discover'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-4 pb-8">
        {tab === 'trending' && (
          <div className="space-y-2">
            {filtered.filter((h) => h.trending).length === 0 ? (
              <div className="text-center py-16">
                <TrendingUp size={48} className="mx-auto text-gray-200 mb-4" />
                <p className="text-gray-400 font-medium">
                  {search ? `No trending hashtags match "${search}"` : 'No trending hashtags yet'}
                </p>
                <p className="text-gray-300 text-sm mt-1">Trending topics appear as the community posts.</p>
              </div>
            ) : filtered
              .filter((h) => h.trending)
              .sort((a, b) => (b.trendRank || 999) - (a.trendRank || 999))
              .map((hashtag, idx) => (
                <motion.div
                  key={hashtag.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-[#00C300]/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-[#00C300]">#{hashtag.trendRank || idx + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-gray-900 text-sm">#{hashtag.tag}</p>
                      {getTrendIcon(hashtag.trendRank)}
                    </div>
                    <p className="text-xs text-gray-400">{hashtag.postCount.toLocaleString()} posts</p>
                    {hashtag.relatedTags && hashtag.relatedTags.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {hashtag.relatedTags.slice(0, 3).map((rt) => (
                          <span key={rt} className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{rt}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={() => handleFollow(hashtag.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${isFollowing(hashtag.id) ? 'bg-gray-100 text-gray-500' : 'bg-[#00C300] text-white'}`}
                  >
                    {isFollowing(hashtag.id) ? 'Following' : 'Follow'}
                  </button>
                </motion.div>
              ))}
          </div>
        )}

        {tab === 'following' && (
          <div className="space-y-2">
            {filtered.filter((h) => isFollowing(h.id)).length === 0 ? (
              <div className="text-center py-16">
                <Bookmark size={48} className="mx-auto text-gray-200 mb-4" />
                <p className="text-gray-400 font-medium">No hashtags followed yet</p>
              </div>
            ) : (
              filtered.filter((h) => isFollowing(h.id)).map((hashtag) => (
                <div key={hashtag.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                  <Hash size={20} className="text-[#00C300]" />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 text-sm">#{hashtag.tag}</p>
                    <p className="text-xs text-gray-400">{hashtag.postCount.toLocaleString()} posts</p>
                  </div>
                  <button type="button" onClick={() => handleFollow(hashtag.id)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors"
                  >
                    Unfollow
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'discover' && (
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <div className="text-center py-16">
                <Hash size={48} className="mx-auto text-gray-200 mb-4" />
                <p className="text-gray-400 font-medium">
                  {search ? `No hashtags match "${search}"` : 'No hashtags to discover yet'}
                </p>
              </div>
            ) : filtered.map((hashtag, idx) => (
              <motion.div
                key={hashtag.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00C300]/20 to-[#00C300]/5 flex items-center justify-center shrink-0">
                  <Hash size={20} className="text-[#00C300]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm">#{hashtag.tag}</p>
                  <p className="text-xs text-gray-400">{hashtag.postCount.toLocaleString()} posts · {(hashtag.followers?.length || 0).toLocaleString()} followers</p>
                </div>
                <button type="button" onClick={() => handleFollow(hashtag.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${isFollowing(hashtag.id) ? 'bg-gray-100 text-gray-500' : 'bg-[#00C300] text-white'}`}
                >
                  {isFollowing(hashtag.id) ? 'Following' : 'Follow'}
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
