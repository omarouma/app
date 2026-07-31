/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';
import {
  isFirestoreAvailable, addDocToCollection,
  updateDocById, subscribeToCollection, queryCollection,
  serverTimestamp, arrayUnion, arrayRemove, COLLECTIONS
} from '@/lib/firestore';
import { where, orderBy } from '@/lib/firestore';
import { toast } from 'sonner';

export interface VoiceRoom {
  id: string;
  title: string;
  description: string;
  hostId: string;
  hostName: string;
  hostAvatar?: string;
  topic: string;
  category: string;
  participants: string[];
  raisedHands: string[];
  speakerIds: string[];
  coHostIds: string[];
  isLive: boolean;
  startedAt: Date;
  endedAt?: Date;
  maxParticipants: number;
  isPrivate: boolean;
  language: string;
  listenerCount: number;
  tags: string[];
}

interface VoiceRoomStore {
  rooms: VoiceRoom[];
  activeRoom: VoiceRoom | null;
  myRooms: VoiceRoom[];
  loading: boolean;
  createRoom: (userId: string, data: Partial<VoiceRoom>) => Promise<string | null>;
  joinRoom: (roomId: string, userId: string) => Promise<void>;
  leaveRoom: (roomId: string, userId: string) => Promise<void>;
  raiseHand: (roomId: string, userId: string) => Promise<void>;
  lowerHand: (roomId: string, userId: string) => Promise<void>;
  promoteToSpeaker: (roomId: string, userId: string) => Promise<void>;
  demoteToListener: (roomId: string, userId: string) => Promise<void>;
  endRoom: (roomId: string, userId: string) => Promise<void>;
  subscribeRooms: () => () => void;
  getRoomById: (roomId: string) => Promise<VoiceRoom | null>;
  searchRooms: (query: string) => Promise<VoiceRoom[]>;
  getPopularRooms: (limitCount?: number) => Promise<VoiceRoom[]>;
}

const mapRoom = (d: Record<string, unknown>): VoiceRoom => ({
  id: d.id as string,
  title: (d.title as string) || 'Untitled Room',
  description: (d.description as string) || '',
  hostId: (d.hostId as string) || '',
  hostName: (d.hostName as string) || 'Host',
  hostAvatar: (d.hostAvatar as string) || undefined,
  topic: (d.topic as string) || '',
  category: (d.category as string) || 'General',
  participants: (d.participants as string[]) || [],
  raisedHands: (d.raisedHands as string[]) || [],
  speakerIds: (d.speakerIds as string[]) || [],
  coHostIds: (d.coHostIds as string[]) || [],
  isLive: (d.isLive as boolean) ?? true,
  startedAt: d.startedAt && typeof d.startedAt === 'object' && 'toDate' in d.startedAt
    ? (d.startedAt as any).toDate()
    : d.startedAt ? new Date(d.startedAt as string) : new Date(),
  endedAt: d.endedAt && typeof d.endedAt === 'object' && 'toDate' in d.endedAt
    ? (d.endedAt as any).toDate()
    : d.endedAt ? new Date(d.endedAt as string) : undefined,
  maxParticipants: (d.maxParticipants as number) || 100,
  isPrivate: (d.isPrivate as boolean) || false,
  language: (d.language as string) || 'en',
  listenerCount: (d.listenerCount as number) || 0,
  tags: (d.tags as string[]) || [],
});

export const useVoiceRoomStore = create<VoiceRoomStore>((set, get) => ({
  rooms: [],
  activeRoom: null,
  myRooms: [],
  loading: false,

  createRoom: async (userId, data) => {
    if (!isFirestoreAvailable()) {
      toast.error('Cannot create room: Firestore unavailable');
      return null;
    }
    try {
      const roomId = await addDocToCollection(COLLECTIONS.VOICE_ROOMS, {
        ...data,
        hostId: userId,
        participants: [userId],
        speakerIds: [userId],
        raisedHands: [],
        coHostIds: [],
        isLive: true,
        startedAt: serverTimestamp(),
        listenerCount: 1,
      });
      toast.success('Room created! Invite friends to join.');
      return roomId;
    } catch (err) {
      console.error('createRoom error:', err);
      toast.error('Failed to create room');
      return null;
    }
  },

  joinRoom: async (roomId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTIONS.VOICE_ROOMS, roomId, {
        participants: arrayUnion(userId),
        listenerCount: (get().rooms.find(r => r.id === roomId)?.listenerCount || 0) + 1,
      });
    } catch (err) {
      console.error('joinRoom error:', err);
      toast.error('Failed to join room');
    }
  },

  leaveRoom: async (roomId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      const room = get().rooms.find(r => r.id === roomId);
      if (!room) return;
      const updates: any = {
        participants: arrayRemove(userId),
        speakerIds: arrayRemove(userId),
        raisedHands: arrayRemove(userId),
      };
      if (room.listenerCount > 0) {
        updates.listenerCount = room.listenerCount - 1;
      }
      // If host leaves, end the room
      if (room.hostId === userId) {
        updates.isLive = false;
        updates.endedAt = serverTimestamp();
      }
      await updateDocById(COLLECTIONS.VOICE_ROOMS, roomId, updates);
      set({ activeRoom: null });
    } catch (err) {
      console.error('leaveRoom error:', err);
    }
  },

  raiseHand: async (roomId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTIONS.VOICE_ROOMS, roomId, {
        raisedHands: arrayUnion(userId),
      });
      toast.success('Hand raised');
    } catch (err) {
      console.error('raiseHand error:', err);
    }
  },

  lowerHand: async (roomId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTIONS.VOICE_ROOMS, roomId, {
        raisedHands: arrayRemove(userId),
      });
    } catch (err) {
      console.error('lowerHand error:', err);
    }
  },

  promoteToSpeaker: async (roomId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTIONS.VOICE_ROOMS, roomId, {
        speakerIds: arrayUnion(userId),
        raisedHands: arrayRemove(userId),
      });
      toast.success('User promoted to speaker');
    } catch (err) {
      console.error('promoteToSpeaker error:', err);
    }
  },

  demoteToListener: async (roomId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTIONS.VOICE_ROOMS, roomId, {
        speakerIds: arrayRemove(userId),
      });
    } catch (err) {
      console.error('demoteToListener error:', err);
    }
  },

  endRoom: async (roomId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      const room = get().rooms.find(r => r.id === roomId);
      if (!room || room.hostId !== userId) {
        toast.error('Only the host can end the room');
        return;
      }
      await updateDocById(COLLECTIONS.VOICE_ROOMS, roomId, {
        isLive: false,
        endedAt: serverTimestamp(),
      });
      set({ activeRoom: null });
      toast.success('Room ended');
    } catch (err) {
      console.error('endRoom error:', err);
      toast.error('Failed to end room');
    }
  },

  subscribeRooms: () => {
    if (!isFirestoreAvailable()) {
      set({ rooms: [], loading: false });
      return () => {};
    }
    set({ loading: true });
    try {
      const unsub = subscribeToCollection(
        COLLECTIONS.VOICE_ROOMS,
        [where('isLive', '==', true), orderBy('startedAt', 'desc')],
        (data) => {
          const rooms = (data || []).map(mapRoom);
          set({ rooms, loading: false });
        }
      );
      return unsub;
    } catch (err) {
      console.error('subscribeRooms error:', err);
      set({ loading: false });
      return () => {};
    }
  },

  getRoomById: async (roomId) => {
    if (!isFirestoreAvailable()) return null;
    try {
      const data = await queryCollection(COLLECTIONS.VOICE_ROOMS, [where('id', '==', roomId)]);
      return data.length > 0 ? mapRoom(data[0]) : null;
    } catch (err) {
      console.error('getRoomById error:', err);
      return null;
    }
  },

  searchRooms: async (query) => {
    if (!isFirestoreAvailable()) return [];
    try {
      const data = await queryCollection(COLLECTIONS.VOICE_ROOMS, [
        where('isLive', '==', true),
        where('title', '>=', query),
        where('title', '<=', query + '\uf8ff'),
      ]);
      return (data || []).map(mapRoom);
    } catch (err) {
      console.error('searchRooms error:', err);
      return [];
    }
  },

  getPopularRooms: async (limitCount = 20) => {
    if (!isFirestoreAvailable()) return [];
    try {
      const data = await queryCollection(COLLECTIONS.VOICE_ROOMS, [
        where('isLive', '==', true),
        orderBy('listenerCount', 'desc'),
      ]);
      return (data || []).map(mapRoom).slice(0, limitCount);
    } catch (err) {
      console.error('getPopularRooms error:', err);
      return [];
    }
  },
}));
