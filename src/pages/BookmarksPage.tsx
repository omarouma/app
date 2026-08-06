import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useEnhancedTimelineStore } from '@/store/useEnhancedTimelineStore';
import { Bookmark, Search, Plus, Folder, Clock, Heart, X, Image } from 'lucide-react';
import { getDefaultAvatar } from '@/lib/utils';

export default function BookmarksPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
const { savedPosts, loading: loadingSaved, getSavedPosts, bookmarkCollections, createCollection } = useEnhancedTimelineStore();
  const [search, setSearch] = useState('');
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'most_liked'>('newest');

  useEffect(() => {
    if (user?.id) getSavedPosts(user.id);
  }, [user?.id, getSavedPosts]);

  const filtered = savedPosts.filter((p) => {
    const match = search.toLowerCase();
    return (
      p.content.toLowerCase().includes(match) ||
      p.userName?.toLowerCase().includes(match) ||
      p.hashtags?.some((h) => h.toLowerCase().includes(match))
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'newest') return b.timestamp.getTime() - a.timestamp.getTime();
    if (sortBy === 'oldest') return a.timestamp.getTime() - b.timestamp.getTime();
    if (sortBy === 'most_liked') return (b.likes?.length || 0) - (a.likes?.length || 0);
    return 0;
  });

  const handleCreateCollection = () => {
    if (!newCollectionName.trim() || !user?.id) return;
    createCollection(user.id, newCollectionName.trim());
    setNewCollectionName('');
    setShowCreateModal(false);
  };

  return (
    <div className="min-h-[100dvh] bg-white">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 z-10 px-4 py-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full">
            <X size={20} className="text-gray-500" />
          </button>
          <h1 className="font-bold text-lg text-gray-900">Saved Posts</h1>
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
            placeholder="Search saved posts..."
            className="w-full pl-9 pr-3 py-2.5 bg-gray-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#00C300]/20"
          />
        </div>
      </div>

      {/* Collections */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button type="button" onClick={() => setActiveCollection(null)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${activeCollection === null ? 'bg-[#00C300] text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            <Bookmark size={12} /> All ({savedPosts.length})
          </button>
          <button type="button" onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <Plus size={12} /> New Collection
          </button>
          {bookmarkCollections.map((c) => (
            <button type="button" key={c.id}
              onClick={() => setActiveCollection(c.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${activeCollection === c.id ? 'bg-[#00C300] text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              <Folder size={12} /> {c.name} ({c.count})
            </button>
          ))}
        </div>
      </div>

      {/* Sort */}
      <div className="px-4 pb-2 flex items-center gap-2">
        <span className="text-xs text-gray-400">Sort by:</span>
        {(['newest', 'oldest', 'most_liked'] as const).map((s) => (
          <button type="button" key={s}
            onClick={() => setSortBy(s)}
            className={`text-xs px-2 py-1 rounded-full transition-colors ${sortBy === s ? 'bg-[#00C300]/10 text-[#00C300]' : 'text-gray-400 hover:text-gray-600'}`}
          >
            {s === 'most_liked' ? 'Most Liked' : s === 'newest' ? 'Newest' : 'Oldest'}
          </button>
        ))}
      </div>

      {/* Saved posts */}
      <div className="px-4 pb-8">
        {loadingSaved ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-[#00C300] rounded-full animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16">
            <Bookmark size={48} className="mx-auto text-gray-200 mb-4" />
            <p className="text-gray-400 font-medium">No saved posts yet</p>
            <p className="text-gray-300 text-sm mt-1">Save posts from your timeline to view them here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((post) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-gray-100 rounded-xl p-3 cursor-pointer hover:shadow-sm transition-shadow"
                onClick={() => navigate(`/timeline`)}
              >
                <div className="flex items-start gap-3">
                  {post.images?.[0] ? (
                    <div className="w-16 h-16 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                      <img src={post.images[0]} alt="Post image" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <Image size={20} className="text-gray-300" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 line-clamp-2">{post.content}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="w-5 h-5 rounded-full bg-gray-200 overflow-hidden">
                        <img src={post.userAvatar || getDefaultAvatar(post.userName || 'U')} alt="User avatar" className="w-full h-full object-cover" />
                      </div>
                      <span className="text-xs text-gray-500">{post.userName || 'User'}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-400 flex items-center gap-0.5">
                        <Clock size={10} /> {post.timestamp.toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Heart size={12} /> {post.likes?.length || 0}
                      </span>
                      <span className="text-xs text-gray-400">
                        {post.comments?.length || 0} comments
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Create collection modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-5 w-full max-w-sm"
            >
              <h3 className="font-bold text-gray-900 mb-3">New Collection</h3>
              <input
                type="text"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder="Collection name..."
                className="w-full px-3 py-2.5 bg-gray-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#00C300]/20 mb-4"
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCollection(); }}
                autoFocus
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-100"
                >
                  Cancel
                </button>
                <button type="button" onClick={handleCreateCollection}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white bg-[#00C300]"
                >
                  Create
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
