import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useEnhancedTimelineStore } from '@/store/useEnhancedTimelineStore';
import {
  TrendingUp, Hash, Search, Bookmark, X, Flame
} from 'lucide-react';
import type { Hashtag } from '@/types';

const MOCK_HASHTAGS: Hashtag[] = [
  { id: '1', tag: 'gagachat', postCount: 12450, followers: ['u1','u2','u3'], trending: true, trendRank: 1, relatedTags: ['chat','messaging'], description: 'Official GaGa Chat community' },
  { id: '2', tag: 'tech', postCount: 8920, followers: ['u1','u4'], trending: true, trendRank: 2, relatedTags: ['technology','innovation'], description: 'Technology and innovation' },
  { id: '3', tag: 'gaming', postCount: 7650, followers: ['u2','u5'], trending: true, trendRank: 3, relatedTags: ['games','esports'], description: 'Gaming community' },
  { id: '4', tag: 'music', postCount: 6200, followers: ['u3','u6'], trending: true, trendRank: 4, relatedTags: ['songs','artists'], description: 'Music and artists' },
  { id: '5', tag: 'food', postCount: 5400, followers: ['u4'], trending: false, relatedTags: ['cooking','recipes'], description: 'Food and recipes' },
  { id: '6', tag: 'travel', postCount: 4800, followers: ['u5'], trending: false, relatedTags: ['adventure','explore'], description: 'Travel and adventure' },
  { id: '7', tag: 'photography', postCount: 4200, followers: ['u6'], trending: false, relatedTags: ['photos','camera'], description: 'Photography community' },
  { id: '8', tag: 'memes', postCount: 8900, followers: ['u1','u2','u3','u4'], trending: true, trendRank: 5, relatedTags: ['funny','humor'], description: 'Funny memes and humor' },
  { id: '9', tag: 'coding', postCount: 3100, followers: ['u1'], trending: false, relatedTags: ['programming','dev'], description: 'Coding and programming' },
  { id: '10', tag: 'fitness', postCount: 2800, followers: ['u2'], trending: false, relatedTags: ['gym','health'], description: 'Fitness and health' },
];

export default function HashtagsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { trendingHashtags, followedHashtags, getTrendingHashtags, subscribeTrendingHashtags, followHashtag, unfollowHashtag } = useEnhancedTimelineStore();
  const [tab, setTab] = useState<'trending' | 'following' | 'discover'>('trending');
  const [search, setSearch] = useState('');
  const [localHashtags, setLocalHashtags] = useState<Hashtag[]>(MOCK_HASHTAGS);

  useEffect(() => {
    getTrendingHashtags(20);
    const unsub = subscribeTrendingHashtags(20);
    return () => unsub();
  }, [getTrendingHashtags, subscribeTrendingHashtags]);

  const displayHashtags = trendingHashtags.length > 0 ? trendingHashtags : localHashtags;

  const filtered = displayHashtags.filter((h) =>
    h.tag.toLowerCase().includes(search.toLowerCase()) ||
    h.description?.toLowerCase().includes(search.toLowerCase())
  );

  const followed = followedHashtags.map((h) => h.id);

  const handleFollow = (hashtagId: string) => {
    if (followed.includes(hashtagId)) {
      unfollowHashtag(hashtagId, user?.id || '');
      setLocalHashtags((prev) => prev.map((h) => h.id === hashtagId ? { ...h, followers: h.followers.filter((f) => f !== user?.id) } : h));
    } else {
      followHashtag(hashtagId, user?.id || '');
      setLocalHashtags((prev) => prev.map((h) => h.id === hashtagId ? { ...h, followers: [...h.followers, user?.id || ''] } : h));
    }
  };

  const isFollowing = (id: string) => followed.includes(id) || localHashtags.find((h) => h.id === id)?.followers?.includes(user?.id || '');

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
            {filtered
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
            {filtered.map((hashtag, idx) => (
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
