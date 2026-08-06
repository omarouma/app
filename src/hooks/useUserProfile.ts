import { useState, useEffect, useCallback } from 'react';
import {
  subscribeToDoc,
  subscribeToCollection,
  COLLECTIONS,
} from '@/lib/firestore';
import { useFriendStore } from '@/store/useFriendStore';
import { useAuthStore } from '@/store/useAuthStore';
import type { User, FriendStatus } from '@/types';
import { where } from '@/lib/firestore';

export interface UseUserProfileResult {
  profileUser: User | null;
  loading: boolean;
  friendStatus: FriendStatus;
  mutualCount: number;
  refreshFriendStatus: () => Promise<void>;
}

export function useUserProfile(targetUserId: string | undefined): UseUserProfileResult {
  const { user: currentUser } = useAuthStore();
  const { getUserById, getFriendStatus, getMutualFriendsCount } = useFriendStore();

  const isOwnProfile = !targetUserId || targetUserId === currentUser?.id;
  const resolvedId = isOwnProfile ? currentUser?.id : targetUserId;

  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('not_friends');
  const [mutualCount, setMutualCount] = useState(0);

  // ── Real-time subscription to the user doc ──────────────────────────
  useEffect(() => {
    if (!resolvedId) {
      setLoading(false);
      setProfileUser(null);
      return;
    }
    setLoading(true);
    const unsub = subscribeToDoc(COLLECTIONS.USERS, resolvedId, (data) => {
      if (data) {
        setProfileUser(data as User);
      } else {
        getUserById(resolvedId).then(setProfileUser);
      }
      setLoading(false);
    });
    return unsub;
  }, [resolvedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stable refreshFriendStatus ───────────────────────────────────────
  const refreshFriendStatus = useCallback(async () => {
    if (!currentUser?.id || !targetUserId || isOwnProfile) return;
    const [status, mutual] = await Promise.all([
      getFriendStatus(currentUser.id, targetUserId),
      getMutualFriendsCount(currentUser.id, targetUserId),
    ]);
    setFriendStatus(status);
    setMutualCount(mutual);
  }, [currentUser?.id, targetUserId, isOwnProfile, getFriendStatus, getMutualFriendsCount]);

  // ── Initial friend status fetch ──────────────────────────────────────
  useEffect(() => {
    if (isOwnProfile || !currentUser?.id || !targetUserId) return;
    setFriendStatus('not_friends');
    setMutualCount(0);
    refreshFriendStatus();
  }, [targetUserId, currentUser?.id, isOwnProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Real-time friend-status: watch friendship + friend_requests rows ─
  useEffect(() => {
    if (isOwnProfile || !currentUser?.id || !targetUserId) return;

    const unsubFriendship = subscribeToCollection(
      COLLECTIONS.FRIENDSHIPS,
      [where('userId', '==', currentUser.id), where('friendId', '==', targetUserId)],
      (rows) => {
        setFriendStatus(rows.length > 0 ? 'friends' : 'not_friends');
      },
    );

    const unsubRequests = subscribeToCollection(
      COLLECTIONS.FRIEND_REQUESTS,
      [where('status', '==', 'pending')],
      (rows) => {
        const sent = rows.find(
          (r: any) => r.fromUserId === currentUser.id && r.toUserId === targetUserId,
        );
        const received = rows.find(
          (r: any) => r.fromUserId === targetUserId && r.toUserId === currentUser.id,
        );
        if (sent) setFriendStatus('request_sent');
        else if (received) setFriendStatus('request_received');
        // If neither, leave as-is — friendship subscription handles 'friends'/'not_friends'
      },
    );

    return () => {
      unsubFriendship();
      unsubRequests();
    };
  }, [currentUser?.id, targetUserId, isOwnProfile]);

  return { profileUser, loading, friendStatus, mutualCount, refreshFriendStatus };
}
