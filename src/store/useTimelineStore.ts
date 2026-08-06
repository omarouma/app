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
} from '@/lib/firestore';
import type { TimelinePost, Story } from '@/types';
import { where, orderBy, limit } from '@/lib/firestore';

interface TimelineStore {
  posts: TimelinePost[];
  stories: Story[];
  loadingPosts: boolean;
  loadingStories: boolean;
  subscribePosts: () => () => void;
  subscribeStories: (userId: string) => () => void;
  createPost: (userId: string, content: string, images: string[], visibility: 'public' | 'friends' | 'private') => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  likePost: (postId: string, userId: string) => Promise<void>;
  unlikePost: (postId: string, userId: string) => Promise<void>;
  commentPost: (postId: string, userId: string, content: string) => Promise<void>;
  editPost: (postId: string, content: string, images: string[], visibility?: string) => Promise<void>;
  createStory: (userId: string, mediaUrl: string, type: 'image' | 'video') => Promise<void>;
  deleteStory: (storyId: string) => Promise<void>;
  viewStory: (storyId: string, userId: string) => Promise<void>;
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
  visibility: (d.visibility as 'public' | 'friends' | 'private') || 'public',
  userName: (d.userName as string) || '',
  userAvatar: (d.userAvatar as string) || '',
});

const mapStory = (d: Record<string, unknown>): Story => ({
  id: d.id as string,
  userId: d.userId as string,
  mediaUrl: (d.mediaUrl as string) || '',
  type: (d.type as 'image' | 'video') || 'image',
  timestamp: ((rawTs: any) => rawTs && typeof rawTs === 'object' && 'toDate' in rawTs ? rawTs.toDate() : rawTs ? new Date(rawTs as string) : new Date())(d.createdAt ?? d.timestamp),
  viewedBy: (d.viewedBy as string[]) || [],
  userName: (d.userName as string) || '',
  userAvatar: (d.userAvatar as string) || '',
  expiresAt: d.expiresAt && typeof d.expiresAt === 'object' && 'toDate' in d.expiresAt
    ? (d.expiresAt as any).toDate()
    : d.expiresAt ? new Date(d.expiresAt as string) : new Date(Date.now() + 24 * 60 * 60 * 1000),
});

export const useTimelineStore = create<TimelineStore>((set) => ({
  posts: [],
  stories: [],
  loadingPosts: true,
  loadingStories: true,

  subscribePosts: () => {
    if (!isFirestoreAvailable()) {
      set({ loadingPosts: false, posts: [] });
      return () => {};
    }
    set({ loadingPosts: true });

    const fetchPosts = async () => {
      try {
        const data = await queryCollection(COLLECTIONS.POSTS, [
          orderBy('createdAt', 'desc'),
          limit(50),
        ]);

        const userIds = [...new Set((data || []).map((d: any) => d.userId as string).filter(Boolean))];
        const userMap: Record<string, any> = {};
        await Promise.all(userIds.map(async (uid) => {
          const u = await getDocById(COLLECTIONS.USERS, uid);
          if (u) userMap[uid] = u;
        }));

        const posts: TimelinePost[] = (data || []).map((d: any) => {
          const post = mapPost(d);
          const u = userMap[post.userId];
          post.userName = (u?.name as string) || post.userName || '';
          post.userAvatar = (u?.avatar as string) || post.userAvatar || '';
          return post;
        });
        set({ posts, loadingPosts: false });
      } catch {
        set({ loadingPosts: false });
      }
    };

    fetchPosts();

    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeToCollection(COLLECTIONS.POSTS, [orderBy('createdAt', 'desc'), limit(50)], () => {
        fetchPosts();
      });
    } catch {
      // ignore
    }

    return () => { if (unsub) unsub(); };
  },

  subscribeStories: (userId: string) => {
    if (!isFirestoreAvailable()) {
      set({ loadingStories: false, stories: [] });
      return () => {};
    }
    set({ loadingStories: true });
    if (!userId) {
      set({ stories: [], loadingStories: false });
      return () => {};
    }

    const fetchStories = async () => {
      try {
        const friendships = await queryCollection(COLLECTIONS.FRIENDSHIPS, [
          where('userId', '==', userId),
        ]);
        const friendIds = (friendships || []).map((f: any) => f.friendId as string);
        // Supabase 'in' operator supports max 10 items — chunk if needed
        const allIds = [...new Set([...friendIds, userId])].slice(0, 10);

        if (allIds.length === 0) {
          set({ stories: [], loadingStories: false });
          return;
        }

        const data = await queryCollection(COLLECTIONS.STORIES, [
          where('userId', 'in', allIds),
          orderBy('createdAt', 'desc'),
          limit(50),
        ]);

        const userIds = [...new Set((data || []).map((d: any) => d.userId as string).filter(Boolean))];
        const userMap: Record<string, any> = {};
        await Promise.all(userIds.map(async (uid) => {
          const u = await getDocById(COLLECTIONS.USERS, uid);
          if (u) userMap[uid] = u;
        }));

        const stories: Story[] = (data || []).map((d: any) => {
          const story = mapStory(d);
          const u = userMap[story.userId];
          story.userName = (u?.name as string) || story.userName || '';
          story.userAvatar = (u?.avatar as string) || story.userAvatar || '';
          return story;
        });
        set({ stories, loadingStories: false });
      } catch {
        set({ loadingStories: false });
      }
    };

    fetchStories();

    let cancelled = false;
    let unsub: (() => void) | null = null;

    const setup = async () => {
      try {
        const friendships = await queryCollection(COLLECTIONS.FRIENDSHIPS, [where('userId', '==', userId)]);
        if (cancelled) return;
        const friendIds = (friendships || []).map((f: any) => f.friendId as string);
        const allIds = [...new Set([...friendIds, userId])].slice(0, 10);
        if (allIds.length > 0) {
          unsub = subscribeToCollection(COLLECTIONS.STORIES, [
            where('userId', 'in', allIds),
            orderBy('createdAt', 'desc'),
            limit(50),
          ], () => { fetchStories().catch(() => {}); });
        }
      } catch {
        // ignore
      }
    };

    setup();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  },

  createPost: async (userId, content, images, visibility) => {
    if (!isFirestoreAvailable()) {
      throw new Error('Database unavailable. Cannot create post.');
    }
    try {
      const user = await getDocById(COLLECTIONS.USERS, userId);
      await addDocToCollection(COLLECTIONS.POSTS, {
        userId,
        content,
        images,
        visibility,
        likes: [],
        createdAt: serverTimestamp(),
        userName: user?.name || '',
        userAvatar: user?.avatar || '',
      });
    } catch (err) {
      console.error('[TimelineStore] createPost error:', err);
      throw err;
    }
  },

  deletePost: async (postId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await deleteDocById(COLLECTIONS.POSTS, postId);
    } catch {
      // ignore
    }
  },

  editPost: async (postId: string, content: string, images: string[], visibility?: string) => {
    if (!isFirestoreAvailable()) return;
    try {
      const update: Record<string, unknown> = {};
      if (content !== undefined) update.content = content;
      if (images !== undefined) update.images = images;
      if (visibility !== undefined) update.visibility = visibility;
      await updateDocById(COLLECTIONS.POSTS, postId, update);
    } catch {
      // ignore
    }
  },

  likePost: async (postId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTIONS.POSTS, postId, { likes: arrayUnion(userId) });
    } catch {
      // ignore
    }
  },

  unlikePost: async (postId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTIONS.POSTS, postId, { likes: arrayRemove(userId) });
    } catch {
      // ignore
    }
  },

  commentPost: async (postId, userId, content) => {
    if (!isFirestoreAvailable()) return;
    try {
      const post = await getDocById(COLLECTIONS.POSTS, postId);
      if (!post) return;
      const comments = (post.comments as any[]) || [];
      const user = await getDocById(COLLECTIONS.USERS, userId);
      comments.push({
        userId,
        content,
        timestamp: new Date().toISOString(),
        userName: user?.name || '',
        userAvatar: user?.avatar || '',
      });
      await updateDocById(COLLECTIONS.POSTS, postId, { comments });
    } catch {
      // ignore
    }
  },

  createStory: async (userId, mediaUrl, type) => {
    if (!isFirestoreAvailable()) return;
    try {
      const user = await getDocById(COLLECTIONS.USERS, userId);
      await addDocToCollection(COLLECTIONS.STORIES, {
        userId,
        mediaUrl,
        type,
        viewedBy: [],
        createdAt: serverTimestamp(),
        userName: user?.name || '',
        userAvatar: user?.avatar || '',
      });
    } catch {
      // ignore
    }
  },

  deleteStory: async (storyId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await deleteDocById(COLLECTIONS.STORIES, storyId);
    } catch {
      // ignore
    }
  },

  viewStory: async (storyId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      const story = await getDocById(COLLECTIONS.STORIES, storyId);
      if (!story) return;
      const viewedBy = (story.viewedBy as string[]) || [];
      if (!viewedBy.includes(userId)) {
        await updateDocById(COLLECTIONS.STORIES, storyId, { viewedBy: [...viewedBy, userId] });
      }
    } catch {
      // ignore
    }
  },
}));
