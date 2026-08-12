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
  const [loading, setLoading] = useState(() => !!resolvedId);
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('not_friends');
  const [mutualCount, setMutualCount] = useState(0);

  // Reset loading/profile when the target user changes (render-time adjustment
  // instead of setState inside the effect body)
  const [prevResolvedId, setPrevResolvedId] = useState(resolvedId);
  if (resolvedId !== prevResolvedId) {
    setPrevResolvedId(resolvedId);
    setLoading(!!resolvedId);
    setProfileUser(null);
  }

  // ── Real-time subscription to the user doc ──────────────────────────
  useEffect(() => {
    if (!resolvedId) return;
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
  const currentUserId = currentUser?.id ?? null;
  const refreshFriendStatus = useCallback(async () => {
    if (!currentUserId || !targetUserId || isOwnProfile) return;
    const [status, mutual] = await Promise.all([
      getFriendStatus(currentUserId, targetUserId),
      getMutualFriendsCount(currentUserId, targetUserId),
    ]);
    setFriendStatus(status);
    setMutualCount(mutual);
  }, [currentUserId, targetUserId, isOwnProfile, getFriendStatus, getMutualFriendsCount]);

  // ── Initial friend status fetch ──────────────────────────────────────
  // Reset friend state when the target user changes (render-time adjustment)
  const [prevTargetKey, setPrevTargetKey] = useState(`${currentUserId}:${targetUserId}`);
  const targetKey = `${currentUserId}:${targetUserId}`;
  if (targetKey !== prevTargetKey) {
    setPrevTargetKey(targetKey);
    setFriendStatus('not_friends');
    setMutualCount(0);
  }

  useEffect(() => {
    if (isOwnProfile || !currentUserId || !targetUserId) return;
    let cancelled = false;
    void (async () => {
      const [status, mutual] = await Promise.all([
        getFriendStatus(currentUserId, targetUserId),
        getMutualFriendsCount(currentUserId, targetUserId),
      ]);
      if (cancelled) return;
      setFriendStatus(status);
      setMutualCount(mutual);
    })();
    return () => { cancelled = true; };
  }, [targetUserId, currentUserId, isOwnProfile, getFriendStatus, getMutualFriendsCount]);

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
