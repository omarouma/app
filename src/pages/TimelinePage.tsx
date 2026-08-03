import type { PostPollData, PostComment, TimelinePost } from '@/types';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Image, Plus, X, Loader, Globe, Users, Lock, RefreshCw, Camera, TrendingUp, Sparkles,
  Search, ArrowRight, Share2, Heart, Play, Hash, Film, Flame, List, Radio, Flag, Vote, Copy, Youtube
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useReelStore } from '@/store/useReelStore';
import {
  isFirestoreAvailable, COLLECTIONS, addDocToCollection,
  updateDocById, deleteDocById, subscribeToCollection, serverTimestamp
} from '@/lib/firestore';
import { where, orderBy, limit, startAfter, queryCollection } from '@/lib/firestore';
import TimelineCard from '@/components/features/timeline/TimelineCard';
import BottomNav from '@/components/layout/BottomNav';
import EmptyState from '@/components/EmptyState';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import { FeedAd } from '@/components/GoogleAd';
import RequestTipModal from '@/components/RequestTipModal';
import FeedReelsViewer from '@/components/features/feed/FeedReelsViewer';
import YouTubeFeed from '@/components/features/feed/YouTubeFeed';
import { toast } from 'sonner';
import { getDefaultAvatar } from '@/lib/utils';

type Visibility = 'public' | 'friends' | 'private' | 'followers' | 'groups' | 'custom' | 'close_friends';

const visibilityOptions: { key: Visibility; label: string; icon: typeof Globe }[] = [
  { key: 'public', label: 'Public', icon: Globe },
  { key: 'friends', label: 'Friends', icon: Users },
  { key: 'private', label: 'Only Me', icon: Lock },
  { key: 'followers', label: 'Followers', icon: Users },
  { key: 'close_friends', label: 'Close Friends', icon: Users },
];

export default function TimelinePage() {
  const { user } = useAuthStore();
  const { friends, subscribeFriends, getSuggestedFriends } = useFriendStore();
  const { reels, getReels } = useReelStore();
  const navigate = useNavigate();

  const [posts, setPosts] = useState<TimelinePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [feedFilter, setFeedFilter] = useState<'all' | 'public' | 'friends' | 'mine'>('all');

  // ─── Deduplication: track seen post IDs ──────────────────────────────
  const seenPostIdsRef = useRef<Set<string>>(new Set());

  // ─── Cursor-based pagination ─────────────────────────────────────────
  const POSTS_PER_PAGE = 20;
  const [cursor, setCursor] = useState<Date | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [postSearch, setPostSearch] = useState('');
  const [showPostSearch, setShowPostSearch] = useState(false);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [viewerImage, setViewerImage] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharePost, setSharePost] = useState<TimelinePost | null>(null);
  const [showPollComposer, setShowPollComposer] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportPost, setReportPost] = useState<TimelinePost | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [showReelsStrip] = useState(true);
  const [showTrending] = useState(true);
  const [suggestedUsers, setSuggestedUsers] = useState<Array<{ id: string; name: string; avatar?: string; username?: string }>>([]);
  const [editingPost, setEditingPost] = useState<TimelinePost | null>(null);
  const [tipTarget, setTipTarget] = useState<{ userId: string; userName: string; userAvatar?: string; postId: string } | null>(null);

  // New posts indicator state
  const [lastSeenPostTime, setLastSeenPostTime] = useState<number>(Date.now());
  const [newPostsCount, setNewPostsCount] = useState(0);
  const [isAtTop, setIsAtTop] = useState(true);

  // Feed tab: 'feed' | 'reels' | 'stories' | 'videos'
  const [feedTab, setFeedTab] = useState<'feed' | 'reels' | 'stories' | 'videos'>('feed');
  const [showReelsViewer, setShowReelsViewer] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const storyFileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Map raw DB data to TimelinePost ──────────────────────────────────
  const mapPost = useCallback((d: Record<string, unknown>, uid: string | undefined): TimelinePost => ({
    id: d.id as string,
    userId: d.userId as string,
    content: (d.content as string) || '',
    images: (d.images as string[]) || [],
    likes: (d.likes as string[]) || [],
    comments: (d.comments as PostComment[]) || [],
    shares: (d.shares as string[]) || [],
    timestamp: (() => {
      const ts = d.timestamp;
      if (ts && typeof ts === 'object' && 'toDate' in ts && typeof (ts as { toDate(): Date }).toDate === 'function') {
        return (ts as { toDate(): Date }).toDate();
      }
      return new Date(ts as string | number);
    })(),
    visibility: (d.visibility as TimelinePost['visibility']) || 'public',
    pollData: (d.pollData as PostPollData) || undefined,
    userName: (d.userName as string) || (d.userId === uid ? user?.name : 'User'),
    userAvatar: (d.userAvatar as string) || (d.userId === uid ? user?.avatar : undefined),
  }), [user?.name, user?.avatar]);

  // ── Real-time post subscription with deduplication ─────────────────
  useEffect(() => {
    if (!isFirestoreAvailable() || !user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const unsub = subscribeToCollection(
      COLLECTIONS.POSTS,
      [orderBy('timestamp', 'desc'), limit(POSTS_PER_PAGE)],
      (data) => {
        const list: TimelinePost[] = (data || [])
          .map((d: Record<string, unknown>) => mapPost(d, user.id));
        
        // Deduplication: skip already-seen post IDs
        const unique: TimelinePost[] = [];
        for (const post of list) {
          if (!seenPostIdsRef.current.has(post.id)) {
            seenPostIdsRef.current.add(post.id);
            unique.push(post);
          }
        }

        setPosts(prev => {
          // Merge: keep existing (not in new batch) + new unique posts
          const existingIds = new Set(prev.map(p => p.id));
          const merged = [...unique.filter(p => !existingIds.has(p.id)), ...prev];
          // Sort by timestamp desc
          merged.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
          return merged;
        });
        
        // Update cursor for pagination
        if (list.length > 0) {
          const oldest = list[list.length - 1];
          setCursor(oldest.timestamp instanceof Date ? oldest.timestamp : new Date(oldest.timestamp));
        }
        setHasMore(list.length >= POSTS_PER_PAGE);
        setLoading(false);
        setLoadingMore(false);
      },
    );
    const seenIds = seenPostIdsRef.current;
    return () => { unsub(); seenIds.clear(); };
  }, [user?.id, mapPost]);

  // ── Post view tracking via IntersectionObserver ───────────────────
  const viewedPostIdsRef = useRef<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const recordViewRef = useRef<(postId: string) => void>(() => {});

  useEffect(() => {
    if (!isFirestoreAvailable()) return;

    // Pre-bind the view recording function to avoid dynamic requires
    recordViewRef.current = async (postId: string) => {
      try {
        const { increment: inc } = await import('@/lib/firestore');
        const { updateDocById: update, COLLECTIONS: cols } = await import('@/lib/firestore');
        await update(cols.POSTS, postId, { viewCount: inc(1) });
      } catch { /* ignore view tracking errors */ }
    };

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const postId = entry.target.getAttribute('data-post-id');
            if (postId && !viewedPostIdsRef.current.has(postId)) {
              viewedPostIdsRef.current.add(postId);
              recordViewRef.current(postId);
            }
          }
        });
      },
      { threshold: 0.5, rootMargin: '0px 0px -100px 0px' },
    );

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, []);

  // Attach observer to post elements when posts change
  useEffect(() => {
    if (!observerRef.current || loading) return;
    const timer = setTimeout(() => {
      document.querySelectorAll('[data-post-id]').forEach(el => {
        observerRef.current?.observe(el);
      });
    }, 100);
    return () => clearTimeout(timer);
  }, [posts, loading]);

  // ── Cursor-based load more ────────────────────────────────────────
  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !cursor) return;
    setLoadingMore(true);
    try {
      const data = await queryCollection(COLLECTIONS.POSTS, [
        orderBy('timestamp', 'desc'),
        startAfter(cursor),
        limit(POSTS_PER_PAGE),
      ]);
      const list: TimelinePost[] = (data || []).map((d: Record<string, unknown>) => mapPost(d, user?.id));
      
      // Deduplicate
      const unique: TimelinePost[] = [];
      for (const post of list) {
        if (!seenPostIdsRef.current.has(post.id)) {
          seenPostIdsRef.current.add(post.id);
          unique.push(post);
        }
      }
      
      setPosts(prev => [...prev, ...unique]);
      if (list.length > 0) {
        setCursor(list[list.length - 1].timestamp);
      }
      setHasMore(list.length >= POSTS_PER_PAGE);
    } catch {
      toast.error('Failed to load more posts');
    }
    setLoadingMore(false);
  }, [loadingMore, hasMore, cursor, mapPost, user?.id]);

  // Cleanup refresh timeout
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, []);

  // Track scroll position and new posts
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      setIsAtTop(el.scrollTop < 50);
      if (el.scrollTop < 50 && newPostsCount > 0) {
        setNewPostsCount(0);
        setLastSeenPostTime(Date.now());
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [newPostsCount]);

  // Detect new posts while scrolled down
  useEffect(() => {
    if (posts.length === 0 || isAtTop) {
      setLastSeenPostTime(Date.now());
      setNewPostsCount(0);
      return;
    }

    const newestPost = posts[0];
    const newestTime = newestPost.timestamp instanceof Date ? newestPost.timestamp.getTime() : new Date(newestPost.timestamp).getTime();

    if (newestTime > lastSeenPostTime) {
      const count = posts.filter(p => {
        const t = p.timestamp instanceof Date ? p.timestamp.getTime() : new Date(p.timestamp).getTime();
        return t > lastSeenPostTime;
      }).length;

      setNewPostsCount(count);

      // Signal: new timeline posts while user is not at top (keeps it real-time).
      if (count > 0) {
        import('@/lib/sounds')
          .then(({ safePlay, playTimelineNotification, vibrateNotification }) => {
            safePlay(playTimelineNotification, vibrateNotification);
          })
          .catch(() => {
            // ignore
          });
      }
    }
  }, [posts, isAtTop, lastSeenPostTime]);



  const handleScrollToTop = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setNewPostsCount(0);
    setLastSeenPostTime(Date.now());
  };
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('share') === 'true') {
      setShowComposer(true);
      if ('caches' in window) {
        caches.match('/shared-data').then((response) => {
          if (response) {
            response.json().then((data) => {
              const text = [data.title, data.text, data.url].filter(Boolean).join(' ');
              if (text) setContent(text);
              caches.delete('/shared-data');
            }).catch(() => {});
          }
        }).catch(() => {});
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeFriends(user.id);
    return () => unsub();
  }, [user?.id, subscribeFriends]);

  // Fetch reels for the strip
  useEffect(() => {
    getReels(15);
  }, [getReels]);

  // Fetch suggested friends
  useEffect(() => {
    if (user?.id) {
      getSuggestedFriends(user.id).then((users) => {
        setSuggestedUsers(users.slice(0, 6));
      }).catch(() => {});
    }
  }, [user?.id, getSuggestedFriends]);

  // Real stories from Firestore with real-time subscription
  const [stories, setStories] = useState<Array<{ id: string; user_id: string; name: string; avatar: string | undefined; media_url: string; type: string; caption: string; isMine: boolean }>>([]);
  const [viewingStory, setViewingStory] = useState<typeof stories[number] | null>(null);
  const STORY_DURATION = 5000;
  const closeStory = () => setViewingStory(null);

  // Real-time stories subscription — memoize friendIds to prevent subscription churn
  const friendIds = useMemo(() => friends.map(f => f.id), [friends]);
  useEffect(() => {
    if (!isFirestoreAvailable() || !user?.id) return;
    const allIds = [user.id, ...friendIds];
    const unsub = subscribeToCollection(COLLECTIONS.STORIES, [where('userId', 'in', allIds), orderBy('timestamp', 'desc')], (data) => {
      const list = (data || []).map((d: Record<string, unknown>) => ({
        id: d.id as string,
        user_id: d.userId as string,
        name: (d.userName as string) || (d.userId === user.id ? 'My Story' : 'Friend'),
        avatar: d.userAvatar as string | undefined,
        media_url: (d.mediaUrl as string) || '',
        type: (d.type as string) || 'image',
        caption: '',
        isMine: d.userId === user.id,
      }));
      setStories(list);
    });
    return () => unsub();
  }, [user?.id, friendIds]);

  // Auto-advance stories
  useEffect(() => {
    if (!viewingStory) return;
    const timer = setTimeout(() => {
      const idx = stories.indexOf(viewingStory);
      if (idx < stories.length - 1) {
        setViewingStory(stories[idx + 1]);
      } else {
        closeStory();
      }
    }, STORY_DURATION);
    return () => clearTimeout(timer);
  }, [viewingStory, stories]);

  const handleStoryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    setUploading(true);
    try {
      const { uploadMediaBlob } = await import('@/lib/storage');
      const url = await uploadMediaBlob({ kind: 'stories', file, mimeType: file.type });
      await addDocToCollection(COLLECTIONS.STORIES, {
        userId: user.id,
        mediaUrl: url,
        type: file.type.startsWith('video') ? 'video' : 'image',
        viewedBy: [],
        timestamp: new Date().toISOString(),
      });
      toast.success('Story added!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to upload story');
    } finally {
      setUploading(false);
      if (storyFileInputRef.current) storyFileInputRef.current.value = '';
    }
  };

  const handlePost = async () => {
    if (!user || (!content.trim() && images.length === 0 && !pollQuestion.trim())) return;
    setUploading(true);
    try {
      if (isFirestoreAvailable()) {
        const payload: Record<string, unknown> = {
          userId: user.id,
          content: content.trim(),
          images,
          likes: [],
          timestamp: serverTimestamp(),
          visibility,
          userName: user.name || '',
          userAvatar: user.avatar || '',
        };
        if (pollQuestion.trim() && pollOptions.filter(o => o.trim()).length >= 2) {
          payload.pollData = {
            question: pollQuestion.trim(),
            options: pollOptions.filter(o => o.trim()).map(o => ({ text: o.trim(), votes: [] })),
          };
        }
        await addDocToCollection(COLLECTIONS.POSTS, payload);
      }
      setContent('');
      setImages([]);
      setVisibility('public');
      setPollQuestion('');
      setPollOptions(['', '']);
      setShowComposer(false);
      setShowPollComposer(false);
      toast.success('Post shared!');
    } catch {
      toast.error('Failed to post');
    } finally {
      setUploading(false);
    }
  };

  const handleEditPost = async () => {
    if (!editingPost || !user) return;
    try {
      if (isFirestoreAvailable()) {
        await updateDocById(COLLECTIONS.POSTS, editingPost.id, {
          content: content.trim(),
          visibility,
          images: editingPost.images || [],
        });
      }
      setContent('');
      setVisibility('public');
      setEditingPost(null);
      toast.success('Post updated');
    } catch {
      toast.error('Failed to update post');
    }
  };

  const handleDelete = async (postId: string) => {
    if (!isFirestoreAvailable()) return;
    try {
      await deleteDocById(COLLECTIONS.POSTS, postId);
      toast.success('Post deleted');
    } catch {
      toast.error('Failed to delete post');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + images.length > 4) {
      toast.error('Max 4 images per post');
      return;
    }
    setUploading(true);
    try {
      const { uploadMediaBlob } = await import('@/lib/storage');
      const urls: string[] = [];
      for (const file of files) {
        const url = await uploadMediaBlob({ kind: 'posts', file, mimeType: file.type });
        urls.push(url);
      }
      setImages(prev => [...prev, ...urls]);
    } catch {
      toast.error('Failed to upload images');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleShare = (post: TimelinePost) => {
    setSharePost(post);
    setShowShareModal(true);
  };

  const handleReport = (post: TimelinePost) => {
    setReportPost(post);
    setShowReportModal(true);
  };

  const submitReport = async () => {
    if (!reportReason.trim() || !reportPost || !user?.id) return;
    try {
      if (isFirestoreAvailable()) {
        await addDocToCollection(COLLECTIONS.USER_REPORTS ?? 'user_reports', {
          reporterId: user.id,
          reportedPostId: reportPost.id,
          reportedUserId: reportPost.userId,
          reason: reportReason.trim(),
          status: 'pending',
          timestamp: serverTimestamp(),
        });
      }
      toast.success('Report submitted. Thank you for helping keep GaGa Chat safe.');
    } catch {
      toast.error('Failed to submit report');
    }
    setReportReason('');
    setShowReportModal(false);
    setReportPost(null);
  };

  // Extract trending hashtags from posts
  const trendingTopics = useMemo(() => {
    const hashtagRegex = /#(\w+)/g;
    const counts = new Map<string, number>();
    posts.forEach(post => {
      const matches = post.content?.match(hashtagRegex);
      if (matches) {
        matches.forEach(tag => {
          counts.set(tag, (counts.get(tag) || 0) + 1);
        });
      }
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag);
  }, [posts]);

  const filteredPosts = posts.filter(p => {
    if (feedFilter === 'public' && p.visibility !== 'public') return false;
    if (feedFilter === 'friends' && p.visibility !== 'friends') return false;
    if (feedFilter === 'mine' && p.userId !== user?.id) return false;
    if (postSearch) {
      const term = postSearch.toLowerCase();
      return (p.content || '').toLowerCase().includes(term) || (p.userName || '').toLowerCase().includes(term);
    }
    return true;
  });

  // Auto-load more posts on scroll near bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (loading || loadingMore || !hasMore) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollTop + clientHeight >= scrollHeight - 200) {
        handleLoadMoreRef.current();
      }
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [loading, loadingMore, hasMore]);

  const handleLoadMoreRef = useRef(handleLoadMore);
  handleLoadMoreRef.current = handleLoadMore;

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    // Clear dedup cache and reset cursor for fresh load
    seenPostIdsRef.current.clear();
    setCursor(null);
    setHasMore(true);
    refreshTimeoutRef.current = setTimeout(() => setRefreshing(false), 1000);
  };

  // If showing full reels viewer, render it
  if (showReelsViewer) {
    return (
      <div className="h-full flex flex-col">
        <FeedReelsViewer onClose={() => setShowReelsViewer(false)} />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0d0d0d]">
      {/* Header with Tabs */}
      <div className="shrink-0 px-4 py-3 border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-white">GaGa Feed</h1>
            <button type="button" onClick={handleRefresh} className="p-1.5 rounded-lg hover:bg-[#1a1a1a] text-[#8D8D8D]">
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowPostSearch(!showPostSearch)} className="p-2 rounded-lg hover:bg-[#1a1a1a] text-[#8D8D8D]">
              <Search size={18} />
            </button>
            <button type="button" onClick={() => { setShowComposer(true); setEditingPost(null); setContent(''); setImages([]); setVisibility('public'); }} className="p-2 rounded-lg bg-[#00C300] text-black hover:bg-[#00C300]/90">
              <Plus size={18} />
            </button>
          </div>
        </div>

        {/* Top-level tabs: Feed / Reels / Stories / Videos */}
        <div className="flex gap-2">
          {[
            { key: 'feed' as const, label: 'Feed', icon: Flame },
            { key: 'reels' as const, label: 'Reels', icon: Film },
            { key: 'stories' as const, label: 'Stories', icon: Radio },
            { key: 'videos' as const, label: 'Videos', icon: Youtube },
          ].map(t => {
            const Icon = t.icon;
            const isActive = feedTab === t.key;
            return (
              <button
                type="button"
                key={t.key}
                onClick={() => {
                  if (t.key === 'reels') {
                    setShowReelsViewer(true);
                  } else {
                    setFeedTab(t.key);
                  }
                }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  isActive && t.key !== 'reels'
                    ? 'bg-[#00C300] text-black'
                    : t.key === 'reels'
                    ? 'bg-[#FF4081]/20 text-[#FF4081] hover:bg-[#FF4081]/30'
                    : t.key === 'videos'
                    ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
                    : 'bg-[#1a1a1a] text-[#8D8D8D] hover:text-white'
                }`}
              >
                <Icon size={16} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search bar */}
      <AnimatePresence>
        {showPostSearch && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-4 py-2 border-b border-[#1a1a1a]">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]" />
                <input
                  type="text"
                  placeholder="Search posts..."
                  value={postSearch}
                  onChange={e => setPostSearch(e.target.value)}
                  className="w-full bg-[#1a1a1a] text-white pl-10 pr-4 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Feed filter (only in feed tab) */}
      {feedTab === 'feed' && (
        <div className="shrink-0 flex gap-1 px-4 py-2 overflow-x-auto border-b border-[#1a1a1a]">
          {(['all', 'public', 'friends', 'mine'] as const).map(f => (
            <button type="button" key={f}
              onClick={() => setFeedFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                feedFilter === f ? 'bg-[#00C300] text-black' : 'bg-[#1a1a1a] text-[#8D8D8D]'
              }`}
            >
              {f === 'all' ? 'All' : f === 'public' ? 'Public' : f === 'friends' ? 'Friends' : 'My Posts'}
            </button>
          ))}
        </div>
      )}

      {/* Scrollable content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {/* === STORIES TAB === */}
        {feedTab === 'stories' && (
          <div className="px-4 py-6 space-y-6">
            {/* Add story */}
            <div className="flex flex-col items-center gap-2 mb-6">
              <button
                type="button"
                onClick={() => storyFileInputRef.current?.click()}
                className="w-20 h-20 rounded-full border-2 border-dashed border-[#00C300] flex items-center justify-center bg-[#1a1a1a]"
              >
                <Camera size={28} className="text-[#00C300]" />
              </button>
              <span className="text-[#8D8D8D] text-xs">Add Story</span>
              <input type="file" ref={storyFileInputRef} accept="image/*,video/*" className="hidden" onChange={handleStoryUpload} />
            </div>

            {/* Stories grid */}
            {stories.length === 0 ? (
              <EmptyState icon={Camera} title="No stories yet" description="Add your first story to share with friends!" />
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {stories.map(story => (
                  <button
                    type="button"
                    key={story.id}
                    onClick={() => setViewingStory(story)}
                    className="relative aspect-[3/4] rounded-xl overflow-hidden group"
                  >
                    {story.type === 'video' ? (
                      <video src={story.media_url} className="w-full h-full object-cover" muted />
                    ) : (
                      <img src={story.media_url} alt="Story" className="w-full h-full object-cover" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <div className="absolute top-2 left-2">
                      <div className={`w-8 h-8 rounded-full p-0.5 ${story.isMine ? 'bg-[#00C300]' : 'bg-gradient-to-tr from-[#00C300] to-[#00FF00]'}`}>
                        <img src={story.avatar || getDefaultAvatar(story.user_id)} alt="" className="w-full h-full rounded-full object-cover bg-[#1a1a1a]" />
                      </div>
                    </div>
                    <div className="absolute bottom-2 left-2 right-2">
                      <p className="text-white text-xs font-medium truncate">{story.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* === FEED TAB === */}
        {feedTab === 'feed' && (
          <>
            {/* Stories Strip */}
            <div className="shrink-0 px-4 py-3">
              <div className="flex gap-3 overflow-x-auto pb-2">
                {/* Add story */}
                <button type="button" onClick={() => storyFileInputRef.current?.click()} className="shrink-0 flex flex-col items-center gap-1">
                  <div className="w-16 h-16 rounded-full border-2 border-dashed border-[#00C300] flex items-center justify-center bg-[#1a1a1a]">
                    <Camera size={20} className="text-[#00C300]" />
                  </div>
                  <span className="text-[10px] text-[#8D8D8D]">Add Story</span>
                </button>
                {stories.map(story => (
                  <button type="button" key={story.id} onClick={() => setViewingStory(story)} className="shrink-0 flex flex-col items-center gap-1">
                    <div className={`w-16 h-16 rounded-full p-0.5 ${story.isMine ? 'bg-[#00C300]' : 'bg-gradient-to-tr from-[#00C300] to-[#00FF00]'}`}>
                      <img src={story.avatar || getDefaultAvatar(story.user_id)} alt={story.name} className="w-full h-full rounded-full object-cover bg-[#1a1a1a]" />
                    </div>
                    <span className="text-[10px] text-[#8D8D8D] truncate max-w-[64px]">{story.name}</span>
                  </button>
                ))}
              </div>
              <input type="file" ref={storyFileInputRef} accept="image/*,video/*" className="hidden" onChange={handleStoryUpload} />
            </div>

            {/* Reels Strip */}
            {reels.length > 0 && showReelsStrip && (
              <div className="shrink-0 px-4 py-2 border-b border-[#1a1a1a]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Film size={16} className="text-[#FF4081]" />
                    <h2 className="text-sm font-semibold text-white">Reels</h2>
                  </div>
                  <button type="button" onClick={() => setShowReelsViewer(true)} className="text-xs text-[#FF4081] flex items-center gap-1">
                    Watch all <ArrowRight size={12} />
                  </button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {reels.slice(0, 10).map((reel) => (
                    <button
                      type="button"
                      key={reel.id}
                      onClick={() => setShowReelsViewer(true)}
                      className="shrink-0 relative w-28 h-40 rounded-xl overflow-hidden group"
                    >
                      {reel.thumbnailUrl ? (
                        <img
                          src={reel.thumbnailUrl}
                          alt={reel.caption || 'Reel'}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d] flex items-center justify-center">
                          <Play size={24} className="text-white/50" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                      <div className="absolute bottom-2 left-2 right-2">
                        <p className="text-white text-xs font-medium truncate">{reel.userName || 'User'}</p>
                        <p className="text-white/70 text-[10px] truncate">{reel.caption || 'Reel'}</p>
                      </div>
                      <div className="absolute top-2 right-2">
                        <div className="flex items-center gap-0.5 bg-black/50 rounded-full px-1.5 py-0.5">
                          <Play size={8} className="text-white" />
                          <span className="text-white text-[10px]">{reel.viewCount || 0}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => navigate('/create-reel')}
                    className="shrink-0 w-28 h-40 rounded-xl border border-dashed border-[#FF4081] flex flex-col items-center justify-center gap-2 hover:border-[#FF4081]/80 hover:bg-[#FF4081]/5 transition-colors"
                  >
                    <Plus size={24} className="text-[#FF4081]" />
                    <span className="text-[#FF4081] text-xs font-medium">Create Reel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReelsViewer(true)}
                    className="shrink-0 w-28 h-40 rounded-xl border border-dashed border-[#8D8D8D] flex flex-col items-center justify-center gap-2 hover:border-[#00C300] transition-colors"
                  >
                    <Play size={24} className="text-[#8D8D8D]" />
                    <span className="text-[#8D8D8D] text-xs">Watch all</span>
                  </button>
                </div>
              </div>
            )}

            {/* Trending Topics */}
            {trendingTopics.length > 0 && showTrending && !postSearch && (
              <div className="shrink-0 px-4 py-2 border-b border-[#1a1a1a]">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp size={14} className="text-[#00C300]" />
                  <h2 className="text-xs font-semibold text-[#8D8D8D] uppercase tracking-wider">Trending</h2>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {trendingTopics.map(tag => (
                    <button
                      type="button"
                      key={tag}
                      onClick={() => { setPostSearch(tag); setShowPostSearch(true); }}
                      className="shrink-0 px-3 py-1.5 rounded-full bg-[#1a1a1a] text-[#00C300] text-xs font-medium hover:bg-[#00C300]/10 transition-colors flex items-center gap-1"
                    >
                      <Hash size={10} /> {tag.replace('#', '')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick composer hint */}
            {!showComposer && user && (
              <div className="shrink-0 px-4 py-3 border-b border-[#1a1a1a]">
                <button
                  type="button"
                  onClick={() => { setShowComposer(true); setEditingPost(null); setContent(''); setImages([]); }}
                  className="w-full flex items-center gap-3 bg-[#1a1a1a] rounded-xl px-4 py-3 hover:bg-[#222] transition-colors"
                >
                  <img src={user.avatar || getDefaultAvatar(user.id)} alt="User avatar" className="w-9 h-9 rounded-full object-cover shrink-0" />
                  <span className="text-[#8D8D8D] text-sm flex-1 text-left">What's on your mind?</span>
                  <div className="flex items-center gap-2">
                    <Image size={18} className="text-[#8D8D8D]" />
                    <Plus size={18} className="text-[#8D8D8D]" />
                  </div>
                </button>
              </div>
            )}

            {/* Loading */}
            {loading && posts.length === 0 && <LoadingSkeleton />}

            {/* Suggested Friends - when no posts or few posts */}
            {!loading && filteredPosts.length < 3 && suggestedUsers.length > 0 && (
              <div className="shrink-0 px-4 py-4 border-b border-[#1a1a1a]">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-white">Suggested for you</h2>
                  <button type="button" onClick={() => navigate('/add-friends')} className="text-xs text-[#00C300]">See all</button>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {suggestedUsers.map(su => (
                    <div key={su.id} className="shrink-0 w-32 bg-[#1a1a1a] rounded-xl p-3 flex flex-col items-center gap-2">
                      <img src={su.avatar || getDefaultAvatar(su.id)} alt="User avatar" className="w-12 h-12 rounded-full object-cover" />
                      <p className="text-white text-xs font-medium truncate w-full text-center">{su.name}</p>
                      <p className="text-[#8D8D8D] text-[10px] truncate w-full text-center">@{su.username || 'user'}</p>
                      <button
                        type="button"
                        onClick={() => navigate('/add-friends')}
                        className="w-full py-1.5 rounded-full bg-[#00C300] text-black text-xs font-medium hover:bg-[#00C300]/90"
                      >
                        Follow
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!loading && filteredPosts.length === 0 && (
              <EmptyState icon={List} title="No posts yet" description="Be the first to share something!" />
            )}

            {/* Posts */}
            {!loading && filteredPosts.map((post, index) => (
              <div key={post.id} data-post-id={post.id}>
                <TimelineCard
                  post={post}
                  index={index}
                  onShare={() => handleShare(post)}
                  onEdit={() => { setEditingPost(post); setContent(post.content); setImages(post.images || []); setVisibility(post.visibility); setShowComposer(true); }}
                  onDelete={() => handleDelete(post.id)}
                  onImageClick={(url: string) => { setViewerImage(url); setShowImageViewer(true); }}
                  onTip={() => setTipTarget({ userId: post.userId, userName: post.userName || 'User', userAvatar: post.userAvatar, postId: post.id })}
                  onReport={() => handleReport(post)}
                  userName={post.userName}
                  userAvatar={post.userAvatar}
                />
                {index > 0 && index % 5 === 0 && (
                  <div className="px-4 py-2">
                    <FeedAd />
                  </div>
                )}
              </div>
            ))}

            {/* Load More */}
            {!loading && !loadingMore && filteredPosts.length > 0 && hasMore && (
              <div className="flex justify-center py-4">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  className="px-6 py-2 rounded-full bg-[#1a1a1a] text-[#8D8D8D] text-sm font-medium hover:bg-[#222] transition-colors"
                >
                  Load more posts
                </button>
              </div>
            )}
            {loadingMore && (
              <div className="flex justify-center py-4">
                <Loader size={18} className="animate-spin text-[#00C300]" />
              </div>
            )}

            {/* End of feed indicator */}
            {!loading && filteredPosts.length > 0 && !hasMore && (
              <div className="flex flex-col items-center py-6 gap-2">
                <div className="w-8 h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center">
                  <Sparkles size={14} className="text-[#8D8D8D]" />
                </div>
                <p className="text-[#8D8D8D] text-xs">You're all caught up!</p>
              </div>
            )}
          </>
        )}

        {/* === VIDEOS TAB === */}
        {feedTab === 'videos' && (
          <YouTubeFeed />
        )}
      </div>

      {/* Bottom nav */}
      <BottomNav />

      {/* Story viewer with progress bar and tap navigation */}
      <AnimatePresence>
        {viewingStory && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black flex flex-col"
          >
            {/* Progress bar */}
            <div className="absolute top-0 left-0 right-0 z-10 flex gap-1 px-2 pt-2">
              {stories.map((story, idx) => {
                const currentIdx = stories.indexOf(viewingStory);
                const isActive = idx === currentIdx;
                const isPast = idx < currentIdx;
                return (
                  <div key={story.id} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-white rounded-full"
                      initial={{ width: isPast ? '100%' : '0%' }}
                      animate={{ width: isActive ? '100%' : isPast ? '100%' : '0%' }}
                      transition={isActive ? { duration: STORY_DURATION / 1000, ease: 'linear' } : { duration: 0.3 }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Header */}
            <div className="flex items-center justify-between p-4 pt-6 z-10">
              <div className="flex items-center gap-2">
                <img src={viewingStory.avatar || getDefaultAvatar(viewingStory.user_id)} alt="User avatar" className="w-8 h-8 rounded-full" />
                <span className="text-white text-sm font-medium">{viewingStory.name}</span>
                {viewingStory.isMine && (
                  <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full">{stories.filter(s => s.user_id === viewingStory.user_id).length} views</span>
                )}
              </div>
              <button type="button" onClick={closeStory} className="text-white"><X size={24} /></button>
            </div>

            {/* Story content with tap zones */}
            <div className="flex-1 relative flex items-center justify-center">
              {/* Left tap zone (previous) */}
              <button
                type="button"
                className="absolute left-0 top-0 bottom-0 w-1/3 z-10"
                onClick={() => {
                  const idx = stories.indexOf(viewingStory);
                  if (idx > 0) setViewingStory(stories[idx - 1]);
                  else closeStory();
                }}
                aria-label="Previous story"
              />
              {/* Right tap zone (next) */}
              <button
                type="button"
                className="absolute right-0 top-0 bottom-0 w-1/3 z-10"
                onClick={() => {
                  const idx = stories.indexOf(viewingStory);
                  if (idx < stories.length - 1) setViewingStory(stories[idx + 1]);
                  else closeStory();
                }}
                aria-label="Next story"
              />
              {viewingStory.type === 'video' ? (
                <video src={viewingStory.media_url} className="max-w-full max-h-full" controls autoPlay />
              ) : (
                <img src={viewingStory.media_url} alt="Post image" className="max-w-full max-h-full object-contain" />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New Posts floating indicator */}
      <AnimatePresence>
        {newPostsCount > 0 && !isAtTop && feedTab === 'feed' && (
          <motion.button
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            onClick={handleScrollToTop}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2 bg-[#00C300] text-black rounded-full shadow-lg font-medium text-sm hover:bg-[#00A300] transition-colors"
          >
            <RefreshCw size={14} className="animate-spin" />
            {newPostsCount} new post{newPostsCount > 1 ? 's' : ''}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Image viewer */}
      <AnimatePresence>
        {showImageViewer && viewerImage && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setShowImageViewer(false)}
          >
            <button type="button" className="absolute top-4 right-4 text-white"><X size={28} /></button>
            <img src={viewerImage} alt="Image" className="max-w-full max-h-full object-contain rounded-lg" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share modal */}
      <AnimatePresence>
        {showShareModal && sharePost && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
            onClick={() => setShowShareModal(false)}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              className="bg-[#1a1a1a] rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-sm"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-white font-semibold mb-4">Share Post</h3>
              <div className="flex flex-col gap-3">
                <button type="button" onClick={() => {
                    navigator.clipboard.writeText(`https://gagachat.app/post/${sharePost.id}`);
                    toast.success('Link copied!');
                    setShowShareModal(false);
                  }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-[#2a2a2a] text-white hover:bg-[#333]"
                >
                  <Copy size={18} /> Copy Link
                </button>
                <button type="button" onClick={() => {
                    if (navigator.share) {
                      navigator.share({ title: 'GaGa Chat Post', text: sharePost.content || 'Check out this post', url: `https://gagachat.app/post/${sharePost.id}` });
                    } else {
                      navigator.clipboard.writeText(`https://gagachat.app/post/${sharePost.id}`);
                      toast.success('Link copied!');
                    }
                    setShowShareModal(false);
                  }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-[#2a2a2a] text-white hover:bg-[#333]"
                >
                  <Share2 size={18} /> Share via...
                </button>
                <button type="button" onClick={() => {
                    toast.success('Post saved to your bookmarks');
                    setShowShareModal(false);
                  }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-[#2a2a2a] text-white hover:bg-[#333]"
                >
                  <Heart size={18} /> Save to Bookmarks
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Post composer */}
      <AnimatePresence>
        {showComposer && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
            onClick={() => { setShowComposer(false); setEditingPost(null); }}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              className="bg-[#1a1a1a] rounded-t-2xl sm:rounded-2xl p-4 w-full max-w-lg max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-semibold">{editingPost ? 'Edit Post' : 'New Post'}</h3>
                <button type="button" onClick={() => { setShowComposer(false); setEditingPost(null); }} className="text-[#8D8D8D]"><X size={20} /></button>
              </div>
              
              {/* User preview */}
              {user && (
                <div className="flex items-center gap-2 mb-3">
                  <img src={user.avatar || getDefaultAvatar(user.id)} alt="User avatar" className="w-8 h-8 rounded-full object-cover" />
                  <div>
                    <p className="text-white text-sm font-medium">{user.name}</p>
                    <div className="flex items-center gap-1">
                      {visibilityOptions.map(opt => (
                        <button
                          type="button"
                          key={opt.key}
                          onClick={() => setVisibility(opt.key)}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${
                            visibility === opt.key ? 'bg-[#00C300] text-black' : 'bg-[#2a2a2a] text-[#8D8D8D]'
                          }`}
                        >
                          <opt.icon size={8} /> {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="What's on your mind?"
                className="w-full bg-[#2a2a2a] text-white rounded-xl p-3 min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-[#00C300]"
              />
              {/* Images */}
              {images.length > 0 && (
                <div className="flex gap-2 mt-3 overflow-x-auto">
                  {images.map((img, i) => (
                    <div key={i} className="relative shrink-0">
                      <img src={img} alt="Cover image" className="w-20 h-20 rounded-lg object-cover" />
                      <button type="button" onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5"><X size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
              {/* Poll composer */}
              {showPollComposer && (
                <div className="mt-3 bg-[#2a2a2a] rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-white text-sm font-medium flex items-center gap-2"><Vote size={14} /> Poll</span>
                    <button type="button" onClick={() => { setShowPollComposer(false); setPollQuestion(''); setPollOptions(['', '']); }} className="text-[#8D8D8D] hover:text-white"><X size={14} /></button>
                  </div>
                  <input
                    type="text"
                    value={pollQuestion}
                    onChange={e => setPollQuestion(e.target.value)}
                    placeholder="Ask a question..."
                    className="w-full bg-[#1a1a1a] text-white rounded-lg px-3 py-2 text-sm placeholder:text-[#8D8D8D] focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                  />
                  {pollOptions.map((opt, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text"
                        value={opt}
                        onChange={e => {
                          const next = [...pollOptions];
                          next[i] = e.target.value;
                          setPollOptions(next);
                        }}
                        placeholder={`Option ${i + 1}`}
                        className="flex-1 bg-[#1a1a1a] text-white rounded-lg px-3 py-2 text-sm placeholder:text-[#8D8D8D] focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                      />
                      {pollOptions.length > 2 && (
                        <button type="button" onClick={() => setPollOptions(prev => prev.filter((_, idx) => idx !== i))} className="text-[#FF3B30] px-2"><X size={14} /></button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < 4 && (
                    <button type="button" onClick={() => setPollOptions(prev => [...prev, ''])} className="text-xs text-[#00C300] font-medium">+ Add option</button>
                  )}
                </div>
              )}
              {/* Actions */}
              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 rounded-lg hover:bg-[#2a2a2a] text-[#8D8D8D]" title="Add image">
                    <Image size={20} />
                  </button>
                  <button type="button" onClick={() => setShowPollComposer(!showPollComposer)} className={`p-2 rounded-lg hover:bg-[#2a2a2a] ${showPollComposer ? 'text-[#00C300]' : 'text-[#8D8D8D]'}`} title="Add poll">
                    <Vote size={20} />
                  </button>
                </div>
                <button type="button" onClick={editingPost ? handleEditPost : handlePost}
                  disabled={uploading || (!content.trim() && images.length === 0 && !(showPollComposer && pollQuestion.trim() && pollOptions.filter(o => o.trim()).length >= 2))}
                  className="px-6 py-2 rounded-xl bg-[#00C300] text-black font-medium disabled:opacity-50"
                >
                  {uploading ? <Loader size={18} className="animate-spin" /> : editingPost ? 'Update' : 'Post'}
                </button>
              </div>
              <input type="file" ref={fileInputRef} accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Report Modal */}
      <AnimatePresence>
        {showReportModal && reportPost && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
            onClick={() => setShowReportModal(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="bg-[#1a1a1a] rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-sm"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-white font-semibold mb-1 flex items-center gap-2"><Flag size={18} className="text-[#FF3B30]" /> Report Post</h3>
              <p className="text-[#8D8D8D] text-xs mb-4">Help us keep GaGa Chat safe by reporting inappropriate content.</p>
              <div className="space-y-2 mb-4">
                {['Spam', 'Harassment or bullying', 'Violence or harmful content', 'Misinformation', 'Other'].map(reason => (
                  <button
                    type="button"
                    key={reason}
                    onClick={() => setReportReason(reason)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors ${
                      reportReason === reason ? 'bg-[#FF3B30]/20 text-white' : 'bg-[#2a2a2a] text-[#8D8D8D] hover:bg-[#333]'
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowReportModal(false)} className="flex-1 py-3 bg-[#2a2a2a] text-white rounded-xl text-sm font-bold">Cancel</button>
                <button type="button" onClick={submitReport} disabled={!reportReason} className="flex-1 py-3 bg-[#FF3B30] text-white rounded-xl text-sm font-bold disabled:opacity-50">Report</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tip Modal */}
      <RequestTipModal
        open={!!tipTarget}
        onClose={() => setTipTarget(null)}
        toUserId={tipTarget?.userId || ''}
        toUserName={tipTarget?.userName}
        toUserAvatar={tipTarget?.userAvatar}
        contentId={tipTarget?.postId}
        contentType="post"
      />
    </div>
  );
}
