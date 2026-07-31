/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';
import {
  isSupabaseAvailable,
  COLLECTIONS,
  getDocById,
  updateDocById,
  deleteDocById,
  addDocToCollection,
  addDocToSubcollection,
  queryCollection,
  subscribeToCollection,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
} from '@/lib/supabaseDb';
import { where, orderBy, limit, startAfter } from '@/lib/supabaseDb';
import { toast } from 'sonner';
import type { Reel } from '@/types';

const COLLECTION_REELS = 'reels';

interface ReelStore {
  reels: Reel[];
  externalReels: Reel[];
  myReels: Reel[];
  trendingReels: Reel[];
  loading: boolean;
  loadingMore: boolean;
  searchingExternal: boolean;
  hasMore: boolean;
  lastTimestamp: Date | null;
  activeCategory: string | null;
  createReel: (userId: string, data: Omit<Reel, 'id' | 'userId' | 'timestamp' | 'likes' | 'comments' | 'shares' | 'savedBy' | 'viewedBy' | 'viewCount' | 'reactions'> & { visibility?: 'public' | 'friends' | 'private' }) => Promise<void>;
  deleteReel: (reelId: string) => Promise<void>;
  likeReel: (reelId: string, userId: string) => Promise<void>;
  unlikeReel: (reelId: string, userId: string) => Promise<void>;
  commentOnReel: (reelId: string, userId: string, content: string) => Promise<void>;
  saveReel: (reelId: string, userId: string) => Promise<void>;
  shareReel: (reelId: string, userId: string) => Promise<void>;
  viewReel: (reelId: string, userId: string) => Promise<void>;
  getReels: (limitCount?: number) => Promise<Reel[]>;
  getMyReels: (userId: string) => Promise<Reel[]>;
  getTrendingReels: (limitCount?: number) => Promise<Reel[]>;
  getReelsByTag: (tag: string, limitCount?: number) => Promise<Reel[]>;
  getReelsByCategory: (category: string, limitCount?: number) => Promise<Reel[]>;
  loadMoreReels: (limitCount?: number) => Promise<void>;
  getForYouReels: (limitCount?: number) => Promise<Reel[]>;
  subscribeReels: () => () => void;
  setActiveCategory: (category: string | null) => void;
  refreshReels: () => Promise<void>;
  searchExternalVideos: (query: string, category?: string) => Promise<void>;
  loadExternalByCategory: (category: string) => Promise<void>;
  clearExternalReels: () => void;
}

function mapReel(d: Record<string, unknown>): Reel {
  const rawTimestamp = d.createdAt ?? d.timestamp;
  const timestamp = rawTimestamp && typeof rawTimestamp === 'object' && 'toDate' in rawTimestamp
    ? (rawTimestamp as any).toDate()
    : rawTimestamp ? new Date(rawTimestamp as string) : new Date();
  return {
    id: d.id as string,
    userId: d.userId as string,
    videoUrl: (d.videoUrl as string) || '',
    thumbnailUrl: (d.thumbnailUrl as string) || undefined,
    caption: (d.caption as string) || '',
    musicTitle: (d.musicTitle as string) || undefined,
    musicUrl: (d.musicUrl as string) || undefined,
    filters: (d.filters as string[]) || undefined,
    effects: (d.effects as string[]) || undefined,
    speed: (d.speed as number) || undefined,
    voiceover: (d.voiceover as string) || undefined,
    captions: (d.captions as string) || undefined,
    duration: (d.duration as number) || 0,
    likes: (d.likes as string[]) || [],
    comments: (d.comments as any[]) || [],
    shares: (d.shares as string[]) || [],
    savedBy: (d.savedBy as string[]) || [],
    viewedBy: (d.viewedBy as string[]) || [],
    timestamp,
    userName: (d.userName as string) || '',
    userAvatar: (d.userAvatar as string) || '',
    tags: (d.tags as string[]) || undefined,
    mentions: (d.mentions as string[]) || undefined,
    remixOf: (d.remixOf as string) || undefined,
    duetWith: (d.duetWith as string) || undefined,
    template: (d.template as string) || undefined,
    viewCount: (d.viewCount as number) || 0,
    reactions: (d.reactions as any) || undefined,
    category: (d.category as string) || undefined,
  };
}

export const useReelStore = create<ReelStore>((set, get) => ({
  reels: [],
  externalReels: [],
  myReels: [],
  trendingReels: [],
  loading: false,
  loadingMore: false,
  searchingExternal: false,
  hasMore: true,
  lastTimestamp: null,
  activeCategory: null,

  createReel: async (userId, data) => {
    if (!isSupabaseAvailable()) return;
    try {
      const user = await getDocById(COLLECTIONS.USERS, userId);
      await addDocToCollection(COLLECTION_REELS, {
        userId,
        ...data,
        likes: [],
        comments: [],
        shares: [],
        savedBy: [],
        viewedBy: [],
        viewCount: 0,
        timestamp: serverTimestamp(),
        userName: user?.name || '',
        userAvatar: user?.avatar || '',
      });
      toast.success('Reel posted');
    } catch (err) {
      console.error('createReel error:', err);
      toast.error('Failed to post reel');
    }
  },

  deleteReel: async (reelId) => {
    if (!isSupabaseAvailable()) return;
    try {
      await deleteDocById(COLLECTION_REELS, reelId);
      set({ reels: get().reels.filter(r => r.id !== reelId) });
      toast.success('Reel deleted');
    } catch (err) {
      console.error('deleteReel error:', err);
      toast.error('Failed to delete reel');
    }
  },

  likeReel: async (reelId, userId) => {
    if (!isSupabaseAvailable()) return;
    try {
      await updateDocById(COLLECTION_REELS, reelId, {
        likes: arrayUnion(userId),
      });
    } catch (err) {
      console.error('likeReel error:', err);
      toast.error('Failed to like reel');
    }
  },

  unlikeReel: async (reelId, userId) => {
    if (!isSupabaseAvailable()) return;
    try {
      await updateDocById(COLLECTION_REELS, reelId, {
        likes: arrayRemove(userId),
      });
    } catch (err) {
      console.error('unlikeReel error:', err);
      toast.error('Failed to unlike reel');
    }
  },

  commentOnReel: async (reelId, userId, content) => {
    if (!isSupabaseAvailable()) return;
    try {
      const user = await getDocById(COLLECTIONS.USERS, userId);
      await addDocToSubcollection(COLLECTION_REELS, reelId, 'comments', {
        userId,
        content,
        timestamp: serverTimestamp(),
        userName: user?.name || '',
        userAvatar: user?.avatar || '',
        likes: [],
      });
      toast.success('Comment added');
    } catch (err) {
      console.error('commentOnReel error:', err);
      toast.error('Failed to add comment');
    }
  },

  saveReel: async (reelId, userId) => {
    if (!isSupabaseAvailable()) return;
    try {
      const reel = await getDocById(COLLECTION_REELS, reelId);
      if (!reel) return;
      const savedBy = (reel.savedBy as string[]) || [];
      if (savedBy.includes(userId)) {
        await updateDocById(COLLECTION_REELS, reelId, { savedBy: arrayRemove(userId) });
        toast.success('Removed from saved');
      } else {
        await updateDocById(COLLECTION_REELS, reelId, { savedBy: arrayUnion(userId) });
        toast.success('Saved');
      }
    } catch (err) {
      console.error('saveReel error:', err);
      toast.error('Failed to save reel');
    }
  },

  shareReel: async (reelId, userId) => {
    if (!isSupabaseAvailable()) return;
    try {
      await updateDocById(COLLECTION_REELS, reelId, {
        shares: arrayUnion(userId),
      });
      toast.success('Shared');
    } catch (err) {
      console.error('shareReel error:', err);
      toast.error('Failed to share reel');
    }
  },

  viewReel: async (reelId, userId) => {
    if (!isSupabaseAvailable()) return;
    try {
      await updateDocById(COLLECTION_REELS, reelId, {
        viewedBy: arrayUnion(userId),
        viewCount: increment(1),
      });
    } catch { /* ignore view tracking errors */ }
  },

  getReels: async (limitCount = 20) => {
    if (!isSupabaseAvailable()) return [];
    try {
      const data = await queryCollection(COLLECTION_REELS, [
        orderBy('timestamp', 'desc'),
        limit(limitCount),
      ]);
      return (data || []).map(mapReel);
    } catch (err) {
      console.error('getReels error:', err);
      return [];
    }
  },

  getMyReels: async (userId) => {
    if (!isSupabaseAvailable()) return [];
    try {
      const data = await queryCollection(COLLECTION_REELS, [
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
      ]);
      return (data || []).map(mapReel);
    } catch (err) {
      console.error('getMyReels error:', err);
      return [];
    }
  },

  getTrendingReels: async (limitCount = 50) => {
    if (!isSupabaseAvailable()) return [];
    try {
      const data = await queryCollection(COLLECTION_REELS, [
        orderBy('viewCount', 'desc'),
        limit(limitCount),
      ]);
      return (data || []).map(mapReel);
    } catch (err) {
      console.error('getTrendingReels error:', err);
      return [];
    }
  },

  getReelsByTag: async (tag, limitCount = 50) => {
    if (!isSupabaseAvailable()) return [];
    try {
      const data = await queryCollection(COLLECTION_REELS, [
        where('tags', 'array-contains', tag),
        orderBy('timestamp', 'desc'),
        limit(limitCount),
      ]);
      return (data || []).map(mapReel);
    } catch (err) {
      console.error('getReelsByTag error:', err);
      return [];
    }
  },

  getReelsByCategory: async (category, limitCount = 50) => {
    if (!isSupabaseAvailable()) return [];
    try {
      const data = await queryCollection(COLLECTION_REELS, [
        where('category', '==', category),
        orderBy('timestamp', 'desc'),
        limit(limitCount),
      ]);
      return (data || []).map(mapReel);
    } catch (err) {
      console.error('getReelsByCategory error:', err);
      return [];
    }
  },

  loadMoreReels: async (limitCount = 10) => {
    const state = get();
    if (state.loadingMore || !state.hasMore) return;

    set({ loadingMore: true });

    const lastTs = state.lastTimestamp;
    const category = state.activeCategory;

    let data: Record<string, unknown>[] = [];

    if (!isSupabaseAvailable()) {
      set({ loadingMore: false, hasMore: false });
      return;
    }

    try {
      const constraints: any[] = [];

      if (category) {
        constraints.push(where('category', '==', category));
      }

      constraints.push(orderBy('timestamp', 'desc'));

      if (lastTs) {
        constraints.push(startAfter(lastTs));
      }

      constraints.push(limit(limitCount));

      data = await queryCollection(COLLECTION_REELS, constraints);
      const newReels = (data || []).map(mapReel);

      if (newReels.length === 0) {
        set({ loadingMore: false, hasMore: false });
        return;
      }

      const lastReel = newReels[newReels.length - 1];
      const merged = [...state.reels, ...newReels];
      const unique = merged.filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i);

      set({
        reels: unique,
        lastTimestamp: lastReel.timestamp,
        loadingMore: false,
        hasMore: newReels.length >= limitCount,
      });
    } catch (err) {
      console.error('loadMoreReels error:', err);
      set({ loadingMore: false });
    }
  },

  getForYouReels: async (limitCount = 50) => {
    if (!isSupabaseAvailable()) {
      return [];
    }
    try {
      // Fetch latest reels across all categories
      const data = await queryCollection(COLLECTION_REELS, [
        orderBy('timestamp', 'desc'),
        limit(limitCount * 2),
      ]);
      const reels = (data || []).map(mapReel);
      return reels.slice(0, limitCount);
    } catch (err) {
      console.error('getForYouReels error:', err);
      return [];
    }
  },

  subscribeReels: () => {
    if (!isSupabaseAvailable()) {
      set({ reels: [], loading: false, hasMore: false });
      return () => {};
    }

    set({ loading: true });
    let unsub: (() => void) | null = null;

    try {
      unsub = subscribeToCollection(
        COLLECTION_REELS,
        [orderBy('timestamp', 'desc')],
        (data) => {
          const reels = (data || []).map(mapReel);
          set({
            reels: reels,
            loading: false,
            hasMore: reels.length >= 20,
            lastTimestamp: reels[reels.length - 1]?.timestamp || null,
          });
        }
      );
    } catch (err) {
      console.error('subscribeReels error:', err);
      set({ reels: [], loading: false, hasMore: false });
    }
    return () => { if (unsub) unsub(); };
  },

  setActiveCategory: (category) => {
    set({ activeCategory: category, reels: [], hasMore: true, lastTimestamp: null });
  },

  refreshReels: async () => {
    const state = get();
    const category = state.activeCategory;
    set({ loading: true, reels: [], hasMore: true, lastTimestamp: null });

    if (!isSupabaseAvailable()) {
      set({ reels: [], loading: false, hasMore: false });
      return;
    }

    try {
      let data: Record<string, unknown>[] = [];
      if (category) {
        data = await queryCollection(COLLECTION_REELS, [
          where('category', '==', category),
          orderBy('timestamp', 'desc'),
          limit(20),
        ]);
      } else {
        data = await queryCollection(COLLECTION_REELS, [
          orderBy('timestamp', 'desc'),
          limit(20),
        ]);
      }
      const reels = (data || []).map(mapReel);
      set({
        reels: reels,
        loading: false,
        hasMore: reels.length >= 20,
        lastTimestamp: reels[reels.length - 1]?.timestamp || null,
      });
    } catch (err) {
      console.error('refreshReels error:', err);
      set({ reels: [], loading: false, hasMore: false });
    }
  },

  // ── External Video Methods ──────────────────────────────
  searchExternalVideos: async (query, category) => {
    const { searchExternalVideos } = await import('@/lib/videoApis');
    set({ searchingExternal: true });
    try {
      const result = await searchExternalVideos(query, category, 12);
      if (result.reels.length > 0) {
        set({ externalReels: result.reels, searchingExternal: false });
      } else {
        set({ externalReels: [], searchingExternal: false });
      }
    } catch (err) {
      console.error('searchExternalVideos error:', err);
      set({ externalReels: [], searchingExternal: false });
    }
  },

  loadExternalByCategory: async (category) => {
    const { searchExternalByCategory } = await import('@/lib/videoApis');
    set({ searchingExternal: true });
    try {
      const result = await searchExternalByCategory(category, 10);
      if (result.reels.length > 0) {
        // Merge with existing external reels, avoiding duplicates
        const existingIds = new Set(get().externalReels.map(r => r.id));
        const newReels = result.reels.filter(r => !existingIds.has(r.id));
        set({
          externalReels: [...get().externalReels, ...newReels],
          searchingExternal: false,
        });
      } else {
        set({ searchingExternal: false });
      }
    } catch (err) {
      console.error('loadExternalByCategory error:', err);
      set({ searchingExternal: false });
    }
  },

  clearExternalReels: () => {
    set({ externalReels: [] });
  },
}));
