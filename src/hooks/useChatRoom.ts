import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useTyping } from '@/hooks/useTyping';
import { useOfflineQueue, isOnline } from '@/hooks/useOfflineQueue';
import { useMessagePin } from '@/hooks/useMessagePin';
import { useSavedMessages } from '@/hooks/useSavedMessages';
import { useScheduledMessages } from '@/hooks/useScheduledMessages';
import { useChatEffects } from '@/hooks/useChatEffects';
import { uploadMediaBlob } from '@/lib/storage';
import { toast } from 'sonner';
import type { Message, User } from '@/types';

interface FriendRequest { id: string; toUserId?: string; to_user_id?: string; fromUserId?: string; from_user_id?: string; }

export const useChatRoom = (chatId: string, userId: string) => {
  const { user: currentUser } = useAuthStore();
  const {
    messages, sendMessage, deleteMessage,
    deleteForEveryone, addReaction, pinMessage, unpinMessage, sendPoll,
    votePoll, editMessage, sendContactCard, unlockChat, chats,
    loadOlderMessages, hasMore, recallMessage,
  } = useChatStore();
  const { pinnedMessages } = useMessagePin(chatId);
  const { saveMessage, unsaveMessage, isSaved } = useSavedMessages(currentUser?.id);
  const {
    friends, getFriendStatus, getUserById, sendRequest, cancelRequest,
    acceptRequest, rejectRequest, blockUser, unblockUser, reportUser,
    removeFriend, sentRequests, requests,
  } = useFriendStore();
  const { typingUsers, sendTyping, stopTyping } = useTyping(chatId);
  const { queueMessage } = useOfflineQueue();
  const { schedule, getPending } = useScheduledMessages(chatId, sendMessage);

  // Stable ref so the mount-only effect doesn't re-run when getPending identity changes
  const getPendingRef = useRef(getPending);
  useEffect(() => { getPendingRef.current = getPending; });

  // ── Input state ──────────────────────────────────────────────────────────
  const [input, setInput] = useState('');
  const inputRef = useRef('');
  const [editInput, setEditInput] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // Keep ref in sync for draft persistence without DOM coupling
  useEffect(() => { inputRef.current = input; }, [input]);

  // ── UI toggles ───────────────────────────────────────────────────────────
  const [showAttachments, setShowAttachments] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [showDeleteForEveryoneConfirm, setShowDeleteForEveryoneConfirm] = useState<string | null>(null);
  const [showRemoveFriendConfirm, setShowRemoveFriendConfirm] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);

  // ── Search ───────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);

  // ── Context menu / reactions ─────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{ msg: Message; position: { x: number; y: number } } | null>(null);
  const [selectedReactionMsg, setSelectedReactionMsg] = useState<string | null>(null);

  // ── Forward ──────────────────────────────────────────────────────────────
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [forwardBatch, setForwardBatch] = useState<Message[]>([]);

  // ── Schedule ─────────────────────────────────────────────────────────────
  const [scheduleDate, setScheduleDate] = useState('');

  // ── Poll ─────────────────────────────────────────────────────────────────
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);

  // ── Chat lock ────────────────────────────────────────────────────────────
  const [isChatLocked, setIsChatLocked] = useState(false);
  const [lockPinInput, setLockPinInput] = useState('');
  const [lockError, setLockError] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  // ── Friend / report ──────────────────────────────────────────────────────
  const [friendStatus, setFriendStatus] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [processingAction, setProcessingAction] = useState(false);

  // ── Misc ─────────────────────────────────────────────────────────────────
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());
  const [chatBg, setChatBg] = useState('');
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pendingSchedules, setPendingSchedules] = useState<ReturnType<typeof getPending>>([]);
  const [resolvedDisplayUser, setResolvedDisplayUser] = useState<User | null>(null);

  // ── Derived ──────────────────────────────────────────────────────────────
  const displayUser: User | null = useMemo(
    () => (userId ? friends.find(f => f.id === userId) || resolvedDisplayUser : null),
    [userId, friends, resolvedDisplayUser],
  );
  const chat = useMemo(() => chats.find(c => c.id === chatId), [chatId, chats]);

  // ── Effects ──────────────────────────────────────────────────────────────

  // Delegate the canonical subscription + markAsRead + lastSeen realtime +
  // friend status + draft persistence + chat lock + chat background effects
  // to useChatEffects (single source of truth). This wires up the realtime
  // "last seen" presence in the header that was previously never populated.
  useChatEffects(
    chatId,
    userId,
    inputRef,
    setInput,
    setFriendStatus,
    setLastSeen,
    setIsChatLocked,
    setChatBg,
  );

  // Resolve display user for non-friends
  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    getUserById(userId).then(u => { if (mounted) setResolvedDisplayUser(u); }).catch(() => {});
    return () => { mounted = false; };
  }, [userId, getUserById]);

  // Pending schedules — mount only; chatId change re-mounts
  useEffect(() => { setPendingSchedules(getPendingRef.current()); }, [chatId]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleEditSave = useCallback(async (msgId: string) => {
    const content = editInput.trim();
    if (!content) return;
    try {
      await editMessage(chatId, msgId, content);
      setEditingMessageId(null);
      setEditInput('');
    } catch { toast.error('Failed to edit message.'); }
  }, [chatId, editInput, editMessage]);

  const handleSend = useCallback(async () => {
    if (!currentUser) return;
    if (editingMessageId) { await handleEditSave(editingMessageId); return; }
    const content = input.trim();
    if (!content) return;
    const localId = `offline_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    try {
      if (isOnline()) {
        await sendMessage(chatId, currentUser.id, content, 'text', undefined, replyingTo?.id);
      } else {
        queueMessage({ chatId, senderId: currentUser.id, content, type: 'direct', replyTo: replyingTo?.id });
        useChatStore.getState().addMessage({
          id: localId, localId, chatId, senderId: currentUser.id, content,
          type: 'text', timestamp: new Date(), read: false, reactions: {},
          replyTo: replyingTo?.id, deliveryStatus: 'failed',
        } as Message);
      }
      setInput('');
      setReplyingTo(null);
      stopTyping();
    } catch { toast.error('Failed to send message.'); }
  }, [chatId, currentUser, input, editingMessageId, replyingTo, sendMessage, queueMessage, stopTyping, handleEditSave]);

  const handleMediaUpload = useCallback(async (files: File[]) => {
    if (!currentUser) return;
    setShowAttachments(false);
    for (const file of files) {
      try {
        const url = await uploadMediaBlob(file, { userId: currentUser.id, kind: 'chats', fileName: file.name, contentType: file.type });
        const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file';
        await sendMessage(chatId, currentUser.id, file.name, type, url);
      } catch { toast.error(`Failed to upload ${file.name}.`); }
    }
  }, [chatId, currentUser, sendMessage]);

  const handleDelete = useCallback(async (msgId: string) => {
    try { await deleteMessage(chatId, msgId); setContextMenu(null); }
    catch { toast.error('Failed to delete message.'); }
  }, [chatId, deleteMessage]);

  const handleDeleteForEveryone = useCallback(async (msgId: string) => {
    if (!currentUser) return;
    try {
      await deleteForEveryone(chatId, msgId);
      setContextMenu(null);
      setShowDeleteForEveryoneConfirm(null);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to delete for everyone.'); }
  }, [chatId, currentUser, deleteForEveryone]);

  const handleForward = useCallback(async (targetChatId: string) => {
    if (!currentUser || (!forwardMsg && forwardBatch.length === 0)) return;
    const msgs = forwardMsg ? [forwardMsg] : forwardBatch;
    for (const msg of msgs) {
      try { await sendMessage(targetChatId, currentUser.id, msg.content, msg.type, msg.mediaUrl); }
      catch { toast.error(`Failed to forward message.`); }
    }
    setShowForwardModal(false);
    setForwardMsg(null);
    setForwardBatch([]);
    toast.success('Message(s) forwarded.');
  }, [currentUser, forwardMsg, forwardBatch, sendMessage]);

  const handleSaveMessage = useCallback(async (msg: Message) => {
    if (!currentUser?.id) return;
    setContextMenu(null);
    try {
      if (isSaved(msg.id)) { await unsaveMessage(msg.id); toast.success('Message unsaved.'); }
      else { await saveMessage(msg, displayUser?.name || 'User'); toast.success('Message saved.'); }
    } catch { toast.error('Failed to save message.'); }
  }, [currentUser?.id, isSaved, saveMessage, unsaveMessage, displayUser?.name]);

  const handlePin = useCallback(async (msg: Message) => {
    setContextMenu(null);
    try {
      if (pinnedMessages.some(p => p.messageId === msg.id)) {
        await unpinMessage(chatId, msg.id); toast.success('Message unpinned.');
      } else {
        await pinMessage(chatId, msg.id, msg.content); toast.success('Message pinned.');
      }
    } catch { toast.error('Failed to pin message.'); }
  }, [chatId, pinnedMessages, pinMessage, unpinMessage]);

  const handleRecall = useCallback(async (msgId: string) => {
    if (!currentUser) return;
    setContextMenu(null);
    try { await recallMessage(chatId, msgId); toast.success('Message recalled.'); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to recall message.'); }
  }, [chatId, currentUser, recallMessage]);

  const handleReport = useCallback(async () => {
    if (!contextMenu?.msg || !reportReason || !currentUser) return;
    try {
      await reportUser({ reporterId: currentUser.id, reportedId: contextMenu.msg.senderId, reason: reportReason, details: reportDetails || undefined });
      setShowReportModal(false); setContextMenu(null); setReportReason(''); setReportDetails('');
      toast.success('User reported. Thank you for your feedback.');
    } catch { toast.error('Failed to submit report.'); }
  }, [contextMenu?.msg, reportReason, reportDetails, reportUser, currentUser]);

  const handleAddFriend = useCallback(async () => {
    if (!currentUser?.id || !userId) return;
    setProcessingAction(true);
    try { await sendRequest(currentUser.id, userId); setFriendStatus('request_sent'); toast.success('Friend request sent!'); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to send request'); }
    finally { setProcessingAction(false); }
  }, [currentUser?.id, userId, sendRequest]);

  const handleCancelRequest = useCallback(async () => {
    if (!currentUser?.id || !userId) return;
    setProcessingAction(true);
    try {
      const req = (sentRequests as FriendRequest[]).find(r => (r.toUserId || r.to_user_id) === userId);
      if (req) { await cancelRequest(req.id); setFriendStatus('not_friends'); toast.success('Friend request cancelled.'); }
    } catch { toast.error('Failed to cancel request.'); }
    finally { setProcessingAction(false); }
  }, [currentUser?.id, userId, sentRequests, cancelRequest]);

  const handleAcceptRequest = useCallback(async () => {
    if (!currentUser?.id || !userId) return;
    setProcessingAction(true);
    try {
      const req = (requests as FriendRequest[]).find(r => (r.fromUserId || r.from_user_id) === userId);
      if (req) { await acceptRequest(req.id); setFriendStatus('friends'); toast.success('Friend request accepted!'); }
    } catch { toast.error('Failed to accept request.'); }
    finally { setProcessingAction(false); }
  }, [currentUser?.id, userId, requests, acceptRequest]);

  const handleRejectRequest = useCallback(async () => {
    if (!currentUser?.id || !userId) return;
    setProcessingAction(true);
    try {
      const req = (requests as FriendRequest[]).find(r => (r.fromUserId || r.from_user_id) === userId);
      if (req) { await rejectRequest(req.id); setFriendStatus('not_friends'); toast.info('Friend request rejected.'); }
    } catch { toast.error('Failed to reject request.'); }
    finally { setProcessingAction(false); }
  }, [currentUser?.id, userId, requests, rejectRequest]);

  // Replaces window.confirm — caller shows showRemoveFriendConfirm dialog, then calls this
  const handleRemoveFriend = useCallback(async () => {
    if (!currentUser?.id || !userId) return;
    setProcessingAction(true);
    try { await removeFriend(currentUser.id, userId); setFriendStatus('not_friends'); toast.success('Friend removed.'); }
    catch { toast.error('Failed to remove friend.'); }
    finally { setProcessingAction(false); setShowRemoveFriendConfirm(false); }
  }, [currentUser?.id, userId, removeFriend]);

  // Replaces window.confirm — caller shows showBlockConfirm dialog, then calls this
  const handleBlockUser = useCallback(async () => {
    if (!currentUser?.id || !userId) return;
    setProcessingAction(true);
    try { await blockUser(currentUser.id, userId); setFriendStatus('blocked'); toast.success('User blocked.'); }
    catch { toast.error('Failed to block user.'); }
    finally { setProcessingAction(false); setShowBlockConfirm(false); }
  }, [currentUser?.id, userId, blockUser]);

  const handleUnblockUser = useCallback(async () => {
    if (!currentUser?.id || !userId) return;
    setProcessingAction(true);
    try {
      await unblockUser(currentUser.id, userId);
      const status = await getFriendStatus(currentUser.id, userId);
      setFriendStatus(status); toast.success('User unblocked.');
    } catch { toast.error('Failed to unblock user.'); }
    finally { setProcessingAction(false); }
  }, [currentUser?.id, userId, unblockUser, getFriendStatus]);

  const handleSendPoll = useCallback(async () => {
    if (!currentUser || !pollQuestion.trim() || pollOptions.some(o => !o.trim())) return;
    try {
      await sendPoll(chatId, currentUser.id, pollQuestion, pollOptions);
      setShowPollModal(false); setPollQuestion(''); setPollOptions(['', '']);
    } catch { toast.error('Failed to send poll.'); }
  }, [chatId, currentUser, pollQuestion, pollOptions, sendPoll]);

  const handleVote = useCallback(async (_chatId: string, msgId: string, optionIndex: number, voterId: string) => {
    if (!currentUser) return;
    try { await votePoll(_chatId, msgId, optionIndex, voterId); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to vote.'); }
  }, [currentUser, votePoll]);

  const handleScheduleSend = useCallback(() => {
    if (!input.trim() || !scheduleDate) return;
    const date = new Date(scheduleDate);
    if (date <= new Date()) { toast.error('Scheduled time must be in the future.'); return; }
    schedule({ senderId: currentUser?.id || '', content: input.trim(), type: 'text', scheduledAt: date.getTime() });
    setInput(''); setReplyingTo(null); setShowSchedulePicker(false); setScheduleDate('');
    setPendingSchedules(getPending()); toast.success('Message scheduled!');
  }, [input, scheduleDate, schedule, getPending, currentUser?.id]);

  const handleSendContact = useCallback(async (contact: { userId: string; name: string; phone?: string; email?: string; avatar?: string; username?: string; bio?: string }) => {
    if (!currentUser) return;
    try { await sendContactCard(chatId, currentUser.id, contact); toast.success('Contact card sent.'); }
    catch { toast.error('Failed to send contact card.'); }
  }, [chatId, currentUser, sendContactCard]);

  return {
    currentUser, messages, pinnedMessages, isSaved, friends, typingUsers,
    pendingSchedules, displayUser, chat, inputRef,
    input, setInput, editInput, setEditInput, editingMessageId, setEditingMessageId,
    replyingTo, setReplyingTo, showAttachments, setShowAttachments,
    showEmojiPicker, setShowEmojiPicker, showSearch, setShowSearch,
    searchQuery, setSearchQuery, searchIndex, setSearchIndex,
    contextMenu, setContextMenu, selectedReactionMsg, setSelectedReactionMsg,
    showForwardModal, setShowForwardModal, forwardMsg, setForwardMsg,
    forwardBatch, setForwardBatch, showSchedulePicker, setShowSchedulePicker,
    scheduleDate, setScheduleDate, showPollModal, setShowPollModal,
    pollQuestion, setPollQuestion, pollOptions, setPollOptions,
    isChatLocked, setIsChatLocked, lockPinInput, setLockPinInput,
    lockError, setLockError, unlocking, setUnlocking,
    friendStatus, setFriendStatus, showReportModal, setShowReportModal,
    reportReason, setReportReason, reportDetails, setReportDetails,
    processingAction, lastSeen, setLastSeen, lightboxImage, setLightboxImage,
    showDeleteForEveryoneConfirm, setShowDeleteForEveryoneConfirm,
    showRemoveFriendConfirm, setShowRemoveFriendConfirm,
    showBlockConfirm, setShowBlockConfirm,
    translations, setTranslations, translatingIds, setTranslatingIds,
    showBgPicker, setShowBgPicker, chatBg, setChatBg,
    loadingOlder, setLoadingOlder,
    handleEditSave, handleSend, handleMediaUpload, handleDelete,
    handleDeleteForEveryone, handleForward, handleSaveMessage, handlePin,
    handleRecall, handleReport, handleAddFriend, handleCancelRequest,
    handleAcceptRequest, handleRejectRequest, handleRemoveFriend,
    handleBlockUser, handleUnblockUser, handleSendPoll, handleVote,
    handleScheduleSend, handleSendContact,
    loadOlderMessages, hasMore, addReaction, sendTyping, stopTyping,
    saveMessage, unsaveMessage, pinMessage, unpinMessage, recallMessage,
    reportUser, sendRequest, cancelRequest, acceptRequest, rejectRequest,
    removeFriend, blockUser, unblockUser, sendPoll, votePoll,
    sendContactCard, unlockChat,
  };
};
