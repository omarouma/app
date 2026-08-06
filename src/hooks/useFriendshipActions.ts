
import { useState, useCallback } from 'react';
import { useFriendStore } from '@/store/useFriendStore';
import { useAuthStore } from '@/store/useAuthStore';
import { toast } from 'sonner';

export const useFriendshipActions = (userId: string) => {
  const { user: currentUser } = useAuthStore();
  const {
    sendRequest,
    cancelRequest,
    acceptRequest,
    rejectRequest,
    removeFriend,
    blockUser,
    unblockUser,
    reportUser,
    sentRequests,
    requests,
  } = useFriendStore();

  const [processingAction, setProcessingAction] = useState(false);

  const handleAddFriend = useCallback(async () => {
    if (!currentUser?.id || !userId) return;
    setProcessingAction(true);
    try {
      await sendRequest(currentUser.id, userId);
      toast.success('Friend request sent!');
      return 'request_sent';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send request');
    } finally {
      setProcessingAction(false);
    }
  }, [currentUser?.id, userId, sendRequest]);

  const handleCancelRequest = useCallback(async () => {
    if (!currentUser?.id || !userId) return;
    setProcessingAction(true);
    try {
      const requestToCancel = sentRequests.find((r: any) => (r.toUserId || r.to_user_id) === userId);
      if (requestToCancel) {
        await cancelRequest(requestToCancel.id);
        toast.success('Friend request cancelled.');
        return 'not_friends';
      }
    } catch {
      toast.error('Failed to cancel request.');
    } finally {
      setProcessingAction(false);
    }
  }, [currentUser?.id, userId, sentRequests, cancelRequest]);

  const handleAcceptRequest = useCallback(async () => {
    if (!currentUser?.id || !userId) return;
    setProcessingAction(true);
    try {
      const requestToAccept = requests.find((r: any) => (r.fromUserId || r.from_user_id) === userId);
      if (requestToAccept) {
        await acceptRequest(requestToAccept.id);
        toast.success('Friend request accepted!');
        return 'friends';
      }
    } catch {
      toast.error('Failed to accept request.');
    } finally {
      setProcessingAction(false);
    }
  }, [currentUser?.id, userId, requests, acceptRequest]);

  const handleRejectRequest = useCallback(async () => {
    if (!currentUser?.id || !userId) return;
    setProcessingAction(true);
    try {
      const requestToReject = requests.find((r: any) => (r.fromUserId || r.from_user_id) === userId);
      if (requestToReject) {
        await rejectRequest(requestToReject.id);
        toast.info('Friend request rejected.');
        return 'not_friends';
      }
    } catch {
      toast.error('Failed to reject request.');
    } finally {
      setProcessingAction(false);
    }
  }, [currentUser?.id, userId, requests, rejectRequest]);

  const handleRemoveFriend = useCallback(async () => {
    if (!currentUser?.id || !userId) return;
    if (window.confirm('Are you sure you want to remove this friend?')) {
      setProcessingAction(true);
      try {
        await removeFriend(currentUser.id, userId);
        toast.success('Friend removed.');
        return 'not_friends';
      } catch {
        toast.error('Failed to remove friend.');
      } finally {
        setProcessingAction(false);
      }
    }
  }, [currentUser?.id, userId, removeFriend]);

  const handleBlockUser = useCallback(async () => {
    if (!currentUser?.id || !userId) return;
    if (window.confirm('Are you sure you want to block this user?')) {
      setProcessingAction(true);
      try {
        await blockUser(currentUser.id, userId);
        toast.success('User blocked.');
        return 'blocked';
      } catch {
        toast.error('Failed to block user.');
      } finally {
        setProcessingAction(false);
      }
    }
  }, [currentUser?.id, userId, blockUser]);

  const handleUnblockUser = useCallback(async () => {
    if (!currentUser?.id || !userId) return;
    setProcessingAction(true);
    try {
      await unblockUser(currentUser.id, userId);
      toast.success('User unblocked.');
      // The status will be updated in the main component
      return null;
    } catch {
      toast.error('Failed to unblock user.');
    } finally {
      setProcessingAction(false);
    }
  }, [currentUser?.id, userId, unblockUser]);

  const handleReport = useCallback(async (
    reportedId: string,
    reason: string,
    details?: string
  ) => {
    if (!currentUser?.id) return;
    try {
      await reportUser({
        reporterId: currentUser.id,
        reportedId,
        reason,
        details,
      });
      toast.success('User reported. Thank you for your feedback.');
    } catch {
      toast.error('Failed to submit report.');
    }
  }, [currentUser?.id, reportUser]);

  return {
    processingAction,
    handleAddFriend,
    handleCancelRequest,
    handleAcceptRequest,
    handleRejectRequest,
    handleRemoveFriend,
    handleBlockUser,
    handleUnblockUser,
    handleReport,
  };
};