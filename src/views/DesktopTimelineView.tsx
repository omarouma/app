/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, Image, Plus, X, Loader, MessageSquare } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { isFirestoreAvailable, queryCollection, addDocToCollection, deleteDocById, subscribeToCollection } from '@/lib/firestore';
import { toast } from 'sonner';
import TimelineCard from '@/components/features/timeline/TimelineCard';
import EmptyState from '@/components/EmptyState';
import type { TimelinePost } from '@/types';
import { orderBy } from '@/lib/firestore';

export default function DesktopTimelineView() {
  const { user } = useAuthStore();
  const [posts, setPosts] = useState<TimelinePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [visibility, setVisibility] = useState<'public' | 'friends' | 'private'>('public');

  const fetchPosts = async () => {
    if (!isFirestoreAvailable()) {
      setLoading(false);
      return;
    }
    try {
      const data = await queryCollection('posts', [orderBy('timestamp', 'desc')]);
      const list: TimelinePost[] = (data || []).map((d: any) => ({
        id: d.id,
        userId: d.userId || d.user_id,
        content: d.content || '',
        images: d.images || [],
        likes: d.likes || [],
        comments: d.comments || [],
        shares: d.shares || [],
        timestamp: d.timestamp ? new Date(d.timestamp) : new Date(),
        visibility: d.visibility || 'public',
        userName: d.userName || d.user_name || d.users?.name,
        userAvatar: d.userAvatar || d.user_avatar || d.users?.avatar,
      }));
      setPosts(list);
    } catch {
      setPosts([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPosts();
    if (!isFirestoreAvailable()) return;
    const unsubscribe = subscribeToCollection('posts', [orderBy('timestamp', 'desc')], () => fetchPosts());
    return () => unsubscribe();
  }, [user?.id]);

  const handlePost = async () => {
    if (!user || (!content.trim() && images.length === 0) || posting) return;
    setPosting(true);
    if (isFirestoreAvailable()) {
      try {
        await addDocToCollection('posts', {
          userId: user.id,
          userName: user.name || user.displayName || 'User',
          userAvatar: user.avatar || '',
          content: content.trim(),
          images,
          likes: [],
          timestamp: new Date().toISOString(),
          visibility,
        });
      } catch {
        toast.error('Failed to post');
        setPosting(false);
        return;
      }
    }
    setContent('');
    setImages([]);
    setVisibility('public');
    setShowComposer(false);
    setPosting(false);
  };

  const handleDelete = async (postId: string) => {
    if (!isFirestoreAvailable()) return;
    try {
      await deleteDocById('posts', postId);
    } catch {
      toast.error('Failed to delete post');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        const { uploadMediaBlob } = await import('@/lib/storage');
        const url = await uploadMediaBlob({ kind: 'posts', file });
        setImages(prev => [...prev, url]);
      } catch (err) { console.error(err); }
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="shrink-0 p-4 border-b border-[#EBEBEB] flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#111111] flex items-center gap-2">
          <Clock size={20} className="text-[#00C300]" /> Timeline
        </h1>
        <button type="button" onClick={() => setShowComposer(!showComposer)}
          className="flex items-center gap-2 px-4 py-2 bg-[#00C300] text-white text-sm font-medium rounded-full hover:bg-[#00A300] transition-colors"
        >
          {showComposer ? <X size={16} /> : <Plus size={16} />}
          {showComposer ? 'Close' : 'New Post'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {/* Composer */}
        {showComposer && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b border-[#EBEBEB] p-4 bg-[#F5F5F5]"
          >
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="What's on your mind?"
              className="w-full bg-white rounded-xl p-3 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300] resize-none min-h-[80px] placeholder:text-[#8D8D8D]"
            />
            {images.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {images.map((img, i) => (
                  <div key={i} className="relative">
                    <img src={img} className="w-16 h-16 rounded-lg object-cover" alt="Cover image" />
                    <button type="button" onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-[#FF3B30] text-white rounded-full text-[10px] flex items-center justify-center"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="p-2 rounded-full hover:bg-white text-[#00C300] transition-colors"
                >
                  <Image size={18} />
                </button>
                <select
                  value={visibility}
                  onChange={e => setVisibility(e.target.value as 'public' | 'friends' | 'private')}
                  className="bg-white rounded-full px-3 py-1.5 text-xs text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                >
                  <option value="public">🌍 Public</option>
                  <option value="friends">👥 Friends</option>
                  <option value="private">🔒 Only Me</option>
                </select>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
              <button type="button" onClick={handlePost}
                disabled={(!content.trim() && images.length === 0) || posting}
                className="bg-[#00C300] hover:bg-[#00A300] disabled:opacity-50 text-white rounded-full px-6 py-2 text-sm font-bold transition-colors flex items-center gap-2"
              >
                {posting ? <Loader size={14} className="animate-spin" /> : null}
                Post
              </button>
            </div>
          </motion.div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center h-64">
            <Loader size={24} className="animate-spin text-[#00C300] mb-2" />
            <p className="text-[#8D8D8D] text-sm">Loading timeline...</p>
          </div>
        ) : posts.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No posts yet"
            description="Be the first to share something with your friends!"
            action={
              <button type="button" onClick={() => setShowComposer(true)}
                className="bg-[#00C300] text-white text-sm font-medium px-4 py-2 rounded-full hover:bg-[#00A300] transition-colors"
              >
                Create Post
              </button>
            }
          />
        ) : (
          <div className="max-w-xl mx-auto space-y-4 p-4">
            {posts.map((post, i) => (
              <TimelineCard
                key={post.id}
                post={post}
                index={i}
                onDelete={handleDelete}
                userName={post.userName || 'User'}
                userAvatar={post.userAvatar}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
