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
} from '@/lib/firestore';
import { where, orderBy, limit } from '@/lib/firestore';
import { toast } from 'sonner';
import type { Story, StoryHighlight, StorySticker, StoryPollData } from '@/types';

const COLLECTION_HIGHLIGHTS = 'story_highlights';

interface StoryStore {
  stories: Story[];
  highlights: StoryHighlight[];
  loading: boolean;
  error: string | null;
  createStory: (userId: string, mediaUrl: string, type: 'image' | 'video', options?: { stickers?: StorySticker[]; pollData?: StoryPollData; musicUrl?: string; mentions?: string[]; linkUrl?: string }) => Promise<void>;
  deleteStory: (storyId: string) => Promise<void>;
  viewStory: (storyId: string, userId: string) => Promise<void>;
  markStoryAsViewed: (storyId: string, userId: string) => Promise<void>;
  highlightStory: (storyId: string, userId: string, title: string) => Promise<void>;
  getStoriesForUser: (userId: string) => Promise<Story[]>;
  getHighlightStories: (userId: string) => Promise<StoryHighlight[]>;
  getStoryViewers: (storyId: string) => Promise<{ id: string; name: string; avatar?: string; viewedAt: Date }[]>;
  subscribeStories: (userId: string) => () => void;
  subscribeHighlights: (userId: string) => () => void;
}

function isStoryExpired(story: Story): boolean {
  if (!story.expiresAt) return true;
  const expiry = story.expiresAt instanceof Date ? story.expiresAt : new Date(story.expiresAt);
  return new Date() > expiry;
}

function mapStory(d: Record<string, unknown>): Story {
  const rawTs = d.createdAt ?? d.timestamp;
  const timestamp = rawTs && typeof rawTs === 'object' && 'toDate' in rawTs
    ? (rawTs as any).toDate()
    : rawTs ? new Date(rawTs as string) : new Date();
  const rawExp: any = d.expiresAt ?? d.expires_at;
  const expiresAt = rawExp && typeof rawExp === 'object' && 'toDate' in rawExp
    ? rawExp.toDate()
    : rawExp ? new Date(rawExp as string) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  return {
    id: d.id as string,
    userId: d.userId as string,
    mediaUrl: (d.mediaUrl as string) || '',
    type: (d.type as 'image' | 'video') || 'image',
    timestamp,
    viewedBy: (d.viewedBy as string[]) || [],
    userName: (d.userName as string) || '',
    userAvatar: (d.userAvatar as string) || '',
    musicUrl: (d.musicUrl as string) || undefined,
    stickers: (d.stickers as StorySticker[]) || undefined,
    pollData: (d.pollData as StoryPollData) || undefined,
    mentions: (d.mentions as string[]) || undefined,
    linkUrl: (d.linkUrl as string) || undefined,
    reactions: (d.reactions as Record<string, string[]>) || undefined,
    highlightId: (d.highlightId as string) || undefined,
    highlightTitle: (d.highlightTitle as string) || undefined,
    expiresAt,
  };
}

function mapHighlight(d: Record<string, unknown>): StoryHighlight {
  return {
    id: d.id as string,
    userId: d.userId as string,
    title: (d.title as string) || '',
    coverImage: (d.coverImage as string) || '',
    storyIds: (d.storyIds as string[]) || [],
    createdAt: d.createdAt && typeof d.createdAt === 'object' && 'toDate' in d.createdAt
      ? (d.createdAt as any).toDate()
      : d.createdAt ? new Date(d.createdAt as string) : new Date(),
  };
}

export const useStoryStore = create<StoryStore>((set, get) => ({
  stories: [],
  highlights: [],
  loading: false,
  error: null,

  createStory: async (userId, mediaUrl, type, options = {}) => {
    if (!isFirestoreAvailable()) return;
    try {
      const user = await getDocById(COLLECTIONS.USERS, userId);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await addDocToCollection(COLLECTIONS.STORIES, {
        userId,
        mediaUrl,
        type,
        viewedBy: [],
        timestamp: serverTimestamp(),
        expiresAt,
        userName: user?.name || '',
        userAvatar: user?.avatar || '',
        ...options,
      });
      toast.success('Story shared');
    } catch (err) {
      console.error('createStory error:', err);
      toast.error('Failed to share story');
    }
  },

  deleteStory: async (storyId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await deleteDocById(COLLECTIONS.STORIES, storyId);
      set({ stories: get().stories.filter(s => s.id !== storyId) });
      toast.success('Story deleted');
    } catch (err) {
      console.error('deleteStory error:', err);
      toast.error('Failed to delete story');
    }
  },

  viewStory: async (storyId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      const story = await getDocById(COLLECTIONS.STORIES, storyId);
      if (!story) return;
      const viewedBy = (story.viewedBy as string[]) || [];
      if (!viewedBy.includes(userId)) {
        await updateDocById(COLLECTIONS.STORIES, storyId, {
          viewedBy: arrayUnion(userId),
        });
      }
    } catch (err) {
      console.error('viewStory error:', err);
    }
  },

  markStoryAsViewed: async (storyId, userId) => {
    await get().viewStory(storyId, userId);
  },

  highlightStory: async (storyId, userId, title) => {
    if (!isFirestoreAvailable()) return;
    try {
      const story = await getDocById(COLLECTIONS.STORIES, storyId);
      if (!story) return;
      const highlightId = await addDocToCollection(COLLECTION_HIGHLIGHTS, {
        userId,
        title,
        coverImage: story.mediaUrl || '',
        storyIds: [storyId],
        createdAt: serverTimestamp(),
      });
      await updateDocById(COLLECTIONS.STORIES, storyId, {
        highlightId,
        highlightTitle: title,
      });
      toast.success('Story added to highlights');
    } catch (err) {
      console.error('highlightStory error:', err);
      toast.error('Failed to create highlight');
    }
  },

  getStoriesForUser: async (userId) => {
    if (!isFirestoreAvailable()) return [];
    try {
      const data = await queryCollection(COLLECTIONS.STORIES, [
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
        limit(50),
      ]);
      const stories = (data || []).map(mapStory).filter(s => !isStoryExpired(s));
      // Enrich user info
      for (const s of stories) {
        if (!s.userName) {
          const user = await getDocById(COLLECTIONS.USERS, s.userId);
          s.userName = (user?.name as string) || '';
          s.userAvatar = (user?.avatar as string) || '';
        }
      }
      return stories;
    } catch (err) {
      console.error('getStoriesForUser error:', err);
      return [];
    }
  },

  getHighlightStories: async (userId) => {
    if (!isFirestoreAvailable()) return [];
    try {
      const data = await queryCollection(COLLECTION_HIGHLIGHTS, [
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
      ]);
      return (data || []).map(mapHighlight);
    } catch (err) {
      console.error('getHighlightStories error:', err);
      return [];
    }
  },

  getStoryViewers: async (storyId) => {
    if (!isFirestoreAvailable()) return [];
    try {
      const story = await getDocById(COLLECTIONS.STORIES, storyId);
      if (!story) return [];
      const viewerIds = (story.viewedBy as string[]) || [];
      const viewers: { id: string; name: string; avatar?: string; viewedAt: Date }[] = [];
      for (const id of viewerIds) {
        const user = await getDocById(COLLECTIONS.USERS, id);
        if (user) {
          viewers.push({
            id,
            name: (user.name as string) || 'Unknown',
            avatar: (user.avatar as string) || undefined,
            viewedAt: new Date(),
          });
        }
      }
      return viewers;
    } catch (err) {
      console.error('getStoryViewers error:', err);
      return [];
    }
  },

  subscribeStories: (userId) => {
    if (!isFirestoreAvailable() || !userId) return () => {};
    set({ loading: true });
    let unsub: (() => void) | null = null;
    try {
      // Subscribe to all non-expired stories (friends' stories loaded by pages via getStoriesForUser)
      unsub = subscribeToCollection(
        COLLECTIONS.STORIES,
        [orderBy('timestamp', 'desc'), limit(100)],
        (data) => {
          const stories = (data || []).map(mapStory).filter(s => !isStoryExpired(s));
          set({ stories, loading: false });
        }
      );
    } catch (err) {
      console.error('subscribeStories error:', err);
      set({ loading: false });
    }
    return () => { if (unsub) unsub(); };
  },

  subscribeHighlights: (userId) => {
    if (!isFirestoreAvailable() || !userId) return () => {};
    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeToCollection(
        COLLECTION_HIGHLIGHTS,
        [where('userId', '==', userId), orderBy('createdAt', 'desc')],
        (data) => {
          const highlights = (data || []).map(mapHighlight);
          set({ highlights });
        }
      );
    } catch (err) {
      console.error('subscribeHighlights error:', err);
    }
    return () => { if (unsub) unsub(); };
  },
}));
