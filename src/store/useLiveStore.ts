/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';
import {
  isFirestoreAvailable,
  COLLECTIONS,
  getDocById,
  updateDocById,
  addDocToCollection,
  addDocToSubcollection,
  querySubcollection,
  queryCollection,
  subscribeToCollection,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
} from '@/lib/firestore';
import { where, orderBy, limit } from '@/lib/firestore';
import { toast } from 'sonner';
import type { LiveStream, LiveComment, LiveGift, LiveReactions } from '@/types';

const COLLECTION_LIVE = 'liveStreams';

interface LiveStore {
  activeStreams: LiveStream[];
  myStreams: LiveStream[];
  currentStream: LiveStream | null;
  loading: boolean;
  startLive: (userId: string, data: { title: string; thumbnailUrl?: string; category?: string; hashtags?: string[] }) => Promise<string | null>;
  endLive: (streamId: string) => Promise<void>;
  joinLive: (streamId: string, userId: string) => Promise<void>;
  leaveLive: (streamId: string, userId: string) => Promise<void>;
  sendLiveComment: (streamId: string, userId: string, content: string) => Promise<void>;
  sendLiveReaction: (streamId: string, reaction: keyof LiveReactions) => Promise<void>;
  sendLiveGift: (streamId: string, userId: string, gift: Omit<LiveGift, 'id' | 'timestamp'>) => Promise<void>;
  pinComment: (streamId: string, commentId: string) => Promise<void>;
  toggleScreenShare: (streamId: string, isSharing: boolean) => Promise<void>;
  addGuest: (streamId: string, userId: string) => Promise<void>;
  removeGuest: (streamId: string, userId: string) => Promise<void>;
  saveReplay: (streamId: string, replayUrl: string) => Promise<void>;
  getActiveStreams: (limitCount?: number) => Promise<LiveStream[]>;
  getMyStreams: (userId: string) => Promise<LiveStream[]>;
  getStreamById: (streamId: string) => Promise<LiveStream | null>;
  subscribeActiveStreams: () => () => void;
}

function mapLiveStream(d: Record<string, unknown>): LiveStream {
  const startedAt = d.startedAt && typeof d.startedAt === 'object' && 'toDate' in d.startedAt
    ? (d.startedAt as any).toDate()
    : d.startedAt ? new Date(d.startedAt as string) : new Date();
  const endedAt = d.endedAt && typeof d.endedAt === 'object' && 'toDate' in d.endedAt
    ? (d.endedAt as any).toDate()
    : d.endedAt ? new Date(d.endedAt as string) : undefined;
  return {
    id: d.id as string,
    userId: d.userId as string,
    title: (d.title as string) || '',
    thumbnailUrl: (d.thumbnailUrl as string) || undefined,
    isLive: (d.isLive as boolean) || false,
    startedAt,
    endedAt,
    viewers: (d.viewers as string[]) || [],
    viewerCount: (d.viewerCount as number) || 0,
    peakViewers: (d.peakViewers as number) || 0,
    comments: (d.comments as LiveComment[]) || [],
    reactions: (d.reactions as LiveReactions) || { like: 0, love: 0, haha: 0, wow: 0, fire: 0, clap: 0 },
    gifts: (d.gifts as LiveGift[]) || [],
    pinnedComment: (d.pinnedComment as string) || undefined,
    replayUrl: (d.replayUrl as string) || undefined,
    replayAvailable: (d.replayAvailable as boolean) || false,
    userName: (d.userName as string) || '',
    userAvatar: (d.userAvatar as string) || '',
    isScreenSharing: (d.isScreenSharing as boolean) || false,
    multiGuestIds: (d.multiGuestIds as string[]) || [],
    category: (d.category as string) || undefined,
    hashtags: (d.hashtags as string[]) || undefined,
    mutedViewers: (d.mutedViewers as string[]) || [],
  };
}

export const useLiveStore = create<LiveStore>((set) => ({
  activeStreams: [],
  myStreams: [],
  currentStream: null,
  loading: false,

  startLive: async (userId, data) => {
    if (!isFirestoreAvailable()) return null;
    try {
      const user = await getDocById(COLLECTIONS.USERS, userId);
      const streamId = await addDocToCollection(COLLECTION_LIVE, {
        userId,
        ...data,
        isLive: true,
        startedAt: serverTimestamp(),
        viewers: [],
        viewerCount: 0,
        peakViewers: 0,
        comments: [],
        reactions: { like: 0, love: 0, haha: 0, wow: 0, fire: 0, clap: 0 },
        gifts: [],
        replayAvailable: false,
        userName: user?.name || '',
        userAvatar: user?.avatar || '',
        isScreenSharing: false,
        multiGuestIds: [],
        mutedViewers: [],
      });
      toast.success('Live stream started');
      return streamId;
    } catch (err) {
      console.error('startLive error:', err);
      toast.error('Failed to start live stream');
      return null;
    }
  },

  endLive: async (streamId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTION_LIVE, streamId, {
        isLive: false,
        endedAt: serverTimestamp(),
      });
      set({ currentStream: null });
      toast.success('Stream ended');
    } catch (err) {
      console.error('endLive error:', err);
      toast.error('Failed to end stream');
    }
  },

  joinLive: async (streamId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTION_LIVE, streamId, {
        viewers: arrayUnion(userId),
        viewerCount: increment(1),
      });
    } catch (err) {
      console.error('joinLive error:', err);
    }
  },

  leaveLive: async (streamId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      const stream = await getDocById(COLLECTION_LIVE, streamId);
      if (!stream) return;
      const viewers = (stream.viewers as string[]) || [];
      const newViewers = viewers.filter(id => id !== userId);
      const newCount = Math.max(0, (stream.viewerCount as number) || 0 - 1);
      await updateDocById(COLLECTION_LIVE, streamId, {
        viewers: newViewers,
        viewerCount: newCount,
      });
    } catch (err) {
      console.error('leaveLive error:', err);
    }
  },

  sendLiveComment: async (streamId, userId, content) => {
    if (!isFirestoreAvailable()) return;
    try {
      const user = await getDocById(COLLECTIONS.USERS, userId);
      await addDocToSubcollection(COLLECTION_LIVE, streamId, 'comments', {
        userId,
        content,
        timestamp: serverTimestamp(),
        userName: (user?.name as string) || '',
        isPinned: false,
        isModerator: false,
      });
    } catch (err) {
      console.error('sendLiveComment error:', err);
      toast.error('Failed to send comment');
    }
  },

  sendLiveReaction: async (streamId, reaction) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTION_LIVE, streamId, {
        [`reactions.${reaction}`]: increment(1),
      });
    } catch (err) {
      console.error('sendLiveReaction error:', err);
    }
  },

  sendLiveGift: async (streamId, userId, gift) => {
    if (!isFirestoreAvailable()) return;
    try {
      const user = await getDocById(COLLECTIONS.USERS, userId);
      await addDocToSubcollection(COLLECTION_LIVE, streamId, 'gifts', {
        ...gift,
        userId,
        timestamp: serverTimestamp(),
        userName: (user?.name as string) || '',
      });
      toast.success('Gift sent');
    } catch (err) {
      console.error('sendLiveGift error:', err);
      toast.error('Failed to send gift');
    }
  },

  pinComment: async (streamId, commentId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTION_LIVE, streamId, { pinnedComment: commentId });
    } catch (err) {
      console.error('pinComment error:', err);
      toast.error('Failed to pin comment');
    }
  },

  toggleScreenShare: async (streamId, isSharing) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTION_LIVE, streamId, { isScreenSharing: isSharing });
    } catch (err) {
      console.error('toggleScreenShare error:', err);
      toast.error('Failed to toggle screen share');
    }
  },

  addGuest: async (streamId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTION_LIVE, streamId, {
        multiGuestIds: arrayUnion(userId),
      });
    } catch (err) {
      console.error('addGuest error:', err);
      toast.error('Failed to add guest');
    }
  },

  removeGuest: async (streamId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTION_LIVE, streamId, {
        multiGuestIds: arrayRemove(userId),
      });
    } catch (err) {
      console.error('removeGuest error:', err);
      toast.error('Failed to remove guest');
    }
  },

  saveReplay: async (streamId, replayUrl) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTION_LIVE, streamId, {
        replayUrl,
        replayAvailable: true,
      });
      toast.success('Replay saved');
    } catch (err) {
      console.error('saveReplay error:', err);
      toast.error('Failed to save replay');
    }
  },

  getActiveStreams: async (limitCount = 50) => {
    if (!isFirestoreAvailable()) return [];
    try {
      const data = await queryCollection(COLLECTION_LIVE, [
        where('isLive', '==', true),
        orderBy('viewerCount', 'desc'),
        limit(limitCount),
      ]);
      return (data || []).map(mapLiveStream);
    } catch (err) {
      console.error('getActiveStreams error:', err);
      return [];
    }
  },

  getMyStreams: async (userId) => {
    if (!isFirestoreAvailable()) return [];
    try {
      const data = await queryCollection(COLLECTION_LIVE, [
        where('userId', '==', userId),
        orderBy('startedAt', 'desc'),
      ]);
      return (data || []).map(mapLiveStream);
    } catch (err) {
      console.error('getMyStreams error:', err);
      return [];
    }
  },

  getStreamById: async (streamId) => {
    if (!isFirestoreAvailable()) return null;
    try {
      const data = await getDocById(COLLECTION_LIVE, streamId);
      if (!data) return null;
      const stream = mapLiveStream(data);
      // Fetch comments and gifts from subcollections
      const [commentsData, giftsData] = await Promise.all([
        querySubcollection(COLLECTION_LIVE, streamId, 'comments', [orderBy('timestamp', 'desc'), limit(200)]),
        querySubcollection(COLLECTION_LIVE, streamId, 'gifts', [orderBy('timestamp', 'desc'), limit(200)]),
      ]);
      stream.comments = (commentsData || []).map((d: any) => ({
        id: d.id,
        userId: d.userId,
        content: d.content || '',
        timestamp: ((rawTs: any) => rawTs && typeof rawTs === 'object' && 'toDate' in rawTs ? rawTs.toDate() : rawTs ? new Date(rawTs as string | number | Date) : new Date())(d.createdAt ?? d.timestamp),
        userName: d.userName || '',
        isPinned: d.isPinned || false,
        isModerator: d.isModerator || false,
      }));
      stream.gifts = (giftsData || []).map((d: any) => ({
        id: d.id,
        userId: d.userId,
        type: d.type || 'heart',
        amount: d.amount || 0,
        currency: d.currency || 'coins',
        timestamp: ((rawTs: any) => rawTs && typeof rawTs === 'object' && 'toDate' in rawTs ? rawTs.toDate() : rawTs ? new Date(rawTs as string | number | Date) : new Date())(d.createdAt ?? d.timestamp),
        userName: d.userName || '',
        message: d.message || '',
      }));
      return stream;
    } catch (err) {
      console.error('getStreamById error:', err);
      return null;
    }
  },

  subscribeActiveStreams: () => {
    if (!isFirestoreAvailable()) return () => {};
    set({ loading: true });
    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeToCollection(
        COLLECTION_LIVE,
        [where('isLive', '==', true), orderBy('viewerCount', 'desc')],
        (data) => {
          const activeStreams = (data || []).map(mapLiveStream);
          set({ activeStreams, loading: false });
        }
      );
    } catch (err) {
      console.error('subscribeActiveStreams error:', err);
      set({ loading: false });
    }
    return () => { if (unsub) unsub(); };
  },
}));
