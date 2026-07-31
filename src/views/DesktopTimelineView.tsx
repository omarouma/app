import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Clock, Image, Plus, X, Loader, MessageSquare } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { isFirestoreAvailable, addDocToCollection, deleteDocById, subscribeToCollection, COLLECTIONS } from '@/lib/firestore';
import { toast } from 'sonner';
import TimelineCard from '@/components/features/timeline/TimelineCard';
import EmptyState from '@/components/EmptyState';
import type { TimelinePost, PostComment } from '@/types';
import { orderBy } from '@/lib/firestore';

type FirestoreTimestamp = { toDate: () => Date };
function isFirestoreTs(val: unknown): val is FirestoreTimestamp {
  return typeof val === 'object' && val !== null && 'toDate' in val;
}

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

  const mapPost = useCallback((d: Record<string, unknown>): TimelinePost => {
    const rawTs = d.timestamp;
    let timestamp: Date;
    if (isFirestoreTs(rawTs)) {
      timestamp = rawTs.toDate();
    } else if (rawTs) {
      timestamp = new Date(rawTs as string | number | Date);
    } else {
      timestamp = new Date();
    }
    return {
      id: d.id as string,
      userId: (d.userId as string) || (d.user_id as string) || '',
      content: (d.content as string) || '',
      images: (d.images as string[]) || [],
      likes: (d.likes as string[]) || [],
      comments: (d.comments as PostComment[]) || [],
      shares: (d.shares as string[]) || [],
      timestamp,
      visibility: (d.visibility as TimelinePost['visibility']) || 'public',
      userName: (d.userName as string) || (d.user_name as string) || (d as Record<string, Record<string, string>>).users?.name || 'User',
      userAvatar: (d.userAvatar as string) || (d.user_avatar as string) || (d as Record<string, Record<string, string>>).users?.avatar || '',
    };
  }, []);

  useEffect(() => {
    if (!isFirestoreAvailable()) {
      setLoading(false);
      return;
    }
    const unsubscribe = subscribeToCollection(COLLECTIONS.POSTS, [orderBy('timestamp', 'desc')], (data) => {
      const list: TimelinePost[] = (data || []).map(mapPost);
      setPosts(list);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [mapPost]);

  const handlePost = async () => {
    if (!user || (!content.trim() && images.length === 0) || posting) return;
    setPosting(true);
    if (isFirestoreAvailable()) {
      try {
        await addDocToCollection(COLLECTIONS.POSTS, {
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
      await deleteDocById(COLLECTIONS.POSTS, postId);
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
