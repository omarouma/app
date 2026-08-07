import { create } from 'zustand';
import {
  isFirestoreAvailable,
  COLLECTIONS,
  getDocById,
  setDocById,
  updateDocById,
  deleteDocById,
  addDocToCollection,
  queryCollection,
  subscribeToCollection,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from '@/lib/firestore';
import type { User, FriendRequest, FriendStatus, SentRequest, BlockedUserRecord, SuggestedUser } from '@/types';
import { where, orderBy, limit } from '@/lib/firestore';
import { toast } from 'sonner';

type FirestoreTimestamp = { toDate: () => Date };
function isFirestoreTs(v: unknown): v is FirestoreTimestamp {
  return typeof v === 'object' && v !== null && 'toDate' in v;
}
function toDate(raw: unknown): Date {
  if (isFirestoreTs(raw)) return raw.toDate();
  if (raw) return new Date(raw as string | number | Date);
  return new Date();
}
function toDateOrNull(raw: unknown): Date | null {
  if (isFirestoreTs(raw)) return raw.toDate();
  if (raw) return new Date(raw as string | number | Date);
  return null;
}

interface BroadcastListData {
  id: string;
  userId: string;
  name: string;
  recipientIds: string[];
  createdAt: Date;
}

interface FriendStore {
  friends: User[];
  friendMap: Map<string, User>;
  requests: FriendRequest[];
  sentRequests: SentRequest[];
  blockedUsers: BlockedUserRecord[];
  loading: {
    friends: boolean;
    sentRequests: boolean;
    blocked: boolean;
  };
  loadingFriends: boolean;
  loadingSentRequests: boolean;
  loadingBlocked: boolean;

  
  
  subscribeFriends: (userId: string) => () => void;
  subscribeSentRequests: (userId: string) => () => void;
  subscribeBlockedUsers: (userId: string) => () => void;
  sendRequest: (toUserId: string, fromUserId: string) => Promise<void>;
  acceptRequest: (requestId: string) => Promise<void>;
  rejectRequest: (requestId: string) => Promise<void>;
  cancelRequest: (requestId: string) => Promise<void>;
  toggleFavorite: (userId: string, currentUserId: string, currentFavorites: string[]) => Promise<void>;
  removeFriend: (userId: string, currentUserId: string) => Promise<void>;
  blockUser: (blockedId: string, blockerId: string, reason?: string) => Promise<void>;
  unblockUser: (blockedId: string, blockerId: string) => Promise<void>;
  reportUser: (report: { reporterId: string; reportedId: string; reason: string; details?: string }) => Promise<void>;
  getUserById: (userId: string) => Promise<User | null>;
  getFriendStatus: (currentUserId: string, otherUserId: string) => Promise<FriendStatus>;
  getMutualFriendsCount: (user1: string, user2: string) => Promise<number>;
  getSuggestedFriends: (userId: string) => Promise<SuggestedUser[]>;
  getSentRequests: (userId: string) => Promise<void>;
  getBlockedUsers: (userId: string) => Promise<void>;
  checkPrivacyBeforeSend: (fromId: string, toId: string) => Promise<{ ok: boolean; reason?: string }>;
  getRecentContacts: (userId: string) => Promise<User[]>;
  followUser: (userId: string, currentUserId: string) => Promise<void>;
  unfollowUser: (userId: string, currentUserId: string) => Promise<void>;
  toggleCloseFriend: (userId: string, currentUserId: string, currentCloseFriends: string[]) => Promise<void>;
  getFollowers: (userId: string) => Promise<User[]>;
  getFollowing: (userId: string) => Promise<User[]>;
  createBroadcastList: (userId: string, name: string, recipientIds: string[]) => Promise<string | null>;
  getBroadcastLists: (userId: string) => Promise<BroadcastListData[]>;
  deleteBroadcastList: (listId: string) => Promise<void>;
  sendBroadcast: (userId: string, recipientIds: string[], content: string, type?: string, mediaUrl?: string) => Promise<{ sent: number; failed: number }>;
  setGroupAddPrivacy: (userId: string, setting: 'everyone' | 'friends_of_friends' | 'nobody') => Promise<void>;
  getGroupAddPrivacy: (userId: string) => Promise<'everyone' | 'friends_of_friends' | 'nobody'>;
}

const mapUser = (u: Record<string, unknown>): User => ({
  id: u.id as string,
  name: (u.name as string) || 'User',
  displayName: (u.displayName as string) || (u.name as string) || 'User',
  username: (u.username as string) || '',
  email: (u.email as string) || '',
  phone: (u.phone as string) || '',
  avatar: (u.avatar as string) || '',
  coverImage: (u.coverImage as string) || '',
  status: (u.status as string) || 'offline',
  statusMessage: (u.statusMessage as string) || '',
  lastSeen: toDateOrNull(u.lastSeen),
  coins: (u.coins as number) || 0,
  bdtBalance: (u.bdtBalance as number) || 0,
  savedPosts: (u.savedPosts as string[]) || [],
  blockedUsers: (u.blockedUsers as string[]) || [],
  favorites: (u.favorites as string[]) || [],
  friends: (u.friends as string[]) || [],
  bio: (u.bio as string) || '',
  location: (u.location as string) || '',
  website: (u.website as string) || '',
  verified: (u.verified as boolean) || false,
  interests: (u.interests as string[]) || [],
  friendCount: (u.friendCount as number) || 0,
  latitude: (u.latitude as number) || undefined,
  longitude: (u.longitude as number) || undefined,
  friendRequestPrivacy: (u.friendRequestPrivacy as 'everyone' | 'friends_of_friends' | 'nobody') || 'everyone',
  hideFriendList: (u.hideFriendList as boolean) || false,
  hideOnlineStatus: (u.hideOnlineStatus as boolean) || false,
  isAdmin: (u.isAdmin as boolean) || false,
  isPremium: (u.isPremium as boolean) || false,
  premiumExpiresAt: u.premiumExpiresAt ? new Date(u.premiumExpiresAt as string) : undefined,
  followers: (u.followers as string[]) || [],
  following: (u.following as string[]) || [],
  closeFriends: (u.closeFriends as string[]) || [],
  groupAddPrivacy: (u.groupAddPrivacy as 'everyone' | 'friends_of_friends' | 'nobody') || 'everyone',
  disappearingMessagesDefault: (u.disappearingMessagesDefault as number) || 0,
  chatLocks: (u.chatLocks as Record<string, boolean>) || {},
  chatLockPins: (u.chatLockPins as Record<string, string>) || {},
  broadcastLists: (u.broadcastLists as string[]) || [],
  contactsOnlyInApp: (u.contactsOnlyInApp as string[]) || [],
});

// Module-level batch fetch — reused by subscribe callbacks and one-shot getters
const batchFetchUsers = async (ids: string[]): Promise<User[]> => {
  if (!ids.length) return [];
  try {
    const data = await queryCollection(COLLECTIONS.USERS, [where('id', 'in', ids.slice(0, 30))]);
    return (data || []).map((u: Record<string, unknown>) => mapUser(u));
  } catch {
    const users: User[] = [];
    for (const id of ids) {
      const u = await getDocById(COLLECTIONS.USERS, id);
      if (u) users.push(mapUser(u));
    }
    return users;
  }
};

export const useFriendStore = create<FriendStore>((set, get) => ({
  friends: [],
  friendMap: new Map(),
  requests: [],
  sentRequests: [],
  blockedUsers: [],
  loading: {
    friends: true,
    sentRequests: false,
    blocked: false,
  },
  loadingFriends: true,
  loadingSentRequests: false,
  loadingBlocked: false,

  subscribeSentRequests: (userId: string) => {
    if (!isFirestoreAvailable()) return () => {};
    set((state) => ({ loading: { ...state.loading, sentRequests: true } }));
    if (!userId) {
      set((state) => ({ loading: { ...state.loading, sentRequests: false } }));
      return () => {};
    }
    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeToCollection(
        COLLECTIONS.FRIEND_REQUESTS,
        [where('fromUserId', '==', userId), where('status', '==', 'pending')],
        async (data) => {
          const raw = data || [];
          const recipientIds = [...new Set(raw.map((d: Record<string, unknown>) => d.toUserId as string).filter(Boolean))];
          const profiles = await batchFetchUsers(recipientIds);
          const profileMap = Object.fromEntries(profiles.map((u) => [u.id, u]));
          const sentRequests: SentRequest[] = raw.map((d: Record<string, unknown>) => ({
            id: d.id as string,
            toUserId: d.toUserId as string,
            status: d.status as SentRequest['status'],
            toUser: profileMap[d.toUserId as string] || undefined,
            timestamp: toDate(d.createdAt ?? d.timestamp),
          }));
          set((state) => ({ sentRequests, loading: { ...state.loading, sentRequests: false } }));
        },
      );
    } catch {
      set((state) => ({ loading: { ...state.loading, sentRequests: false } }));
    }
    return () => { if (unsub) unsub(); };
  },

  subscribeBlockedUsers: (userId: string) => {
    if (!isFirestoreAvailable()) return () => {};
    set({ loadingBlocked: true });
    if (!userId) { set({ loadingBlocked: false }); return () => {}; }
    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeToCollection(
        COLLECTIONS.BLOCKED_USERS,
        [where('blockerId', '==', userId)],
        async (data) => {
          const raw = data || [];
          const blockedIds = [...new Set(raw.map((d: Record<string, unknown>) => d.blockedId as string).filter(Boolean))];
          const profiles = await batchFetchUsers(blockedIds);
          const profileMap = Object.fromEntries(profiles.map((u) => [u.id, u]));
          const blockedUsers: BlockedUserRecord[] = raw.map((d: Record<string, unknown>) => ({
            id: d.id as string,
            blockerId: d.blockerId as string,
            blockedId: d.blockedId as string,
            reason: (d.reason as string) || '',
            blockedUser: profileMap[d.blockedId as string] || undefined,
            createdAt: (d.createdAt && typeof d.createdAt === 'object' && 'toDate' in d.createdAt)
              ? (d.createdAt as { toDate: () => Date }).toDate()
              : new Date(d.createdAt as string),
          }));
          set({ blockedUsers, loadingBlocked: false });
        },
      );
    } catch { set({ loadingBlocked: false }); }
    return () => { if (unsub) unsub(); };
  },

  subscribeFriends: (userId: string) => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.subscribeFriends] Firestore unavailable');
      set({ loadingFriends: false, friends: [], requests: [], sentRequests: [], blockedUsers: [] });
      return () => {};
    }
    set({ loadingFriends: true });
    if (!userId) {
      set({ friends: [], requests: [], sentRequests: [], blockedUsers: [], loadingFriends: false });
      return () => {};
    }

    let unsubFriends: (() => void) | null = null;
    let unsubRequests: (() => void) | null = null;

    try {
      // ── Friends (batch fetch profiles) ──────────────────────────
      unsubFriends = subscribeToCollection(
        COLLECTIONS.FRIENDSHIPS,
        [where('userId', '==', userId)],
        async (data) => {
          const friendIds = (data || [])
            .map((f: Record<string, unknown>) => f.friendId as string)
            .filter(Boolean);
          const friends = await batchFetchUsers(friendIds);
          const friendMap = new Map(friends.map((f) => [f.id, f]));

          set((state) => {
            const currentIds = state.friends.map((f) => f.id).join(',');
            const newIds = friends.map((f) => f.id).join(',');
            if (currentIds === newIds) {
              return { friendMap, loadingFriends: false };
            }
            return { friends, friendMap, loadingFriends: false };
          });
        },
      );

      // ── Incoming requests (enrich sender profiles inline) ────────
      unsubRequests = subscribeToCollection(
        COLLECTIONS.FRIEND_REQUESTS,
        [where('toUserId', '==', userId), where('status', '==', 'pending')],
        async (data) => {
          const raw = data || [];
          const senderIds = [...new Set(raw.map((d: Record<string, unknown>) => d.fromUserId as string).filter(Boolean))];
          const senderProfiles = await batchFetchUsers(senderIds);
          const senderMap = Object.fromEntries(senderProfiles.map((u) => [u.id, u]));
          const requests: FriendRequest[] = raw.map((d: Record<string, unknown>) => ({
            id: d.id as string,
            from: d.fromUserId as string,
            to: d.toUserId as string,
            status: d.status as FriendRequest['status'],
            fromUser: senderMap[d.fromUserId as string] || null,
            timestamp: (d.createdAt && typeof d.createdAt === 'object' && 'toDate' in d.createdAt)
              ? (d.createdAt as { toDate: () => Date }).toDate()
              : new Date((d.createdAt ?? d.timestamp) as string),
          }));
          set({ requests });
        },
      );
    } catch {
      set({ loadingFriends: false });
    }

    return () => {
      if (unsubFriends) unsubFriends();
      if (unsubRequests) unsubRequests();
    };
  },

  checkPrivacyBeforeSend: async (fromId: string, toId: string) => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.checkPrivacyBeforeSend] Firestore unavailable');
      return { ok: false, reason: 'firestore_unavailable' };
    }
    try {
      // Check if blocked by target user
      const blocked = await queryCollection(COLLECTIONS.BLOCKED_USERS, [
        where('blockerId', '==', toId),
        where('blockedId', '==', fromId),
      ]);
      if ((blocked || []).length > 0) return { ok: false, reason: 'blocked' };

      // Check privacy setting
      const user = await getDocById(COLLECTIONS.USERS, toId);
      const setting = user?.friendRequestPrivacy || 'everyone';
      if (setting === 'nobody') return { ok: false, reason: 'privacy' };
      if (setting === 'friends_of_friends') {
        // Check mutual friends
        const f1 = await queryCollection(COLLECTIONS.FRIENDSHIPS, [where('userId', '==', fromId)]);
        const f2 = await queryCollection(COLLECTIONS.FRIENDSHIPS, [where('userId', '==', toId)]);
        const ids1 = new Set((f1 || []).map((f: Record<string, unknown>) => f.friendId as string));
        const ids2 = new Set((f2 || []).map((f: Record<string, unknown>) => f.friendId as string));
        let hasMutual = false;
        ids1.forEach((id) => { if (ids2.has(id as string)) hasMutual = true; });
        if (!hasMutual) return { ok: false, reason: 'friends_of_friends' };
      }
      return { ok: true };
    } catch {
      return { ok: false, reason: 'privacy_check_failed' };
    }
  },

  sendRequest: async (toUserId: string, fromUserId: string) => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.sendRequest] Firestore unavailable');
      return;
    }
    if (!fromUserId || !toUserId) return;
    if (fromUserId === toUserId) throw new Error('Cannot send request to yourself');

    try {
      // Check privacy
      const privacyCheck = await get().checkPrivacyBeforeSend(fromUserId, toUserId);
      if (!privacyCheck.ok) {
        const msgs: Record<string, string> = {
          blocked: 'You cannot send a request to this user',
          privacy: 'This user is not accepting friend requests',
          friends_of_friends: 'You must have a mutual friend to send a request',
          rate_limit: 'You have sent too many requests. Try again later.',
        };
        throw new Error(msgs[privacyCheck.reason || ''] || 'Cannot send friend request');
      }

      // Check if already friends
      const existingFriend = await queryCollection(COLLECTIONS.FRIENDSHIPS, [
        where('userId', '==', fromUserId),
        where('friendId', '==', toUserId),
      ]);
      if (existingFriend.length > 0) throw new Error('Already friends');

      // Check if already blocked
      const blocked = await queryCollection(COLLECTIONS.BLOCKED_USERS, [
        where('blockerId', '==', fromUserId),
        where('blockedId', '==', toUserId),
      ]);
      if (blocked.length > 0) throw new Error('You have blocked this user. Unblock to send a request.');

      // Check existing request (either direction)
      const existingReq = await queryCollection(COLLECTIONS.FRIEND_REQUESTS, [
        where('fromUserId', '==', fromUserId),
        where('toUserId', '==', toUserId),
        where('status', '==', 'pending'),
      ]);
      if (existingReq.length > 0) throw new Error('Request already sent');

      // Check if they sent us a request (auto-accept)
      const incomingReq = await queryCollection(COLLECTIONS.FRIEND_REQUESTS, [
        where('fromUserId', '==', toUserId),
        where('toUserId', '==', fromUserId),
        where('status', '==', 'pending'),
      ]);
      if (incomingReq.length > 0) {
        await get().acceptRequest(incomingReq[0].id);
        return;
      }

      // Insert request
      const reqId = await addDocToCollection(COLLECTIONS.FRIEND_REQUESTS, {
        fromUserId,
        toUserId,
        status: 'pending',
        timestamp: serverTimestamp(),
      });

      // Note: Notifications are auto-created by database trigger
      // (avoiding RLS violation of inserting for other users)

      set((s) => ({
        sentRequests: [...s.sentRequests, { id: reqId, toUserId, status: 'pending', timestamp: new Date() }],
      }));
    } catch (err: unknown) {
      console.error('Send request error:', err);
      throw err;
    }
  },

  acceptRequest: async (requestId: string) => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.acceptRequest] Firestore unavailable');
      return;
    }
    try {
      const req = await getDocById(COLLECTIONS.FRIEND_REQUESTS, requestId);
      if (!req) return;

      await updateDocById(COLLECTIONS.FRIEND_REQUESTS, requestId, { status: 'accepted' });

      // Create bidirectional friendship docs
      await setDocById(COLLECTIONS.FRIENDSHIPS, `${req.fromUserId}_${req.toUserId}`, {
        userId: req.fromUserId,
        friendId: req.toUserId,
        createdAt: serverTimestamp(),
      });
      await setDocById(COLLECTIONS.FRIENDSHIPS, `${req.toUserId}_${req.fromUserId}`, {
        userId: req.toUserId,
        friendId: req.fromUserId,
        createdAt: serverTimestamp(),
      });

      // Create direct chat (dynamic import to avoid circular dependency)
      const { useChatStore } = await import('./useChatStore');
      await useChatStore.getState().createDirectChat(req.fromUserId as string, req.toUserId as string);

      // Note: Notifications are auto-created by database trigger

      // Fetch accepted user profile and add to friends list
      const acceptedUser = await getDocById(COLLECTIONS.USERS, req.fromUserId as string);
      const newFriend = acceptedUser ? mapUser(acceptedUser) : null;

      set((s) => ({
        requests: s.requests.filter((r) => r.id !== requestId),
        friends: newFriend ? [...s.friends, newFriend] : [...s.friends],
      }));
    } catch (err: unknown) {
      console.error('[FriendStore] Error:', err);
      throw err;
    }
  },

  rejectRequest: async (requestId: string) => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.rejectRequest] Firestore unavailable');
      return;
    }
    try {
      const req = await getDocById(COLLECTIONS.FRIEND_REQUESTS, requestId);
      if (!req) return;

      await deleteDocById(COLLECTIONS.FRIEND_REQUESTS, requestId);

      // Note: Notifications are auto-created by database trigger

      set((s) => ({
        requests: s.requests.filter((r) => r.id !== requestId),
      }));
    } catch (err: unknown) {
      console.error('[FriendStore] Error:', err);
      throw err;
    }
  },

  cancelRequest: async (requestId: string) => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.cancelRequest] Firestore unavailable');
      return;
    }
    try {
      const req = await getDocById(COLLECTIONS.FRIEND_REQUESTS, requestId);
      if (!req) return;

      await deleteDocById(COLLECTIONS.FRIEND_REQUESTS, requestId);

      set((s) => ({
        sentRequests: s.sentRequests.filter((r) => r.id !== requestId),
      }));
    } catch (err: unknown) {
      console.error('[FriendStore] Error:', err);
      throw err;
    }
  },

  toggleFavorite: async (userId: string, currentUserId: string, currentFavorites: string[]) => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.toggleFavorite] Firestore unavailable');
      return;
    }
    try {
      if (!currentUserId) return;
      const isFav = currentFavorites.includes(userId);
      const favorites = isFav ? currentFavorites.filter((f) => f !== userId) : [...currentFavorites, userId];
      await updateDocById(COLLECTIONS.USERS, currentUserId, { favorites });
    } catch (err: unknown) {
      console.error('[FriendStore] Error:', err);
      throw err;
    }
  },

  removeFriend: async (userId: string, currentUserId: string) => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.removeFriend] Firestore unavailable');
      return;
    }
    try {
      if (!currentUserId) return;
      await deleteDocById(COLLECTIONS.FRIENDSHIPS, `${currentUserId}_${userId}`);
      await deleteDocById(COLLECTIONS.FRIENDSHIPS, `${userId}_${currentUserId}`);

      // Note: Notifications are auto-created by database trigger

      set((s) => ({
        friends: s.friends.filter((f) => f.id !== userId),
      }));
    } catch (err: unknown) {
      console.error('[FriendStore] Error:', err);
      throw err;
    }
  },

  blockUser: async (blockedId: string, blockerId: string, reason?: string) => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.blockUser] Firestore unavailable');
      return;
    }
    try {
      if (!blockerId || !blockedId) return;
      if (blockerId === blockedId) throw new Error('Cannot block yourself');

      // Remove any existing friendship
      await deleteDocById(COLLECTIONS.FRIENDSHIPS, `${blockerId}_${blockedId}`);
      await deleteDocById(COLLECTIONS.FRIENDSHIPS, `${blockedId}_${blockerId}`);

      // Remove any pending requests using filtered queries instead of scanning the whole collection
      const [outgoingReqs, incomingReqs] = await Promise.all([
        queryCollection(COLLECTIONS.FRIEND_REQUESTS, [
          where('fromUserId', '==', blockerId),
          where('toUserId', '==', blockedId),
        ]),
        queryCollection(COLLECTIONS.FRIEND_REQUESTS, [
          where('fromUserId', '==', blockedId),
          where('toUserId', '==', blockerId),
        ]),
      ]);
      await Promise.all(
        [...(outgoingReqs || []), ...(incomingReqs || [])].map((req) =>
          deleteDocById(COLLECTIONS.FRIEND_REQUESTS, req.id)
        )
      );

      // Insert block record
      await addDocToCollection(COLLECTIONS.BLOCKED_USERS, {
        blockerId,
        blockedId,
        reason: reason || '',
        createdAt: serverTimestamp(),
      });

      // Update user's blockedUsers array
      const blocker = await getDocById(COLLECTIONS.USERS, blockerId);
      const blockedList = (blocker?.blockedUsers as string[]) || [];
      if (!blockedList.includes(blockedId)) {
        await updateDocById(COLLECTIONS.USERS, blockerId, { blockedUsers: [...blockedList, blockedId] });
      }

      set((s) => ({
        friends: s.friends.filter((f) => f.id !== blockedId),
        requests: s.requests.filter((r) => r.from !== blockedId),
        sentRequests: s.sentRequests.filter((r) => r.toUserId !== blockedId),
      }));
    } catch (err: unknown) {
      console.error('Block user error:', err);
      throw err;
    }
  },

  unblockUser: async (blockedId: string, blockerId: string) => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.unblockUser] Firestore unavailable');
      return;
    }
    try {
      if (!blockerId || !blockedId) return;
      const blocked = await queryCollection(COLLECTIONS.BLOCKED_USERS, [
        where('blockerId', '==', blockerId),
        where('blockedId', '==', blockedId),
      ]);
      for (const b of blocked || []) {
        await deleteDocById(COLLECTIONS.BLOCKED_USERS, b.id);
      }

      // Update user's blockedUsers array
      const blocker = await getDocById(COLLECTIONS.USERS, blockerId);
      const blockedList = ((blocker?.blockedUsers as string[]) || []).filter((id) => id !== blockedId);
      await updateDocById(COLLECTIONS.USERS, blockerId, { blockedUsers: blockedList });
    } catch (err: unknown) {
      console.error('[FriendStore] Error:', err);
      throw err;
    }
  },

  reportUser: async ({ reporterId, reportedId, reason, details }) => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.reportUser] Firestore unavailable');
      return;
    }
    try {
      if (!reporterId || !reportedId) throw new Error('Invalid report');
      if (reporterId === reportedId) throw new Error('Cannot report yourself');

      await addDocToCollection(COLLECTIONS.USER_REPORTS, {
        reporterId,
        reportedId,
        reason: reason || 'spam',
        details: details || '',
        status: 'pending',
        createdAt: serverTimestamp(),
      });
    } catch (err: unknown) {
      console.error('Report user error:', err);
      throw err;
    }
  },

  getUserById: async (userId: string) => {
    if (!userId) return null;
    // Try Firestore first, fall back to Supabase
    if (isFirestoreAvailable()) {
      try {
        const data = await getDocById(COLLECTIONS.USERS, userId);
        if (data) return mapUser(data);
      } catch { /* fall through to Supabase */ }
    }
    // Supabase fallback
    try {
      const { fetchUserProfile } = await import('@/lib/supabaseAuth');
      const user = await fetchUserProfile(userId);
      return user;
    } catch {
      return null;
    }
  },

  getFriendStatus: async (currentUserId: string, otherUserId: string): Promise<FriendStatus> => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.getFriendStatus] Firestore unavailable');
      return 'not_friends';
    }
    if (!currentUserId || !otherUserId) return 'not_friends';
    if (currentUserId === otherUserId) return 'self';

    try {
      // Check if blocked
      const blocked = await queryCollection(COLLECTIONS.BLOCKED_USERS, [
        where('blockerId', '==', currentUserId),
        where('blockedId', '==', otherUserId),
      ]);
      if (blocked.length > 0) return 'blocked';

      // Check if friends
      const friendship = await queryCollection(COLLECTIONS.FRIENDSHIPS, [
        where('userId', '==', currentUserId),
        where('friendId', '==', otherUserId),
      ]);
      if (friendship.length > 0) return 'friends';

      // Check if request sent
      const sentReq = await queryCollection(COLLECTIONS.FRIEND_REQUESTS, [
        where('fromUserId', '==', currentUserId),
        where('toUserId', '==', otherUserId),
        where('status', '==', 'pending'),
      ]);
      if (sentReq.length > 0) return 'request_sent';

      // Check if request received
      const receivedReq = await queryCollection(COLLECTIONS.FRIEND_REQUESTS, [
        where('fromUserId', '==', otherUserId),
        where('toUserId', '==', currentUserId),
        where('status', '==', 'pending'),
      ]);
      if (receivedReq.length > 0) return 'request_received';

      return 'not_friends';
    } catch {
      return 'not_friends';
    }
  },

  getMutualFriendsCount: async (user1: string, user2: string) => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.getMutualFriendsCount] Firestore unavailable');
      return 0;
    }
    if (!user1 || !user2) return 0;
    try {
      const [f1, f2] = await Promise.all([
        queryCollection(COLLECTIONS.FRIENDSHIPS, [where('userId', '==', user1)]),
        queryCollection(COLLECTIONS.FRIENDSHIPS, [where('userId', '==', user2)]),
      ]);
      const ids2 = new Set((f2 || []).map((f: Record<string, unknown>) => f.friendId as string));
      return (f1 || []).filter((f: Record<string, unknown>) => ids2.has(f.friendId as string)).length;
    } catch {
      return 0;
    }
  },

  getSuggestedFriends: async (userId: string) => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.getSuggestedFriends] Firestore unavailable');
      return [];
    }
    if (!userId) return [];
    try {
      // Get friends and blocked IDs to exclude
      const friends = await queryCollection(COLLECTIONS.FRIENDSHIPS, [where('userId', '==', userId)]);
      const friendIds = (friends || []).map((f: Record<string, unknown>) => f.friendId as string);
      const blocked = await queryCollection(COLLECTIONS.BLOCKED_USERS, [where('blockerId', '==', userId)]);
      const blockedIds = (blocked || []).map((b: Record<string, unknown>) => b.blockedId as string);
      const exclude = [...friendIds, ...blockedIds, userId];

      // Get random users excluding the above (limit to 100 for performance)
      const allUsers = await queryCollection(COLLECTIONS.USERS, [limit(100)]);
      const candidates = (allUsers || [])
        .filter((u: Record<string, unknown>) => !exclude.includes(u.id as string))
        .slice(0, 10);

      return candidates.map((u: Record<string, unknown>) => ({
        ...mapUser(u),
        mutualCount: 0,
        score: 0,
      })) as SuggestedUser[];
    } catch {
      return [];
    }
  },

  getSentRequests: async (userId: string) => {
    if (!isFirestoreAvailable() || !userId) return;
    set({ loadingSentRequests: true });
    try {
      const data = await queryCollection(COLLECTIONS.FRIEND_REQUESTS, [
        where('fromUserId', '==', userId),
        where('status', '==', 'pending'),
        orderBy('timestamp', 'desc'),
      ]);
      const raw = data || [];
      const recipientIds = [...new Set(raw.map((d: Record<string, unknown>) => d.toUserId as string).filter(Boolean))];
      const profiles = await batchFetchUsers(recipientIds);
      const profileMap = Object.fromEntries(profiles.map((u) => [u.id, u]));
      const sentRequests: SentRequest[] = raw.map((d: Record<string, unknown>) => ({
        id: d.id as string,
        toUserId: d.toUserId as string,
        status: d.status as SentRequest['status'],
        toUser: profileMap[d.toUserId as string] || undefined,
        timestamp: (d.createdAt && typeof d.createdAt === 'object' && 'toDate' in d.createdAt)
          ? (d.createdAt as { toDate: () => Date }).toDate()
          : new Date((d.createdAt ?? d.timestamp) as string),
      }));
      set({ sentRequests, loadingSentRequests: false });
    } catch { set({ loadingSentRequests: false }); }
  },

  getBlockedUsers: async (userId: string) => {
    if (!isFirestoreAvailable() || !userId) return;
    set({ loadingBlocked: true });
    try {
      const data = await queryCollection(COLLECTIONS.BLOCKED_USERS, [where('blockerId', '==', userId)]);
      const raw = data || [];
      const blockedIds = [...new Set(raw.map((d: Record<string, unknown>) => d.blockedId as string).filter(Boolean))];
      const profiles = await batchFetchUsers(blockedIds);
      const profileMap = Object.fromEntries(profiles.map((u) => [u.id, u]));
      const blockedUsers: BlockedUserRecord[] = raw.map((d: Record<string, unknown>) => ({
        id: d.id as string,
        blockerId: d.blockerId as string,
        blockedId: d.blockedId as string,
        reason: (d.reason as string) || '',
        blockedUser: profileMap[d.blockedId as string] || undefined,
        createdAt: (d.createdAt && typeof d.createdAt === 'object' && 'toDate' in d.createdAt)
          ? (d.createdAt as { toDate: () => Date }).toDate()
          : new Date(d.createdAt as string),
      }));
      set({ blockedUsers, loadingBlocked: false });
    } catch { set({ loadingBlocked: false }); }
  },

  getRecentContacts: async (userId: string) => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.getRecentContacts] Firestore unavailable');
      return [];
    }
    if (!userId) return [];
    try {
      const chats = await queryCollection(COLLECTIONS.CHATS, [
        where('participants', 'array-contains', userId),
        where('type', '==', 'direct'),
        orderBy('updatedAt', 'desc'),
        limit(20),
      ]);

      const otherIds = (chats || []).map((c: Record<string, unknown>) => {
        const participants = (c.participants as string[]) || [];
        return participants.find((p) => p !== userId);
      }).filter(Boolean) as string[];

      if (otherIds.length === 0) return [];
      return batchFetchUsers(otherIds);
    } catch {
      return [];
    }
  },

  followUser: async (userId: string, currentUserId: string) => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.followUser] Firestore unavailable');
      return;
    }
    if (!currentUserId || !userId || currentUserId === userId) return;
    try {
      // Add to current user's following
      await updateDocById(COLLECTIONS.USERS, currentUserId, {
        following: arrayUnion(userId),
      });
      // Add to target user's followers
      await updateDocById(COLLECTIONS.USERS, userId, {
        followers: arrayUnion(currentUserId),
      });
      toast.success('Following');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to follow');
    }
  },

  unfollowUser: async (userId: string, currentUserId: string) => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.unfollowUser] Firestore unavailable');
      return;
    }
    if (!currentUserId || !userId) return;
    try {
      await updateDocById(COLLECTIONS.USERS, currentUserId, {
        following: arrayRemove(userId),
      });
      await updateDocById(COLLECTIONS.USERS, userId, {
        followers: arrayRemove(currentUserId),
      });
      toast.success('Unfollowed');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to unfollow');
    }
  },

  toggleCloseFriend: async (userId: string, currentUserId: string, currentCloseFriends: string[]) => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.toggleCloseFriend] Firestore unavailable');
      return;
    }
    if (!currentUserId) return;
    try {
      const isClose = currentCloseFriends.includes(userId);
      const closeFriends = isClose
        ? currentCloseFriends.filter((f) => f !== userId)
        : [...currentCloseFriends, userId];
      await updateDocById(COLLECTIONS.USERS, currentUserId, { closeFriends });
      toast.success(isClose ? 'Removed from close friends' : 'Added to close friends');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update close friends');
    }
  },

  getFollowers: async (userId: string) => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.getFollowers] Firestore unavailable');
      return [];
    }
    if (!userId) return [];
    try {
      const data = await getDocById(COLLECTIONS.USERS, userId);
      if (!data) return [];
      const followerIds = (data.followers as string[]) || [];
      return batchFetchUsers(followerIds);
    } catch {
      return [];
    }
  },

  getFollowing: async (userId: string) => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.getFollowing] Firestore unavailable');
      return [];
    }
    if (!userId) return [];
    try {
      const data = await getDocById(COLLECTIONS.USERS, userId);
      if (!data) return [];
      const followingIds = (data.following as string[]) || [];
      return batchFetchUsers(followingIds);
    } catch {
      return [];
    }
  },

  createBroadcastList: async (userId: string, name: string, recipientIds: string[]) => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.createBroadcastList] Firestore unavailable');
      return null;
    }
    if (!userId) return null;
    try {
      const list = await addDocToCollection(COLLECTIONS.BROADCAST_LISTS, {
        userId,
        name,
        recipientIds,
        createdAt: serverTimestamp(),
      });
      toast.success('Broadcast list created');
      return list || null;
    } catch {
      toast.error('Failed to create broadcast list');
      return null;
    }
  },

  getBroadcastLists: async (userId: string) => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.getBroadcastLists] Firestore unavailable');
      return [];
    }
    if (!userId) return [];
    try {
      const data = await queryCollection(COLLECTIONS.BROADCAST_LISTS, [where('userId', '==', userId)]);
      return (data || []).map((d: Record<string, unknown>) => ({
        id: d.id as string,
        userId: d.userId as string,
        name: (d.name as string) || 'Broadcast List',
        recipientIds: (d.recipientIds as string[]) || [],
        createdAt: (d.createdAt && typeof d.createdAt === 'object' && 'toDate' in d.createdAt)
          ? (d.createdAt as { toDate: () => Date }).toDate()
          : new Date(d.createdAt as string),
      }));
    } catch {
      return [];
    }
  },

  deleteBroadcastList: async (listId: string) => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.deleteBroadcastList] Firestore unavailable');
      return;
    }
    try {
      await deleteDocById(COLLECTIONS.BROADCAST_LISTS, listId);
      toast.success('Broadcast list deleted');
    } catch {
      toast.error('Failed to delete broadcast list');
    }
  },

  sendBroadcast: async (userId: string, recipientIds: string[], content: string, type: string = 'text', mediaUrl?: string) => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.sendBroadcast] Firestore unavailable');
      return { sent: 0, failed: 0 };
    }
    if (!userId || !recipientIds.length || !content.trim()) {
      toast.error('Missing broadcast details');
      return { sent: 0, failed: 0 };
    }
    try {
      // Dynamic import to avoid circular dependency
      const { useChatStore } = await import('@/store/useChatStore');
      const chatStore = useChatStore.getState();
      let sent = 0;
      let failed = 0;
      const sendPromises = recipientIds.map(async (recipientId) => {
        try {
          const chat = await chatStore.createDirectChat(recipientId, userId);
          if (!chat) { failed++; return; }
          const participants = [userId, recipientId].sort();
          const chatId = `dm_${participants.join('_')}`;
          await chatStore.sendMessage(chatId, userId, content, type, mediaUrl);
          sent++;
        } catch {
          failed++;
        }
      });
      await Promise.all(sendPromises);
      if (sent > 0) toast.success(`Broadcast sent to ${sent} contact${sent > 1 ? 's' : ''}`);
      if (failed > 0) toast.error(`Failed to send to ${failed} contact${failed > 1 ? 's' : ''}`);
      return { sent, failed };
    } catch {
      toast.error('Failed to send broadcast');
      return { sent: 0, failed: 0 };
    }
  },

  setGroupAddPrivacy: async (userId: string, setting: 'everyone' | 'friends_of_friends' | 'nobody') => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.setGroupAddPrivacy] Firestore unavailable');
      return;
    }
    if (!userId) return;
    try {
      await updateDocById(COLLECTIONS.USERS, userId, { groupAddPrivacy: setting });
      toast.success('Group add privacy updated');
    } catch {
      toast.error('Failed to update privacy');
    }
  },

  getGroupAddPrivacy: async (userId: string) => {
    if (!isFirestoreAvailable()) {
      console.warn('[FriendStore.getGroupAddPrivacy] Firestore unavailable');
      return 'everyone' as const;
    }
    if (!userId) return 'everyone' as const;
    try {
      const data = await getDocById(COLLECTIONS.USERS, userId);
      return (data?.groupAddPrivacy as 'everyone' | 'friends_of_friends' | 'nobody') || 'everyone';
    } catch {
      return 'everyone' as const;
    }
  },
}));