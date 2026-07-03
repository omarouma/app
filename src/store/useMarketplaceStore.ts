/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';
import {
  isFirestoreAvailable,
  COLLECTIONS,
  getDocById,
  updateDocById,
  addDocToCollection,
  addDocToSubcollection,
  updateSubcollectionDoc,
  queryCollection,
  subscribeToCollection,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from '@/lib/firestore';
import { where, orderBy, limit } from '@/lib/firestore';
import { toast } from 'sonner';
import type { MarketplaceItem, MarketplaceOffer } from '@/types';

const COLLECTION_MARKETPLACE = 'marketplace';

interface MarketplaceStore {
  listings: MarketplaceItem[];
  myListings: MarketplaceItem[];
  favorites: MarketplaceItem[];
  loading: boolean;
  createListing: (userId: string, data: Omit<MarketplaceItem, 'id' | 'userId' | 'createdAt' | 'favorites' | 'views' | 'status' | 'offers' | 'chatRequests'>) => Promise<void>;
  editListing: (listingId: string, data: Partial<MarketplaceItem>) => Promise<void>;
  deleteListing: (listingId: string) => Promise<void>;
  markAsSold: (listingId: string) => Promise<void>;
  addToFavorites: (listingId: string, userId: string) => Promise<void>;
  removeFromFavorites: (listingId: string, userId: string) => Promise<void>;
  makeOffer: (listingId: string, userId: string, amount: number, message: string) => Promise<void>;
  acceptOffer: (listingId: string, offerId: string) => Promise<void>;
  rejectOffer: (listingId: string, offerId: string) => Promise<void>;
  getListings: (category?: string, limitCount?: number) => Promise<MarketplaceItem[]>;
  getMyListings: (userId: string) => Promise<MarketplaceItem[]>;
  getFavorites: (userId: string) => Promise<MarketplaceItem[]>;
  getNearbyListings: (lat: number, lng: number, radiusKm: number) => Promise<MarketplaceItem[]>;
  subscribeListings: () => () => void;
}

function mapListing(d: Record<string, unknown>): MarketplaceItem {
  const createdAt = d.createdAt && typeof d.createdAt === 'object' && 'toDate' in d.createdAt
    ? (d.createdAt as any).toDate()
    : d.createdAt ? new Date(d.createdAt as string) : new Date();
  return {
    id: d.id as string,
    userId: d.userId as string,
    title: (d.title as string) || '',
    description: (d.description as string) || '',
    price: (d.price as number) || 0,
    currency: (d.currency as 'BDT' | 'USD') || 'BDT',
    images: (d.images as string[]) || [],
    category: (d.category as string) || '',
    condition: (d.condition as 'new' | 'like_new' | 'good' | 'fair' | 'poor') || 'good',
    location: (d.location as string) || '',
    lat: (d.lat as number) || undefined,
    lng: (d.lng as number) || undefined,
    isNegotiable: (d.isNegotiable as boolean) || false,
    status: (d.status as 'active' | 'sold' | 'reserved' | 'deleted') || 'active',
    favorites: (d.favorites as string[]) || [],
    views: (d.views as number) || 0,
    createdAt,
    userName: (d.userName as string) || '',
    userAvatar: (d.userAvatar as string) || '',
    offers: (d.offers as MarketplaceOffer[]) || [],
    chatRequests: (d.chatRequests as string[]) || [],
    tags: (d.tags as string[]) || [],
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

export const useMarketplaceStore = create<MarketplaceStore>((set, get) => ({
  listings: [],
  myListings: [],
  favorites: [],
  loading: false,

  createListing: async (userId, data) => {
    if (!isFirestoreAvailable()) return;
    try {
      const user = await getDocById(COLLECTIONS.USERS, userId);
      await addDocToCollection(COLLECTION_MARKETPLACE, {
        userId,
        ...data,
        favorites: [],
        views: 0,
        status: 'active',
        offers: [],
        chatRequests: [],
        createdAt: serverTimestamp(),
        userName: user?.name || '',
        userAvatar: user?.avatar || '',
      });
      toast.success('Listing created');
    } catch (err) {
      console.error('createListing error:', err);
      toast.error('Failed to create listing');
    }
  },

  editListing: async (listingId, data) => {
    if (!isFirestoreAvailable()) return;
    try {
      const update: Record<string, unknown> = {};
      if (data.title !== undefined) update.title = data.title;
      if (data.description !== undefined) update.description = data.description;
      if (data.price !== undefined) update.price = data.price;
      if (data.images !== undefined) update.images = data.images;
      if (data.category !== undefined) update.category = data.category;
      if (data.condition !== undefined) update.condition = data.condition;
      if (data.location !== undefined) update.location = data.location;
      if (data.lat !== undefined) update.lat = data.lat;
      if (data.lng !== undefined) update.lng = data.lng;
      if (data.isNegotiable !== undefined) update.isNegotiable = data.isNegotiable;
      if (data.tags !== undefined) update.tags = data.tags;
      await updateDocById(COLLECTION_MARKETPLACE, listingId, update);
      toast.success('Listing updated');
    } catch (err) {
      console.error('editListing error:', err);
      toast.error('Failed to update listing');
    }
  },

  deleteListing: async (listingId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTION_MARKETPLACE, listingId, { status: 'deleted' });
      set({ listings: get().listings.filter(l => l.id !== listingId) });
      toast.success('Listing removed');
    } catch (err) {
      console.error('deleteListing error:', err);
      toast.error('Failed to remove listing');
    }
  },

  markAsSold: async (listingId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTION_MARKETPLACE, listingId, { status: 'sold' });
      set({
        listings: get().listings.map(l => l.id === listingId ? { ...l, status: 'sold' as const } : l),
      });
      toast.success('Marked as sold');
    } catch (err) {
      console.error('markAsSold error:', err);
      toast.error('Failed to mark as sold');
    }
  },

  addToFavorites: async (listingId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTION_MARKETPLACE, listingId, {
        favorites: arrayUnion(userId),
      });
      toast.success('Added to favorites');
    } catch (err) {
      console.error('addToFavorites error:', err);
      toast.error('Failed to add favorite');
    }
  },

  removeFromFavorites: async (listingId, userId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateDocById(COLLECTION_MARKETPLACE, listingId, {
        favorites: arrayRemove(userId),
      });
      set({
        favorites: get().favorites.filter(f => f.id !== listingId),
      });
      toast.success('Removed from favorites');
    } catch (err) {
      console.error('removeFromFavorites error:', err);
      toast.error('Failed to remove favorite');
    }
  },

  makeOffer: async (listingId, userId, amount, message) => {
    if (!isFirestoreAvailable()) return;
    try {
      const user = await getDocById(COLLECTIONS.USERS, userId);
      await addDocToSubcollection(COLLECTION_MARKETPLACE, listingId, 'offers', {
        userId,
        amount,
        message,
        status: 'pending',
        timestamp: serverTimestamp(),
        userName: (user?.name as string) || '',
      });
      toast.success('Offer sent');
    } catch (err) {
      console.error('makeOffer error:', err);
      toast.error('Failed to send offer');
    }
  },

  acceptOffer: async (listingId, offerId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateSubcollectionDoc(COLLECTION_MARKETPLACE, listingId, 'offers', offerId, { status: 'accepted' });
      await updateDocById(COLLECTION_MARKETPLACE, listingId, { status: 'reserved' });
      toast.success('Offer accepted');
    } catch (err) {
      console.error('acceptOffer error:', err);
      toast.error('Failed to accept offer');
    }
  },

  rejectOffer: async (listingId, offerId) => {
    if (!isFirestoreAvailable()) return;
    try {
      await updateSubcollectionDoc(COLLECTION_MARKETPLACE, listingId, 'offers', offerId, { status: 'rejected' });
      toast.success('Offer rejected');
    } catch (err) {
      console.error('rejectOffer error:', err);
      toast.error('Failed to reject offer');
    }
  },

  getListings: async (category, limitCount = 50) => {
    if (!isFirestoreAvailable()) return [];
    try {
      const constraints: any[] = [where('status', '==', 'active'), orderBy('createdAt', 'desc'), limit(limitCount)];
      if (category) constraints.unshift(where('category', '==', category));
      const data = await queryCollection(COLLECTION_MARKETPLACE, constraints);
      return (data || []).map(mapListing);
    } catch (err) {
      console.error('getListings error:', err);
      return [];
    }
  },

  getMyListings: async (userId) => {
    if (!isFirestoreAvailable()) return [];
    try {
      const data = await queryCollection(COLLECTION_MARKETPLACE, [
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
      ]);
      return (data || []).map(mapListing);
    } catch (err) {
      console.error('getMyListings error:', err);
      return [];
    }
  },

  getFavorites: async (userId) => {
    if (!isFirestoreAvailable()) return [];
    try {
      const data = await queryCollection(COLLECTION_MARKETPLACE, [
        where('favorites', 'array-contains', userId),
        where('status', '==', 'active'),
        orderBy('createdAt', 'desc'),
      ]);
      return (data || []).map(mapListing);
    } catch (err) {
      console.error('getFavorites error:', err);
      return [];
    }
  },

  getNearbyListings: async (lat, lng, radiusKm) => {
    if (!isFirestoreAvailable()) return [];
    try {
      const data = await queryCollection(COLLECTION_MARKETPLACE, [
        where('status', '==', 'active'),
        orderBy('createdAt', 'desc'),
        limit(200),
      ]);
      const listings = (data || []).map(mapListing).filter(l => {
        if (l.lat === undefined || l.lng === undefined) return false;
        const dist = haversineDistance(lat, lng, l.lat, l.lng);
        return dist <= radiusKm;
      });
      return listings;
    } catch (err) {
      console.error('getNearbyListings error:', err);
      return [];
    }
  },

  subscribeListings: () => {
    if (!isFirestoreAvailable()) return () => {};
    set({ loading: true });
    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeToCollection(
        COLLECTION_MARKETPLACE,
        [where('status', '==', 'active'), orderBy('createdAt', 'desc')],
        (data) => {
          const listings = (data || []).map(mapListing);
          set({ listings, loading: false });
        }
      );
    } catch (err) {
      console.error('subscribeListings error:', err);
      set({ loading: false });
    }
    return () => { if (unsub) unsub(); };
  },
}));
