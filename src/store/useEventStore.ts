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
  Timestamp,
} from '@/lib/firestore';
import { where, orderBy, limit } from '@/lib/firestore';
import { toast } from 'sonner';
import type { EventData } from '@/types';

const COLLECTION_EVENTS = 'events';

interface EventStore {
  events: EventData[];
  myEvents: EventData[];
  loading: boolean;
  createEvent: (userId: string, data: Omit<EventData, 'id' | 'userId' | 'createdAt' | 'attendees' | 'maybes' | 'notGoing' | 'invited'>) => Promise<void>;
  editEvent: (eventId: string, data: Partial<EventData>) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;
  joinEvent: (eventId: string, userId: string) => Promise<void>;
  leaveEvent: (eventId: string, userId: string) => Promise<void>;
  maybeEvent: (eventId: string, userId: string) => Promise<void>;
  inviteToEvent: (eventId: string, userId: string, invitedUserIds: string[]) => Promise<void>;
  getUpcomingEvents: (limitCount?: number) => Promise<EventData[]>;
  getMyEvents: (userId: string) => Promise<EventData[]>;
  getNearbyEvents: (lat: number, lng: number, radiusKm: number) => Promise<EventData[]>;
  subscribeEvents: () => () => void;
}

function mapEvent(d: Record<string, unknown>): EventData {
  const startDate = d.startDate && typeof d.startDate === 'object' && 'toDate' in d.startDate
    ? (d.startDate as any).toDate()
    : d.startDate ? new Date(d.startDate as string) : new Date();
  const endDate = d.endDate && typeof d.endDate === 'object' && 'toDate' in d.endDate
    ? (d.endDate as any).toDate()
    : d.endDate ? new Date(d.endDate as string) : new Date();
  const createdAt = d.createdAt && typeof d.createdAt === 'object' && 'toDate' in d.createdAt
    ? (d.createdAt as any).toDate()
    : d.createdAt ? new Date(d.createdAt as string) : new Date();
  return {
    id: d.id as string,
    userId: d.userId as string,
    title: (d.title as string) || '',
    description: (d.description as string) || '',
    location: (d.location as string) || '',
    lat: (d.lat as number) || undefined,
    lng: (d.lng as number) || undefined,
    startDate,
    endDate,
    coverImage: (d.coverImage as string) || undefined,
    attendees: (d.attendees as string[]) || [],
    maybes: (d.maybes as string[]) || [],
    notGoing: (d.notGoing as string[]) || [],
    invited: (d.invited as string[]) || [],
    privacy: (d.privacy as 'public' | 'friends' | 'private') || 'public',
    cost: (d.cost as number) || undefined,
    currency: (d.currency as 'BDT' | 'USD') || undefined,
    isOnline: (d.isOnline as boolean) || false,
    onlineLink: (d.onlineLink as string) || undefined,
    category: (d.category as string) || undefined,
    capacity: (d.capacity as number) || undefined,
    createdAt,
    userName: (d.userName as string) || '',
    userAvatar: (d.userAvatar as string) || '',
  };
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const useEventStore = create<EventStore>((set, get) => ({
  events: [],
  myEvents: [],
  loading: false,

  createEvent: async (userId, data) => {
    if (!isFirestoreAvailable()) return;
    try {
      const user = await getDocById(COLLECTIONS.USERS, userId);
      await addDocToCollection(COLLECTION_EVENTS, {
        userId,
        ...data,
        attendees: [],
        maybes: [],
        notGoing: [],
        invited: [],
        createdAt: serverTimestamp(),
        userName: user?.name || '',
        userAvatar: user?.avatar || '',
      });
      toast.success('Event created');
    } catch (err) {
      console.error('createEvent error:', err);
      toast.error('Failed to create event');
    }
  },

  editEvent: async (eventId, data) => {
    if (!isFirestoreAvailable()) return;
    try {
      const update: Record<string, unknown> = {};
      if (data.title !== undefined) update.title = data.title;
      if (data.description !== undefined) update.description = data.description;
      if (data.location !== undefined) update.location = data.location;
      if (data.lat !== undefined) update.lat = data.lat;
      if (data.lng !== undefined) update.lng = data.lng;
      if (data.startDate !== undefined) update.startDate = data.startDate;
      if (data.endDate !== undefined) update.endDate = data.endDate;
      if (data.coverImage !== undefined) update.coverImage = data.coverImage;
      if (data.privacy !== undefined) update.privacy = data.privacy;
      if (data.cost !== undefined) update.cost = data.cost;
      if (data.currency !== undefined) update.currency = data.currency;
      if (data.isOnline !== undefined) update.isOnline = data.isOnline;
      if (data.onlineLink !== undefined) update.onlineLink = data.onlineLink;
      if (data.category !== undefined) update.category = data.category;
      if (data.capacity !== undefined) update.capacity = data.capacity;
      await updateDocById(COLLECTION_EVENTS, eventId, update);
      toast.success('Event updated');
    } catch (err) {
      console.error('editEvent error:', err);
      toast.error('Failed to update event');
    }
  },

  deleteEvent: async (eventId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await deleteDocById(COLLECTION_EVENTS, eventId);
      set({ events: get().events.filter(e => e.id !== eventId) });
      toast.success('Event deleted');
    } catch (err) {
      console.error('deleteEvent error:', err);
      toast.error('Failed to delete event');
    }
  },

  joinEvent: async (eventId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTION_EVENTS, eventId, {
        attendees: arrayUnion(userId),
        maybes: arrayRemove(userId),
        notGoing: arrayRemove(userId),
      });
      toast.success('You are going');
    } catch (err) {
      console.error('joinEvent error:', err);
      toast.error('Failed to join event');
    }
  },

  leaveEvent: async (eventId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTION_EVENTS, eventId, {
        attendees: arrayRemove(userId),
        maybes: arrayRemove(userId),
        notGoing: arrayUnion(userId),
      });
      toast.success('RSVP updated');
    } catch (err) {
      console.error('leaveEvent error:', err);
      toast.error('Failed to update RSVP');
    }
  },

  maybeEvent: async (eventId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTION_EVENTS, eventId, {
        maybes: arrayUnion(userId),
        attendees: arrayRemove(userId),
        notGoing: arrayRemove(userId),
      });
      toast.success('You might go');
    } catch (err) {
      console.error('maybeEvent error:', err);
      toast.error('Failed to update RSVP');
    }
  },

  inviteToEvent: async (eventId, userId, invitedUserIds) => {
    if (!isFirestoreAvailable()) return;
    try {
      for (const id of invitedUserIds) {
        await updateDocById(COLLECTION_EVENTS, eventId, {
          invited: arrayUnion(id),
        });
      }
      toast.success('Invitations sent');
    } catch (err) {
      console.error('inviteToEvent error:', err);
      toast.error('Failed to send invitations');
    }
  },

  getUpcomingEvents: async (limitCount = 50) => {
    if (!isFirestoreAvailable()) return [];
    try {
      const now = new Date();
      const data = await queryCollection(COLLECTION_EVENTS, [
        where('startDate', '>', Timestamp.fromDate(now)),
        orderBy('startDate', 'asc'),
        limit(limitCount),
      ]);
      return (data || []).map(mapEvent);
    } catch (err) {
      console.error('getUpcomingEvents error:', err);
      return [];
    }
  },

  getMyEvents: async (userId) => {
    if (!isFirestoreAvailable()) return [];
    try {
      const data = await queryCollection(COLLECTION_EVENTS, [
        where('userId', '==', userId),
        orderBy('startDate', 'desc'),
      ]);
      return (data || []).map(mapEvent);
    } catch (err) {
      console.error('getMyEvents error:', err);
      return [];
    }
  },

  getNearbyEvents: async (lat, lng, radiusKm) => {
    if (!isFirestoreAvailable()) return [];
    try {
      const data = await queryCollection(COLLECTION_EVENTS, [
        orderBy('startDate', 'asc'),
        limit(200),
      ]);
      const events = (data || []).map(mapEvent).filter(e => {
        if (e.lat === undefined || e.lng === undefined) return false;
        const dist = haversineDistance(lat, lng, e.lat, e.lng);
        return dist <= radiusKm;
      });
      return events;
    } catch (err) {
      console.error('getNearbyEvents error:', err);
      return [];
    }
  },

  subscribeEvents: () => {
    if (!isFirestoreAvailable()) return () => {};
    set({ loading: true });
    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeToCollection(
        COLLECTION_EVENTS,
        [orderBy('startDate', 'asc')],
        (data) => {
          const events = (data || []).map(mapEvent);
          set({ events, loading: false });
        }
      );
    } catch (err) {
      console.error('subscribeEvents error:', err);
      set({ loading: false });
    }
    return () => { if (unsub) unsub(); };
  },
}));
