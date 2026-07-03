/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';
import {
  isFirestoreAvailable,
  COLLECTIONS,
  getDocById,
  updateDocById,
  deleteDocById,
  addDocToCollection,
  queryCollection,
  subscribeToCollection,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
} from '@/lib/firestore';
import { where, orderBy, limit } from '@/lib/firestore';
import type { TimelinePost, PostReactions, BookmarkCollection, Hashtag, FeedFilter, PostAnalytics, CreatorAnalytics, UserReport } from '@/types';

interface EnhancedTimelineStore {
  posts: TimelinePost[];
  savedPosts: TimelinePost[];
  trendingHashtags: Hashtag[];
  followedHashtags: Hashtag[];
  bookmarkCollections: BookmarkCollection[];
  loading: boolean;
  loadingSaved: boolean;
  loadingHashtags: boolean;

  // Reactions
  addReaction: (postId: string, userId: string, reactionType: keyof PostReactions) => Promise<void>;
  removeReaction: (postId: string, userId: string, reactionType: keyof PostReactions) => Promise<void>;
  getReactionCounts: (postId: string) => Promise<PostReactions | null>;

  // Bookmarks
  savePost: (postId: string, userId: string, collectionId?: string) => Promise<void>;
  unsavePost: (postId: string, userId: string) => Promise<void>;
  getSavedPosts: (userId: string) => Promise<void>;
  createCollection: (userId: string, name: string, description?: string, isPrivate?: boolean) => Promise<void>;
  addToCollection: (postId: string, collectionId: string, userId: string) => Promise<void>;
  removeFromCollection: (postId: string, collectionId: string, userId: string) => Promise<void>;

  // Hashtags
  getTrendingHashtags: (limit?: number) => Promise<void>;
  followHashtag: (hashtagId: string, userId: string) => Promise<void>;
  unfollowHashtag: (hashtagId: string, userId: string) => Promise<void>;
  searchHashtags: (query: string) => Promise<Hashtag[]>;
  getHashtagPosts: (tag: string) => Promise<TimelinePost[]>;

  // Reporting
  reportPost: (reporterId: string, reportedId: string, postId: string, reason: string, details?: string, severity?: string) => Promise<void>;
  reportComment: (reporterId: string, reportedId: string, postId: string, commentId: string, reason: string, details?: string) => Promise<void>;
  reportUser: (reporterId: string, reportedId: string, reason: string, details?: string) => Promise<void>;
  getMyReports: (userId: string) => Promise<UserReport[]>;

  // Feed filters
  getFilteredPosts: (filter: FeedFilter, userId?: string) => Promise<void>;
  getFeedByType: (type: FeedFilter['type'], userId?: string) => Promise<void>;
  getNearbyPosts: (lat: number, lng: number, radius: number) => Promise<void>;
  getTrendingPosts: (timeRange?: 'today' | 'week' | 'month') => Promise<void>;
  getRecommendedPosts: (userId: string) => Promise<void>;

  // Repost
  repostPost: (postId: string, userId: string) => Promise<void>;
  quotePost: (postId: string, userId: string, quote: string) => Promise<void>;
  unRepostPost: (postId: string, userId: string) => Promise<void>;

  // Pin
  pinToProfile: (postId: string, userId: string) => Promise<void>;
  unpinFromProfile: (postId: string, userId: string) => Promise<void>;

  // Create post
  createPost: (userId: string, content: string, images: string[], visibility: string) => Promise<void>;

  // Analytics
  recordPostView: (postId: string, userId: string) => Promise<void>;
  getPostAnalytics: (postId: string) => Promise<PostAnalytics | null>;
  getCreatorAnalytics: (userId: string) => Promise<CreatorAnalytics | null>;

  // Refresh
  refreshPosts: () => Promise<void>;
  subscribePosts: (userId?: string) => () => void;
}

const mapPost = (d: Record<string, unknown>): TimelinePost => ({
  id: d.id as string,
  userId: d.userId as string,
  content: (d.content as string) || '',
  images: (d.images as string[]) || [],
  likes: (d.likes as string[]) || [],
  comments: (d.comments as any[]) || [],
  shares: (d.shares as string[]) || [],
  timestamp: ((rawTs: any) => rawTs && typeof rawTs === 'object' && 'toDate' in rawTs ? rawTs.toDate() : rawTs ? new Date(rawTs as string) : new Date())(d.createdAt ?? d.timestamp),
  visibility: (d.visibility as any) || 'public',
  userName: (d.userName as string) || '',
  userAvatar: (d.userAvatar as string) || '',
  videoUrl: (d.videoUrl as string) || undefined,
  location: (d.location as string) || undefined,
  lat: (d.lat as number) || undefined,
  lng: (d.lng as number) || undefined,
  hashtags: (d.hashtags as string[]) || [],
  mentions: (d.mentions as string[]) || [],
  contentWarning: (d.contentWarning as string) || undefined,
  reactions: (d.reactions as PostReactions) || undefined,
  savedBy: (d.savedBy as string[]) || [],
  repostedBy: (d.repostedBy as string[]) || [],
  originalPostId: (d.originalPostId as string) || undefined,
  edited: (d.edited as boolean) || false,
  editedAt: d.editedAt ? (d.editedAt as any).toDate?.() || new Date(d.editedAt as string) : undefined,
  pinned: (d.pinned as boolean) || false,
  commentCount: (d.commentCount as number) || 0,
  shareCount: (d.shareCount as number) || 0,
  viewCount: (d.viewCount as number) || 0,
  reachCount: (d.reachCount as number) || 0,
  impressionCount: (d.impressionCount as number) || 0,
  mediaType: (d.mediaType as any) || 'text',
  pollData: (d.pollData as any) || undefined,
});

const mapHashtag = (d: Record<string, unknown>): Hashtag => ({
  id: d.id as string,
  tag: (d.tag as string) || '',
  postCount: (d.postCount as number) || 0,
  followers: (d.followers as string[]) || [],
  trending: (d.trending as boolean) || false,
  trendRank: (d.trendRank as number) || undefined,
  relatedTags: (d.relatedTags as string[]) || [],
  description: (d.description as string) || '',
});

const mapReport = (d: Record<string, unknown>): UserReport => ({
  id: d.id as string,
  reporterId: (d.reporterId as string) || '',
  reportedId: (d.reportedId as string) || '',
  reason: (d.reason as string) || '',
  details: (d.details as string) || undefined,
  status: (d.status as any) || 'pending',
  reviewedBy: (d.reviewedBy as string) || undefined,
  reviewedAt: d.reviewedAt ? (d.reviewedAt as any).toDate?.() || new Date(d.reviewedAt as string) : undefined,
  actionTaken: (d.actionTaken as string) || undefined,
  createdAt: d.createdAt ? (d.createdAt as any).toDate?.() || new Date(d.createdAt as string) : new Date(),
  contentId: (d.contentId as string) || undefined,
  contentType: (d.contentType as any) || undefined,
  severity: (d.severity as any) || 'medium',
});

export const useEnhancedTimelineStore = create<EnhancedTimelineStore>((set, get) => ({
  posts: [],
  savedPosts: [],
  trendingHashtags: [],
  followedHashtags: [],
  bookmarkCollections: [],
  loading: false,
  loadingSaved: false,
  loadingHashtags: false,

  // --- Reactions ---
  addReaction: async (postId, userId, reactionType) => {
    if (!isFirestoreAvailable()) return;
    try {
      const postRef = await getDocById(COLLECTIONS.POSTS, postId);
      if (!postRef) return;
      const reactions = (postRef.reactions as PostReactions) || {
        like: [], love: [], haha: [], wow: [], sad: [], angry: [], clap: [], fire: [],
      };
      // Remove user from all other reaction types first
      (Object.keys(reactions) as (keyof PostReactions)[]).forEach((k) => {
        if (k !== reactionType) {
          reactions[k] = (reactions[k] || []).filter((id) => id !== userId);
        }
      });
      if (!reactions[reactionType].includes(userId)) {
        reactions[reactionType].push(userId);
      }
      await updateDocById(COLLECTIONS.POSTS, postId, { reactions });
    } catch (err) {
      console.error('[Timeline] addReaction error:', err);
    }
  },

  removeReaction: async (postId, userId, reactionType) => {
    if (!isFirestoreAvailable()) return;
    try {
      const postRef = await getDocById(COLLECTIONS.POSTS, postId);
      if (!postRef) return;
      const reactions = (postRef.reactions as PostReactions) || {
        like: [], love: [], haha: [], wow: [], sad: [], angry: [], clap: [], fire: [],
      };
      reactions[reactionType] = (reactions[reactionType] || []).filter((id) => id !== userId);
      await updateDocById(COLLECTIONS.POSTS, postId, { reactions });
    } catch (err) {
      console.error('[Timeline] removeReaction error:', err);
    }
  },

  getReactionCounts: async (postId) => {
    if (!isFirestoreAvailable()) return null;
    try {
      const postRef = await getDocById(COLLECTIONS.POSTS, postId);
      return (postRef?.reactions as PostReactions) || null;
    } catch {
      return null;
    }
  },

  // --- Bookmarks ---
  savePost: async (postId, userId, collectionId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await addDocToCollection('bookmarks', {
        userId,
        postId,
        collectionId: collectionId || null,
        timestamp: serverTimestamp(),
      });
      await updateDocById(COLLECTIONS.POSTS, postId, { savedBy: arrayUnion(userId) });
    } catch (err) {
      console.error('[Timeline] savePost error:', err);
    }
  },

  unsavePost: async (postId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      const existing = await queryCollection('bookmarks', [where('userId', '==', userId), where('postId', '==', postId)]);
      if (existing && existing.length > 0) {
        await deleteDocById('bookmarks', existing[0].id as string);
      }
      await updateDocById(COLLECTIONS.POSTS, postId, { savedBy: arrayRemove(userId) });
    } catch (err) {
      console.error('[Timeline] unsavePost error:', err);
    }
  },

  getSavedPosts: async (userId) => {
    set({ loadingSaved: true });
    try {
      const bookmarks = await queryCollection('bookmarks', [where('userId', '==', userId), orderBy('timestamp', 'desc')]);
      const postIds = (bookmarks || []).map((b) => b.postId as string);
      const posts: TimelinePost[] = [];
      for (const id of postIds) {
        const postRef = await getDocById(COLLECTIONS.POSTS, id);
        if (postRef) posts.push(mapPost(postRef));
      }
      set({ savedPosts: posts, loadingSaved: false });
    } catch {
      set({ loadingSaved: false });
    }
  },

  createCollection: async (userId, name, description, isPrivate) => {
    if (!isFirestoreAvailable()) return;
    try {
      await addDocToCollection('bookmarkCollections', {
        userId,
        name,
        description: description || '',
        isPrivate: isPrivate !== undefined ? isPrivate : true,
        count: 0,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('[Timeline] createCollection error:', err);
    }
  },

  addToCollection: async (postId, collectionId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await addDocToCollection('bookmarks', {
        userId,
        postId,
        collectionId,
        timestamp: serverTimestamp(),
      });
      await updateDocById('bookmarkCollections', collectionId, { count: increment(1) as any });
    } catch (err) {
      console.error('[Timeline] addToCollection error:', err);
    }
  },

  removeFromCollection: async (postId, collectionId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      const existing = await queryCollection('bookmarks', [
        where('userId', '==', userId),
        where('postId', '==', postId),
        where('collectionId', '==', collectionId),
      ]);
      if (existing && existing.length > 0) {
        await deleteDocById('bookmarks', existing[0].id as string);
      }
      await updateDocById('bookmarkCollections', collectionId, { count: increment(-1) as any });
    } catch (err) {
      console.error('[Timeline] removeFromCollection error:', err);
    }
  },

  // --- Hashtags ---
  getTrendingHashtags: async (lim = 10) => {
    set({ loadingHashtags: true });
    try {
      const data = await queryCollection('hashtags', [
        where('trending', '==', true),
        orderBy('postCount', 'desc'),
        limit(lim),
      ]);
      const hashtags = (data || []).map(mapHashtag);
      set({ trendingHashtags: hashtags, loadingHashtags: false });
    } catch {
      set({ loadingHashtags: false });
    }
  },

  followHashtag: async (hashtagId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById('hashtags', hashtagId, { followers: arrayUnion(userId) });
    } catch (err) {
      console.error('[Timeline] followHashtag error:', err);
    }
  },

  unfollowHashtag: async (hashtagId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById('hashtags', hashtagId, { followers: arrayRemove(userId) });
    } catch (err) {
      console.error('[Timeline] unfollowHashtag error:', err);
    }
  },

  searchHashtags: async (query) => {
    if (!isFirestoreAvailable()) return [];
    try {
      const data = await queryCollection('hashtags', [
        where('tag', '>=', query.toLowerCase()),
        where('tag', '<=', query.toLowerCase() + '\uf8ff'),
        limit(20),
      ]);
      return (data || []).map(mapHashtag);
    } catch {
      return [];
    }
  },

  getHashtagPosts: async (tag) => {
    if (!isFirestoreAvailable()) return [];
    try {
      const data = await queryCollection(COLLECTIONS.POSTS, [
        where('hashtags', 'array-contains', tag),
        orderBy('timestamp', 'desc'),
        limit(50),
      ]);
      return (data || []).map(mapPost);
    } catch {
      return [];
    }
  },

  // --- Reporting ---
  reportPost: async (reporterId, reportedId, postId, reason, details, severity = 'medium') => {
    if (!isFirestoreAvailable()) return;
    try {
      await addDocToCollection('reports', {
        reporterId,
        reportedId,
        contentId: postId,
        contentType: 'post',
        reason,
        details: details || '',
        severity,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('[Timeline] reportPost error:', err);
    }
  },

  reportComment: async (reporterId, reportedId, postId, commentId, reason, details) => {
    if (!isFirestoreAvailable()) return;
    try {
      await addDocToCollection('reports', {
        reporterId,
        reportedId,
        contentId: postId,
        commentId,
        contentType: 'comment',
        reason,
        details: details || '',
        severity: 'medium',
        status: 'pending',
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('[Timeline] reportComment error:', err);
    }
  },

  reportUser: async (reporterId, reportedId, reason, details) => {
    if (!isFirestoreAvailable()) return;
    try {
      await addDocToCollection('reports', {
        reporterId,
        reportedId,
        contentType: 'user',
        reason,
        details: details || '',
        severity: 'medium',
        status: 'pending',
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('[Timeline] reportUser error:', err);
    }
  },

  getMyReports: async (userId) => {
    if (!isFirestoreAvailable()) return [];
    try {
      const data = await queryCollection('reports', [where('reporterId', '==', userId), orderBy('createdAt', 'desc')]);
      return (data || []).map(mapReport);
    } catch {
      return [];
    }
  },

  // --- Feed filters ---
  getFilteredPosts: async (filter, userId) => {
    set({ loading: true });
    try {
      const constraints: any[] = [orderBy('timestamp', 'desc'), limit(50)];
      if (filter.type && filter.type !== 'all') {
        constraints.unshift(where('mediaType', '==', filter.type));
      }
      if (filter.onlyFriends && userId) {
        // This requires friendship data; simplified for now
      }
      if (filter.hashtags && filter.hashtags.length > 0) {
        constraints.unshift(where('hashtags', 'array-contains-any', filter.hashtags.slice(0, 10)));
      }
      if (filter.fromUsers && filter.fromUsers.length > 0) {
        constraints.unshift(where('userId', 'in', filter.fromUsers.slice(0, 10)));
      }
      const data = await queryCollection(COLLECTIONS.POSTS, constraints);
      const posts = (data || []).map(mapPost);
      set({ posts, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getFeedByType: async (type, _userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      const constraints: any[] = [orderBy('timestamp', 'desc'), limit(50)];
      if (type !== 'all') {
        constraints.unshift(where('mediaType', '==', type));
      }
      const data = await queryCollection(COLLECTIONS.POSTS, constraints);
      const posts = (data || []).map(mapPost);
      set({ posts, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  getNearbyPosts: async (lat, lng, radius) => {
    set({ loading: true });
    try {
      // Simplified: fetch recent posts and filter by distance client-side
      const data = await queryCollection(COLLECTIONS.POSTS, [orderBy('timestamp', 'desc'), limit(200)]);
      const posts = (data || []).map(mapPost).filter((p) => {
        if (!p.lat || !p.lng) return false;
        const d = haversineDistance(lat, lng, p.lat, p.lng);
        return d <= radius;
      });
      set({ posts, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  getTrendingPosts: async (timeRange = 'week') => {
    set({ loading: true });
    try {
      const now = new Date();
      const days = timeRange === 'today' ? 1 : timeRange === 'week' ? 7 : 30;
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      // Query recent posts, then filter and sort client-side to avoid composite index requirements
      const data = await queryCollection(COLLECTIONS.POSTS, [
        orderBy('timestamp', 'desc'),
        limit(200),
      ]);
      const posts = (data || [])
        .filter((p: any) => p.timestamp && new Date(p.timestamp.toDate?.() || p.timestamp) >= cutoff)
        .sort((a: any, b: any) => ((b.likes as string[])?.length || 0) - ((a.likes as string[])?.length || 0))
        .slice(0, 50)
        .map(mapPost);
      set({ posts, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getRecommendedPosts: async (_userId) => {
    set({ loading: true });
    try {
      // Simplified: combine recent posts from friends and trending posts
      const data = await queryCollection(COLLECTIONS.POSTS, [orderBy('timestamp', 'desc'), limit(50)]);
      const posts = (data || []).map(mapPost);
      set({ posts, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  // --- Repost ---
  repostPost: async (postId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTIONS.POSTS, postId, { repostedBy: arrayUnion(userId) });
      const original = await getDocById(COLLECTIONS.POSTS, postId);
      if (original) {
        await addDocToCollection(COLLECTIONS.POSTS, {
          userId,
          originalPostId: postId,
          content: '',
          images: [],
          visibility: 'public',
          timestamp: serverTimestamp(),
          mediaType: 'text',
          repostedBy: [],
          likes: [],
          comments: [],
          shares: [],
          savedBy: [],
        });
      }
    } catch (err) {
      console.error('[Timeline] repostPost error:', err);
    }
  },

  quotePost: async (postId, userId, quote) => {
    if (!isFirestoreAvailable()) return;
    try {
      const original = await getDocById(COLLECTIONS.POSTS, postId);
      if (original) {
        await addDocToCollection(COLLECTIONS.POSTS, {
          userId,
          originalPostId: postId,
          content: quote,
          images: [],
          visibility: 'public',
          timestamp: serverTimestamp(),
          mediaType: 'text',
          repostedBy: [],
          likes: [],
          comments: [],
          shares: [],
          savedBy: [],
        });
        await updateDocById(COLLECTIONS.POSTS, postId, { shares: arrayUnion(userId) });
      }
    } catch (err) {
      console.error('[Timeline] quotePost error:', err);
    }
  },

  unRepostPost: async (postId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTIONS.POSTS, postId, { repostedBy: arrayRemove(userId) });
    } catch (err) {
      console.error('[Timeline] unRepostPost error:', err);
    }
  },

  // --- Pin ---
  pinToProfile: async (postId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      // Unpin any existing pinned post
      const userPosts = await queryCollection(COLLECTIONS.POSTS, [where('userId', '==', userId), where('pinned', '==', true)]);
      for (const p of userPosts || []) {
        await updateDocById(COLLECTIONS.POSTS, p.id as string, { pinned: false });
      }
      await updateDocById(COLLECTIONS.POSTS, postId, { pinned: true });
    } catch (err) {
      console.error('[Timeline] pinToProfile error:', err);
    }
  },

  unpinFromProfile: async (postId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTIONS.POSTS, postId, { pinned: false });
    } catch (err) {
      console.error('[Timeline] unpinFromProfile error:', err);
    }
  },

  createPost: async (userId, content, images, visibility) => {
    if (!isFirestoreAvailable()) return;
    try {
      const user = await getDocById(COLLECTIONS.USERS, userId);
      await addDocToCollection(COLLECTIONS.POSTS, {
        userId,
        content,
        images: images || [],
        visibility: visibility || 'public',
        likes: [],
        comments: [],
        shares: [],
        savedBy: [],
        repostedBy: [],
        reactions: {
          like: [], love: [], haha: [], wow: [], sad: [], angry: [], clap: [], fire: [],
        },
        timestamp: serverTimestamp(),
        userName: user?.name || '',
        userAvatar: user?.avatar || '',
        mediaType: images.length > 0 ? 'photo' : 'text',
        viewCount: 0,
        reachCount: 0,
        impressionCount: 0,
        commentCount: 0,
        shareCount: 0,
        pinned: false,
        edited: false,
        hashtags: [],
        mentions: [],
      });
    } catch (err) {
      console.error('[Timeline] createPost error:', err);
    }
  },

  // --- Analytics ---
  recordPostView: async (postId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTIONS.POSTS, postId, {
        viewCount: increment(1) as any,
        reachCount: increment(1) as any,
        viewedBy: arrayUnion(userId) as any,
      });
    } catch (err) {
      console.error('[Timeline] recordPostView error:', err);
    }
  },

  getPostAnalytics: async (postId) => {
    if (!isFirestoreAvailable()) return null;
    try {
      const postRef = await getDocById(COLLECTIONS.POSTS, postId);
      if (!postRef) return null;
      const post = mapPost(postRef);
      const reactions = post.reactions || {
        like: [], love: [], haha: [], wow: [], sad: [], angry: [], clap: [], fire: [],
      };
      return {
        postId,
        views: post.viewCount || 0,
        reach: post.reachCount ? (Array.isArray(post.reachCount) ? post.reachCount.length : 0) : 0,
        impressions: post.impressionCount || 0,
        likes: (post.likes || []).length,
        comments: post.commentCount || (post.comments || []).length,
        shares: (post.shares || []).length,
        saves: (post.savedBy || []).length,
        reactions,
        audienceDemographics: {
          ageRanges: { '18-24': 0, '25-34': 0, '35-44': 0, '45-54': 0, '55+': 0 },
          genders: { male: 0, female: 0, other: 0 },
          countries: {},
          cities: {},
          devices: { mobile: 0, desktop: 0, tablet: 0 },
        },
        watchTime: 0,
        engagementRate: 0,
        topReferrers: [],
        peakHour: 0,
        dateRange: { from: new Date(), to: new Date() },
      };
    } catch {
      return null;
    }
  },

  getCreatorAnalytics: async (userId) => {
    if (!isFirestoreAvailable()) return null;
    try {
      const posts = await queryCollection(COLLECTIONS.POSTS, [where('userId', '==', userId), orderBy('timestamp', 'desc')]);
      const postList = (posts || []).map(mapPost);
      const totalViews = postList.reduce((sum, p) => sum + (p.viewCount || 0), 0);
      const totalLikes = postList.reduce((sum, p) => sum + (p.likes || []).length, 0);
      const totalComments = postList.reduce((sum, p) => sum + (p.comments || []).length, 0);
      const totalShares = postList.reduce((sum, p) => sum + (p.shares || []).length, 0);
      const totalSaves = postList.reduce((sum, p) => sum + (p.savedBy || []).length, 0);
      const engagementRate = totalViews > 0 ? ((totalLikes + totalComments + totalShares + totalSaves) / totalViews) * 100 : 0;
      return {
        userId,
        totalFollowers: 0,
        followersGained: 0,
        followersLost: 0,
        totalPosts: postList.length,
        totalViews,
        totalLikes,
        totalComments,
        totalShares,
        totalSaves,
        engagementRate,
        topPosts: postList.slice(0, 5).map((p) => p.id),
        dailyActiveAudience: 0,
        watchTime: 0,
        revenue: 0,
        revenueCurrency: 'BDT' as const,
        tipsReceived: 0,
        subscriptionsCount: 0,
        growthChart: [],
      };
    } catch {
      return null;
    }
  },

  refreshPosts: async () => {
    try {
      const data = await queryCollection(COLLECTIONS.POSTS, [orderBy('timestamp', 'desc'), limit(50)]);
      const posts = (data || []).map(mapPost);
      set({ posts });
    } catch (err) {
      console.error('[Timeline] refreshPosts error:', err);
    }
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  subscribePosts: (_userId) => {
    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeToCollection(COLLECTIONS.POSTS, [orderBy('timestamp', 'desc')], () => {
        get().refreshPosts();
      });
    } catch {
      // ignore
    }
    return () => { if (unsub) unsub(); };
  },
}));

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
