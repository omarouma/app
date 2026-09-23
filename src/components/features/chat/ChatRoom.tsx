import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, Loader, Lock, Ban, AlertCircle, Navigation,
} from 'lucide-react';

import { useFilteredOnline, useOnlineUsers } from '@/hooks/usePresence';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { useChatScrollBehavior } from '@/hooks/useChatScrollBehavior';
import { uploadMediaBlob } from '@/lib/storage';
import { SWIPE_THRESHOLD, formatDateSeparator } from '@/lib/chatConstants';
import { sanitizeMediaUrl } from '@/lib/utils';
import { setActiveChatId } from '@/lib/activeChat';

import type { Message } from '@/types';
import { useCallContext } from '@/context/CallContextBase';
import { ChatHeader } from './ChatHeader';
import { MessageItem } from './MessageItem';
import { MessageSearch } from './MessageSearch';
import { InputBar } from './InputBar';
import { MediaPreviewSheet } from './MediaPreviewSheet';
import { CameraCaptureSheet } from './CameraCaptureSheet';
import { ContactPickerSheet } from './ContactPickerSheet';
import type { ContactCard } from './ContactPickerSheet';
import { LiveLocationSheet } from './LiveLocationSheet';
import { useLiveLocation } from '@/hooks/useLiveLocation';
import { ImageLightbox } from './ImageLightbox';
import TransferModal from '@/components/TransferModal';
import { Virtuoso } from 'react-virtuoso';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/share';

import { useChatRoom } from '@/hooks/useChatRoom';
import { useChatStore } from '@/store/useChatStore';

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function hasDayBoundary(a: Message, b: Message): boolean {
  return !isSameDay(new Date(a.timestamp), new Date(b.timestamp));
}

export default function ChatRoom({ chatId, userId, onBack }: {
  chatId: string;
  userId: string;
  onBack?: () => void;
}): ReactElement {
  const navigate = useNavigate();

  // Mark this conversation as the active chat so global notification
  // hooks stay silent while the user is reading it (WeChat behavior).
  useEffect(() => {
    setActiveChatId(chatId);
    return () => setActiveChatId(null);
  }, [chatId]);
  const {
    currentUser,
    messages,
    pinnedMessages,
    isSaved,
    friends,
    displayUser,
    chat,
    input,
    setInput,
    editInput,
    setEditInput,
    showAttachments,
    setShowAttachments,
    replyingTo,
    setReplyingTo,
    showEmojiPicker,
    setShowEmojiPicker,
    showSearch,
    setShowSearch,
    searchQuery,
    setSearchQuery,
    searchIndex,
    setSearchIndex,
    contextMenu,
    setContextMenu,
    selectedReactionMsg,
    setSelectedReactionMsg,
    showForwardModal,
    setShowForwardModal,
    forwardMsg: _forwardMsg,
    setForwardMsg,
    setForwardBatch,
    showSchedulePicker,
    setShowSchedulePicker,
    scheduleDate,
    setScheduleDate,
    showPollModal,
    setShowPollModal,
    pollQuestion,
    setPollQuestion,
    isChatLocked,
    setIsChatLocked,
    lockPinInput,
    setLockPinInput,
    lockError,
    setLockError,
    unlocking,
    setUnlocking,
    pollOptions,
    setPollOptions,
    showReportModal,
    setShowReportModal,
    reportReason,
    setReportReason,
    reportDetails,
    setReportDetails,
    processingAction,
    lastSeen,
    lightboxImage,
    setLightboxImage,
    uploadProgress,
    editingMessageId,
    setEditingMessageId,
    showDeleteForEveryoneConfirm,
    setShowDeleteForEveryoneConfirm,
    translations,
    setTranslations,
    translatingIds,
    setTranslatingIds,
    chatBg,
    setChatBg,
    showBgPicker,
    setShowBgPicker,
    typingUsers,
    friendStatus,
    loadingOlder,
    setLoadingOlder,
    handleEditSave,
    handleSend,
    handleMediaUpload,
    failedUploads,
    cancelUpload,
    retryUpload,
    dismissFailedUpload,
    handleDelete,
    handleDeleteForEveryone,
    handleForward,
    handleSaveMessage,
    handlePin,
    handleRecall,
    handleReport,
    handleAddFriend: _handleAddFriend,
    handleCancelRequest: _handleCancelRequest,
    handleAcceptRequest: _handleAcceptRequest,
    handleRejectRequest: _handleRejectRequest,
    handleRemoveFriend,
    handleBlockUser,
    handleUnblockUser,
    handleSendPoll,
    handleVote,
    handleScheduleSend,
    handleSendContact,
    loadOlderMessages,
    hasMore,
    addReaction,
    sendTyping,
    stopTyping,
    unlockChat,
    iBlockedUser,
  } = useChatRoom(chatId, userId);

  const { chats } = useChatStore();

  const {
    isRecording, duration, startRecording, stopRecording, cancelRecording,
    previewUrl: voicePreviewUrl, previewDuration: voicePreviewDuration,
    clearPreview: clearVoicePreview, discardPreview: discardVoicePreview, getPreviewBlob,
  } = useVoiceRecorder();
  const liveLocation = useLiveLocation(chatId, userId);
  useFilteredOnline(currentUser?.id || '', friends);
  const { onlineUsers } = useOnlineUsers();
  const callCtx = useCallContext();
  const handleCall = useCallback((video: boolean) => {
    const du = displayUser;
    if (du && typeof du === 'object' && 'id' in du && !('then' in du)) {
      callCtx.startCall({ id: String((du as { id: string }).id) }, video ? 'video' : 'voice');
    }
  }, [displayUser, callCtx]);

  const resetForwardModal = useCallback(() => {
    setShowForwardModal(false);
    setForwardMsg(null);
    setForwardBatch([]);
  }, [setShowForwardModal, setForwardMsg, setForwardBatch]);

  const virtuoso = useRef<any>(null);
  const initialLatestTimestampRef = useRef<number | null>(null);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [showTransfer, setShowTransfer] = useState(false);
  const [showDeleteSelectedConfirm, setShowDeleteSelectedConfirm] = useState(false);
  // Attachment flow: files staged for review before sending.
  const [pendingMedia, setPendingMedia] = useState<File[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [showLiveLocation, setShowLiveLocation] = useState(false);
  const [liveLocationStarting, setLiveLocationStarting] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartXRef = useRef(0);
  const touchCurrentXRef = useRef(0);

  const isUserOnline = !!onlineUsers[userId];
  const activeTypingUsers = Object.values(typingUsers || {});

  const { scrollToBottom, isAtBottom, msgs, handleAtBottomStateChange } = useChatScrollBehavior({
    chatId,
    messages,
    virtuoso,
    hasNewMessages,
    setHasNewMessages,
    initialLatestTimestampRef,
  });

  // ── Unread tracking (§31 "N new messages" pill, §32 unread divider) ──────
  // The read boundary is the timestamp of the newest message the user has
  // actually seen (i.e. while they were at the bottom). Messages newer than
  // this boundary are "new" and drive both the unread divider and the pill.
  const [newMessagesCount, setNewMessagesCount] = useState(0);

  // Keep the read boundary pinned to the latest message while at the bottom.
  useEffect(() => {
    if (msgs.length === 0) return;
    if (isAtBottom) {
      const latest = msgs[msgs.length - 1].timestamp.getTime();
      initialLatestTimestampRef.current = latest;
      if (newMessagesCount !== 0) setNewMessagesCount(0);
      if (hasNewMessages) setHasNewMessages(false);
    }
  }, [msgs, isAtBottom, newMessagesCount, hasNewMessages, initialLatestTimestampRef, setHasNewMessages]);

  // Count messages that arrived after the read boundary while scrolled up.
  useEffect(() => {
    if (msgs.length === 0) {
      if (newMessagesCount !== 0) setNewMessagesCount(0);
      return;
    }
    const boundary = initialLatestTimestampRef.current ?? 0;
    const count = msgs.filter(
      (m) => m.timestamp.getTime() > boundary && m.senderId !== currentUser?.id,
    ).length;
    setNewMessagesCount(count);
    setHasNewMessages(count > 0 && !isAtBottom);
  }, [msgs, isAtBottom, currentUser?.id, newMessagesCount, initialLatestTimestampRef, setHasNewMessages]);

  // Index of the first unread message — the divider renders exactly once.
  const firstUnreadIndex = useMemo(() => {
    if (!hasNewMessages) return -1;
    const boundary = initialLatestTimestampRef.current ?? 0;
    return msgs.findIndex(
      (m) => m.timestamp.getTime() > boundary && m.senderId !== currentUser?.id,
    );
  }, [hasNewMessages, msgs, currentUser?.id, initialLatestTimestampRef]);

  // markAsRead is handled inside useChatRoom on message subscription

  const handleVoiceSend = useCallback(async () => {
    if (!currentUser) return;
    try {
      // The clip was already recorded and is sitting in the preview bar; grab
      // its blob, upload once with the correct 'voice' kind, then send.
      const blob = getPreviewBlob();
      if (!blob) return;
      const url = await uploadMediaBlob(blob, { userId: currentUser.id, kind: 'voice', contentType: 'audio/webm' });
      if (url) {
        // Persist the real recorded duration so the bubble never has to derive
        // it from streaming metadata (which can be Infinity/NaN).
        const recordedDuration =
          typeof voicePreviewDuration === 'number' && Number.isFinite(voicePreviewDuration) && voicePreviewDuration > 0
            ? Math.round(voicePreviewDuration)
            : undefined;
        await useChatStore.getState().sendMessage(chatId, currentUser.id, 'Voice message', 'voice', url, undefined, recordedDuration);
      }
      clearVoicePreview();
      scrollToBottom();
    } catch {
      toast.error('Failed to send voice message.');
    }
  }, [chatId, currentUser, scrollToBottom, getPreviewBlob, clearVoicePreview, voicePreviewDuration]);

  // Release the mic: stopRecording() finalises the clip and drops it into the
  // preview bar (it does NOT send). The user then taps Send or Discard.
  const handleStopRecording = useCallback(() => {
    void stopRecording();
  }, [stopRecording]);

  const handleVoiceDiscard = useCallback(() => {
    discardVoicePreview();
  }, [discardVoicePreview]);

  // Stage picked files for review in the MediaPreviewSheet instead of
  // uploading immediately, so the user can add a caption / remove items.
  const stageMedia = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) setPendingMedia((prev) => [...prev, ...files]);
    e.target.value = '';
  }, []);

  const handleMediaSend = useCallback(
    (files: File[], opts: { caption: string; originalQuality: boolean }) => {
      setPendingMedia([]);
      void handleMediaUpload(files, opts);
    },
    [handleMediaUpload],
  );

  const handleCameraCapture = useCallback((file: File) => {
    setShowCamera(false);
    setPendingMedia((prev) => [...prev, file]);
  }, []);

  const handleContactSend = useCallback(
    (contact: ContactCard) => {
      setShowContactPicker(false);
      void handleSendContact(contact);
    },
    [handleSendContact],
  );

  const handleStartLiveLocation = useCallback(
    async (minutes: number) => {
      setLiveLocationStarting(true);
      try {
        const ok = await liveLocation.start(minutes);
        if (ok) {
          setShowLiveLocation(false);
          scrollToBottom();
        } else {
          toast.error('Could not get your location. Check permissions.');
        }
      } finally {
        setLiveLocationStarting(false);
      }
    },
    [liveLocation, scrollToBottom],
  );

  // Retry a failed message send. The failed optimistic copy is removed from
  // the store first, then sendMessage re-adds a fresh 'sending' optimistic
  // message and attempts the write again (with its internal backoff retry).
  const handleRetryMessage = useCallback(async (msg: Message) => {
    if (!currentUser) return;
    try {
      // Remove the failed optimistic copy so it doesn't duplicate on resend
      useChatStore.setState((s) => ({
        messages: {
          ...s.messages,
          [chatId]: (s.messages[chatId] ?? []).filter((m) => m.id !== msg.id),
        },
      }));
      await useChatStore.getState().sendMessage(
        chatId,
        currentUser.id,
        msg.content,
        msg.type,
        msg.mediaUrl,
        msg.replyTo,
      );
      scrollToBottom();
    } catch {
      toast.error('Failed to resend message.');
    }
  }, [chatId, currentUser, scrollToBottom]);

  const handleUnlock = useCallback(async () => {
    if (!chat) return;
    setUnlocking(true);
    setLockError('');
    try {
      // Verify the PIN against the stored (hashed) value before unlocking
      const storedValue = chat.lockValue;
      if (!storedValue) {
        setLockError('No PIN configured for this chat.');
        return;
      }
      let matched = false;
      if (storedValue.length === 64) {
        // Stored value is a SHA-256 hash — hash the input and compare
        try {
          const encoder = new TextEncoder();
          const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(lockPinInput));
          const hex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
          matched = hex === storedValue;
        } catch {
          matched = false;
        }
      } else {
        // Legacy plain-text PIN — compare directly
        matched = lockPinInput === storedValue;
      }
      if (matched) {
        await unlockChat(chat.id);
        setIsChatLocked(false);
        toast.success('Chat unlocked!');
      } else {
        setLockError('Incorrect PIN.');
      }
    } catch {
      setLockError('An error occurred.');
    } finally {
      setUnlocking(false);
      setLockPinInput('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat, unlockChat, lockPinInput]);

  const handleEditStart = useCallback((msg: Message) => {
    setEditingMessageId(msg.id);
    setEditInput(msg.content);
    setContextMenu(null);
  }, [setEditingMessageId, setEditInput, setContextMenu]);

  const handleTranslate = useCallback(async (msg: Message) => {
    const { id: msgId, content: text } = msg;
    if (translations[msgId]) {
      setTranslations(prev => { const n = { ...prev }; delete n[msgId]; return n; });
      return;
    }
    if (!text?.trim()) return;
    setTranslatingIds(prev => new Set(prev).add(msgId));
    try {
      const res = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|en`
      );
      const json = await res.json() as { responseData?: { translatedText?: string }; responseStatus?: number };
      const translated = json?.responseData?.translatedText;
      if (translated && json.responseStatus === 200) {
        setTranslations(prev => ({ ...prev, [msgId]: translated }));
      } else {
        toast.error('Translation unavailable.');
      }
    } catch {
      toast.error('Translation failed.');
    } finally {
      setTranslatingIds(prev => { const s = new Set(prev); s.delete(msgId); return s; });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translations]);

  const searchResults = useMemo(() => {
    if (!searchQuery) return [];
    return msgs.reduce((acc, msg, index) => {
      if (msg.content.toLowerCase().includes(searchQuery.toLowerCase())) {
        acc.push(index);
      }
      return acc;
    }, [] as number[]);
  }, [msgs, searchQuery]);

  const msgIdMap = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of msgs) map.set(m.id, m);
    return map;
  }, [msgs]);

  const resolvedDisplayUser =
    displayUser && typeof displayUser === 'object' && 'id' in displayUser && !('then' in displayUser)
      ? {
        id: (displayUser as { id: string; name: string; avatar?: string }).id,
        name: (displayUser as { id: string; name: string }).name || '',
        avatar: (displayUser as { id: string; avatar?: string }).avatar || '',
        username: (displayUser as { username?: string }).username || '',
      }
      : { id: userId, name: '', avatar: '', username: '' };

  // Always-visible identity: prefer the @handle, fall back to a short user id.
  const displayHandle = resolvedDisplayUser.username
    ? `@${resolvedDisplayUser.username}`
    : resolvedDisplayUser.id
      ? `#${resolvedDisplayUser.id.slice(0, 8)}`
      : '';

  const handleSearchNavigate = useCallback((direction: 'up' | 'down') => {
    if (searchResults.length === 0) return;
    const nextIndex = direction === 'up'
      ? (searchIndex - 1 + searchResults.length) % searchResults.length
      : (searchIndex + 1) % searchResults.length;
    setSearchIndex(nextIndex);
    virtuoso.current?.scrollToIndex({ index: searchResults[nextIndex], align: 'center', behavior: 'smooth' });
  }, [searchResults, searchIndex, setSearchIndex]);

  const shouldShowAvatar = useCallback((msg: Message, index: number) => {
    const prev = msgs[index - 1];
    return !prev || prev.senderId !== msg.senderId || hasDayBoundary(prev, msg);
  }, [msgs]);

  const shouldShowDate = useCallback((msg: Message, index: number) => {
    const prev = msgs[index - 1];
    return !prev || !isSameDay(prev.timestamp, msg.timestamp);
  }, [msgs]);

  const shouldShowUnreadSeparator = useCallback((_msg: Message, index: number) => {
    return index === firstUnreadIndex;
  }, [firstUnreadIndex]);

  const handleMouseDown = useCallback((_msg: Message) => {
    // Reserved for future long-press / drag interactions
  }, []);

  const handleMouseUp = useCallback(() => {
    // Reserved for future interactions
  }, []);

  const handleMouseLeave = useCallback(() => {
    // Reserved for future interactions
  }, []);

  const handleToggleSelect = useCallback((msgId: string) => {
    setSelectedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(msgId)) {
        newSet.delete(msgId);
      } else {
        newSet.add(msgId);
      }
      if (newSet.size === 0) {
        setSelectionMode(false);
      }
      return newSet;
    });
  }, []);

  const handleClickMsg = useCallback((msg: Message) => {
    if (selectionMode) {
      handleToggleSelect(msg.id);
    }
  }, [selectionMode, handleToggleSelect]);

  const handleDoubleClickMsg = useCallback((msg: Message) => {
    setReplyingTo(msg);
  }, [setReplyingTo]);

  const handleLongPress = useCallback((msg: Message) => {
    longPressTimerRef.current = setTimeout(() => {
      setSelectionMode(true);
      setSelectedMessages(prev => new Set(prev).add(msg.id));
    }, 500);
  }, []);

  useEffect(() => () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedMessages(new Set());
  }, []);

  const handleCopySelected = useCallback(async () => {
    const selected = msgs.filter(m => selectedMessages.has(m.id));
    const text = selected.map(m => m.content).filter(Boolean).join('\n');
    if (!text) return;
    try {
      const ok = await copyToClipboard(text);
      if (ok) {
        toast.success(`Copied ${selected.length} message(s).`);
      } else {
        toast.error('Unable to copy messages in this browser.');
      }
    } catch {
      toast.error('Failed to copy messages.');
    }
    handleClearSelection();
  }, [msgs, selectedMessages, handleClearSelection]);

  const handleForwardSelected = useCallback(() => {
    const selected = msgs.filter(m => selectedMessages.has(m.id));
    if (selected.length === 0) return;
    setForwardBatch(selected as Message[]);
    setShowForwardModal(true);
    handleClearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs, selectedMessages, handleClearSelection]);

  const handleDeleteSelected = useCallback(async () => {
    const selected = msgs.filter(m => selectedMessages.has(m.id));
    if (selected.length === 0) return;
    setShowDeleteSelectedConfirm(true);
  }, [msgs, selectedMessages]);

  const confirmDeleteSelected = useCallback(async () => {
    setShowDeleteSelectedConfirm(false);
    const selected = msgs.filter(m => selectedMessages.has(m.id));
    try {
      for (const m of selected) {
        await handleDelete(m.id);
      }
      toast.success('Message(s) deleted.');
    } catch {
      toast.error('Failed to delete messages.');
    }
    handleClearSelection();
  }, [msgs, selectedMessages, handleClearSelection, handleDelete]);

  const [_swipeState, setSwipeState] = useState<{ msgId: string; offset: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent, msg: Message) => {
    if (selectionMode) return;
    handleLongPress(msg);
    touchStartXRef.current = e.touches[0].clientX;
    touchCurrentXRef.current = e.touches[0].clientX;
    setSwipeState(null);
  }, [selectionMode, handleLongPress]);

  const handleTouchMove = useCallback((e: React.TouchEvent, msg: Message) => {
    if (selectionMode) return;
    touchCurrentXRef.current = e.touches[0].clientX;
    const diff = touchCurrentXRef.current - touchStartXRef.current;
    if (diff < -5) {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    }
    // Visual swipe-to-reply feedback (right swipe only)
    if (diff > 0 && diff < SWIPE_THRESHOLD * 1.5) {
      setSwipeState({ msgId: msg.id, offset: diff });
    }
  }, [selectionMode]);

  const handleTouchEnd = useCallback((msg: Message) => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    const diff = touchCurrentXRef.current - touchStartXRef.current;
    if (!selectionMode && diff > SWIPE_THRESHOLD) {
      setReplyingTo(msg);
    }
    setSwipeState(null);
    touchStartXRef.current = 0;
    touchCurrentXRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionMode]);

  return (
    <div className="flex flex-col h-full bg-background" style={{ backgroundImage: chatBg }}>
      <ChatHeader
        displayUser={resolvedDisplayUser}
        handle={displayHandle}
        userId={userId}
        isUserOnline={isUserOnline}
        activeTypingUsers={activeTypingUsers}
        friendStatus={friendStatus || ''}
        lastSeen={lastSeen}
        showSearch={showSearch}
        selectionMode={selectionMode}
        selectedCount={selectedMessages.size}
        processingAction={processingAction}
        onBack={() => { if (onBack) onBack(); }}
        onToggleSearch={() => setShowSearch(prev => !prev)}
        onToggleBgPicker={() => setShowBgPicker(prev => !prev)}
        onToggleTransfer={() => setShowTransfer(true)}
        onVoiceCall={() => handleCall(false)}
        onVideoCall={() => handleCall(true)}
        onViewProfile={() => navigate(`/profile/${userId}`)}
        onChatInfo={() => navigate(`/chat-info/${chatId}`)}
        onRemoveFriend={handleRemoveFriend}
        onBlockUser={handleBlockUser}
        onUnblockUser={handleUnblockUser}
        onReport={() => setShowReportModal(prev => !prev)}
        onCopySelected={handleCopySelected}
        onForwardSelected={handleForwardSelected}
        onDeleteSelected={handleDeleteSelected}
        onExitSelection={handleClearSelection}
      />

      {/* Background Picker */}
      <AnimatePresence>
        {showBgPicker && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 bg-background border-b border-border overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 py-2.5">
              <span className="text-xs font-semibold text-muted-foreground mr-1">Background:</span>
              {[
                { label: 'Default', value: '' },
                { label: 'Mint', value: 'linear-gradient(180deg, #E7F9E7 0%, #D0F0D0 100%)' },
                { label: 'Sky', value: 'linear-gradient(180deg, #E0F2FE 0%, #C7E8FB 100%)' },
                { label: 'Peach', value: 'linear-gradient(180deg, #FFEEDB 0%, #FFDFC2 100%)' },
                { label: 'Lavender', value: 'linear-gradient(180deg, #EFEBFF 0%, #DDD4FF 100%)' },
              ].map(opt => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setChatBg(opt.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${chatBg === opt.value
                    ? 'bg-[#00C300] text-white'
                    : 'bg-muted text-foreground hover:bg-muted'
                    }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transfer Modal */}
      <TransferModal
        open={showTransfer}
        onClose={() => setShowTransfer(false)}
        chatId={chatId}
        toUserId={userId}
        toUserName={displayUser && typeof displayUser === 'object' && 'name' in displayUser ? (displayUser as { name: string }).name : undefined}
      />

      {/* Message Search */}
      <MessageSearch
        isOpen={showSearch}
        query={searchQuery}
        totalResults={searchResults.length}
        currentIndex={searchIndex}
        onQueryChange={(q) => { setSearchQuery(q); setSearchIndex(0); }}
        onClose={() => { setShowSearch(false); setSearchQuery(''); setSearchIndex(0); }}
        onNavigate={(dir) => handleSearchNavigate(dir === 'next' ? 'down' : 'up')}
      />

      {/* Main chat area */}
      <div className="flex-1 overflow-y-auto relative">
        <AnimatePresence>
          {isChatLocked && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute top-0 right-0 bottom-0 left-0 bg-black/50 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-4"
            >
              <Lock size={48} className="text-white mb-4" />
              <h3 className="text-white text-lg font-bold">Chat Locked</h3>
              <p className="text-gray-300 text-sm mb-4">Enter PIN to unlock</p>
              <input
                type="password"
                value={lockPinInput}
                onChange={(e) => setLockPinInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                className="bg-gray-800 text-white rounded-xl px-4 py-3 text-center w-48 text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                placeholder="PIN"
              />
              {lockError && <p className="text-red-400 text-xs mt-2">{lockError}</p>}
              <button
                onClick={handleUnlock}
                disabled={unlocking}
                className="mt-4 bg-[#00C300] text-white px-6 py-3 rounded-xl min-h-[44px] disabled:opacity-50"
              >
                {unlocking ? <Loader size={16} className="animate-spin" /> : 'Unlock'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <Virtuoso
          ref={virtuoso}
          data={msgs}
          computeItemKey={(_, msg) => msg.id}
          initialTopMostItemIndex={msgs.length > 0 ? msgs.length - 1 : 0}
          atBottomStateChange={handleAtBottomStateChange}
          atBottomThreshold={80}
          increaseViewportBy={{ top: 600, bottom: 600 }}
          overscan={{ main: 400, reverse: 400 }}
          defaultItemHeight={64}
          followOutput={(isAtBottom) => (isAtBottom ? 'smooth' : false)}
          itemContent={(index, msg) => (
            <MessageItem
              key={msg.id}
              msg={msg}
              isMe={msg.senderId === currentUser?.id}
              showAvatar={shouldShowAvatar(msg, index)}
              showDate={shouldShowDate(msg, index)}
              msgDate={formatDateSeparator(msg.timestamp)}
              showUnreadSeparator={shouldShowUnreadSeparator(msg, index)}
              isSelected={selectedMessages.has(msg.id)}
              isSearchMatch={searchQuery ? (msg.content || '').toLowerCase().includes(searchQuery.toLowerCase()) : false}
              editingMessageId={editingMessageId}
              editInput={editInput}
              selectionMode={selectionMode}
              selectedReactionMsg={selectedReactionMsg}
              displayUser={resolvedDisplayUser}
              otherUserName={resolvedDisplayUser.name || 'Chat'}
              userId={userId}
              currentUserId={currentUser?.id || ''}
              msgIdMap={msgIdMap}
              translatedText={translations[msg.id]}
              isTranslating={translatingIds.has(msg.id)}
              onContextMenu={(e, message) => {
                e.preventDefault();
                setContextMenu({ msg: message, position: { x: e.clientX, y: e.clientY } });
              }}
              onTouchStart={(e) => handleTouchStart(e, msg)}
              onTouchMove={(e) => handleTouchMove(e, msg)}
              onTouchEnd={() => handleTouchEnd(msg)}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              onClick={handleClickMsg}
              onDoubleClick={handleDoubleClickMsg}
              onReact={(msgId, reaction) => addReaction(chatId, msgId, reaction, currentUser?.id || '')}
              onSetReactionMsg={setSelectedReactionMsg}
              onEditInputChange={setEditInput}
              onEditSave={handleEditSave}
              onEditCancel={() => { setEditingMessageId(null); setEditInput(''); }}
              onSetReplyingTo={setReplyingTo}
              onSetLightbox={setLightboxImage}
              onVotePoll={handleVote}
              onNavigate={navigate}
              onRetry={handleRetryMessage}
              chatId={chatId}
            />
          )}
          components={{
            Header: () => (
              <div className="p-4 flex justify-center">
                {hasMore && (
                  <button
                    onClick={async () => {
                      setLoadingOlder(true);
                      await loadOlderMessages(chatId);
                      setLoadingOlder(false);
                    }}
                    disabled={loadingOlder}
                    className="px-4 py-2 rounded-full bg-muted text-[#00C300] text-xs font-semibold disabled:opacity-50 active:scale-95 transition-transform"
                  >
                    {loadingOlder ? 'Loading…' : 'Load older messages'}
                  </button>
                )}
              </div>
            ),
          }}
        />

        {!isAtBottom && (
          <button
            onClick={scrollToBottom}
            className={`absolute bottom-4 right-4 z-10 active:scale-95 transition-transform ${
              newMessagesCount > 0
                ? 'bg-[#00C300] text-white rounded-full pl-3 pr-2 py-2 shadow-lg flex items-center gap-1.5'
                : 'bg-background rounded-full p-2.5 shadow-lg border border-border'
            }`}
            aria-label={newMessagesCount > 0 ? `${newMessagesCount} new messages` : 'Scroll to latest'}
          >
            {newMessagesCount > 0 && (
              <span className="text-xs font-semibold whitespace-nowrap">
                {newMessagesCount} new message{newMessagesCount > 1 ? 's' : ''}
              </span>
            )}
            <ChevronDown size={newMessagesCount > 0 ? 18 : 22} className={newMessagesCount > 0 ? 'text-white' : 'text-foreground'} />
          </button>
        )}
      </div>

      {/* Upload progress */}
      <AnimatePresence>
        {uploadProgress && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="shrink-0 bg-background border-t border-border px-4 py-2"
          >
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
              <span className="truncate max-w-[70%]">
                {uploadProgress.stage === 'preparing'
                  ? `Preparing ${uploadProgress.name}…`
                  : `Uploading ${uploadProgress.name}…`}
              </span>
              <span className="flex items-center gap-2">
                <span>{uploadProgress.stage === 'preparing' ? '…' : `${uploadProgress.percent}%`}</span>
                <button
                  type="button"
                  onClick={cancelUpload}
                  className="font-semibold text-[#00C300] hover:underline"
                >
                  Cancel
                </button>
              </span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full bg-[#00C300] transition-all duration-200 ${uploadProgress.stage === 'preparing' ? 'animate-pulse' : ''}`}
                style={{ width: uploadProgress.stage === 'preparing' ? '100%' : `${uploadProgress.percent}%` }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live location active banner */}
      <AnimatePresence>
        {liveLocation.active && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="shrink-0 bg-[#00C300]/10 dark:bg-[#00C300]/15 border-t border-[#00C300]/20 px-4 py-2 flex items-center gap-2"
          >
            <Navigation size={16} className="text-[#00C300] shrink-0 animate-pulse" />
            <span className="text-xs text-foreground flex-1 truncate">
              Sharing live location
              {liveLocation.expiresAt
                ? ` \u00b7 ends ${new Date(liveLocation.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : ' \u00b7 until you stop'}
            </span>
            <button
              type="button"
              onClick={() => liveLocation.stop('manual')}
              className="text-xs font-semibold text-[#00C300] hover:underline shrink-0"
            >
              Stop
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Failed uploads \u2014 retry / dismiss */}
      <AnimatePresence>
        {failedUploads.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="shrink-0 bg-[#FF3B30]/10 border-t border-[#FF3B30]/20 px-4 py-2 space-y-1.5"
          >
            {failedUploads.map((f) => (
              <div key={f.id} className="flex items-center gap-2">
                <AlertCircle size={15} className="text-[#FF3B30] shrink-0" />
                <span className="text-xs text-foreground flex-1 truncate">
                  Couldn&apos;t send {f.file.name}
                </span>
                <button
                  type="button"
                  onClick={() => retryUpload(f.id)}
                  className="text-xs font-semibold text-[#00C300] hover:underline shrink-0"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => dismissFailedUpload(f.id)}
                  className="text-xs font-semibold text-muted-foreground hover:underline shrink-0"
                >
                  Dismiss
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input bar */}
      {iBlockedUser ? (
        <div className="shrink-0 px-4 py-3 border-t border-border bg-muted flex items-center justify-center gap-2">
          <Ban size={16} className="text-[#FF3B30]" />
          <span className="text-sm text-muted-foreground">You blocked this user.</span>
          <button
            type="button"
            onClick={handleUnblockUser}
            className="text-sm font-semibold text-[#00C300] hover:underline"
          >
            Unblock
          </button>
        </div>
      ) : (
      <InputBar
        input={input}
        onInputChange={setInput}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        showAttachments={showAttachments}
        onToggleAttachments={() => setShowAttachments(!showAttachments)}
        showEmojiPicker={showEmojiPicker}
        onToggleEmojiPicker={() => setShowEmojiPicker(!showEmojiPicker)}
        isRecording={isRecording}
        duration={duration}
        voicePreviewUrl={voicePreviewUrl}
        voicePreviewDuration={voicePreviewDuration}
        onSend={() => handleSend()}
        onTyping={() => sendTyping()}
        onStopTyping={stopTyping}
        onEmojiSelect={(emoji) => setInput(input + emoji)}
        onStartRecording={startRecording}
        onStopRecording={handleStopRecording}
        onCancelRecording={cancelRecording}
        onVoiceSend={handleVoiceSend}
        onVoiceDiscard={handleVoiceDiscard}
        onPhotoUpload={stageMedia}
        onVideoUpload={stageMedia}
        onFileUpload={stageMedia}
        onCameraCapture={() => setShowCamera(true)}
        onLiveLocation={() => setShowLiveLocation(true)}
        onSchedule={() => setShowSchedulePicker(true)}
        onContactShare={() => setShowContactPicker(true)}
        onLocationShare={async () => {
          if (!navigator?.geolocation) {
            toast.error('Location sharing is not supported by this browser.');
            return;
          }
          try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: false,
                timeout: 8000,
                maximumAge: 60000,
              });
            });
            const { latitude, longitude } = pos.coords;
            const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
            if (!currentUser) return;
            await useChatStore.getState().sendMessage(
              chatId,
              currentUser.id,
              `📍 ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
              'location',
              mapsUrl,
            );
            scrollToBottom();
          } catch (err) {
            const msg = err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 1
              ? 'Location permission denied.'
              : 'Failed to get location.';
            toast.error(msg);
          }
        }}
        onPollOpen={() => setShowPollModal(true)}
        onStickerSelect={async (sticker) => {
          if (!currentUser) return;
          try {
            if (sticker.type === 'gif') {
              await handleSend(sticker.content);
            } else {
              await handleSend(sticker.content);
            }
            scrollToBottom();
          } catch {
            toast.error('Failed to send sticker.');
          }
        }}
      />
      )}

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed bg-background rounded-xl shadow-xl border border-border z-50 py-1 min-w-[160px] max-w-[220px]"
            style={{
              top: Math.min(contextMenu.position?.y ?? 0, window.innerHeight - 320),
              left: Math.max(8, Math.min(contextMenu.position?.x ?? 0, window.innerWidth - 228))
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {[
              { label: 'Reply', action: () => { setReplyingTo(contextMenu.msg); setContextMenu(null); } },
              { label: 'Copy', action: async () => { const ok = await copyToClipboard(contextMenu.msg.content); if (ok) toast.success('Copied'); else toast.error('Unable to copy in this browser'); setContextMenu(null); } },
              { label: 'Select', action: () => { setSelectionMode(true); setSelectedMessages(new Set([contextMenu.msg.id])); setContextMenu(null); } },
              ...(contextMenu.msg.senderId === currentUser?.id ? [
                { label: 'Edit', action: () => handleEditStart(contextMenu.msg as Message) },
                { label: 'Recall', action: () => handleRecall(contextMenu.msg.id) },
                { label: 'Delete for everyone', action: () => { setShowDeleteForEveryoneConfirm(contextMenu.msg.id); setContextMenu(null); } },
              ] : []),
              { label: 'Delete for me', action: () => handleDelete(contextMenu.msg.id) },
              { label: isSaved(contextMenu.msg.id) ? 'Unsave' : 'Save', action: () => handleSaveMessage(contextMenu.msg) },
              { label: pinnedMessages.some(p => p.messageId === contextMenu.msg.id) ? 'Unpin' : 'Pin', action: () => handlePin(contextMenu.msg) },
              { label: 'Forward', action: () => { setForwardMsg(contextMenu.msg); setShowForwardModal(true); setContextMenu(null); } },
              { label: 'Translate', action: () => handleTranslate(contextMenu.msg as Message) },
              { label: 'Report', action: () => { setShowReportModal(true); setContextMenu(null); } },
            ].map(({ label, action }) => (
              <button
                key={label}
                type="button"
                onClick={action}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors ${label === 'Delete for everyone' || label === 'Delete for me' ? 'text-red-500' : 'text-foreground'
                  }`}
              >
                {label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      {/* Forward Modal */}
      <AnimatePresence>
        {showForwardModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed top-0 right-0 bottom-0 left-0 bg-black/50 z-50 flex items-end justify-center"
            onClick={resetForwardModal}
          >
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-background rounded-t-3xl p-5 w-full max-w-lg max-h-[70vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
              <h3 className="text-base font-bold text-foreground mb-3">Forward to…</h3>
              <div className="flex-1 overflow-y-auto space-y-1">
                {chats.filter(c => c.id !== chatId).map(target => {
                  const otherId = target.participants?.find(p => p !== currentUser?.id);
                  const otherUser = otherId ? friends.find(f => f.id === otherId) : undefined;
                  const name = target.type === 'group'
                    ? (target.name || 'Group')
                    : (otherUser?.name || '');
                  const avatar = target.type === 'group'
                    ? (target.avatar || '')
                    : (otherUser?.avatar || '');
                  return (
                    <button
                      key={target.id}
                      type="button"
                      onClick={() => handleForward(target.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted rounded-xl transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                        {sanitizeMediaUrl(avatar) ? (
                          <img src={sanitizeMediaUrl(avatar)} className="w-full h-full object-cover" alt="" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-[#00C300]/10 text-[#00C300] font-bold text-sm">
                            {name.charAt(0) || (target.type === 'group' ? 'G' : 'U')}
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-medium text-foreground truncate">{name || 'Chat'}</span>
                    </button>
                  );
                })}
                {chats.filter(c => c.id !== chatId).length === 0 && (
                  <p className="text-sm text-muted-foreground px-3 py-4 text-center">No other chats to forward to.</p>
                )}
              </div>
              <button type="button" onClick={resetForwardModal}
                className="mt-3 w-full py-3 bg-muted text-foreground rounded-xl text-sm font-bold"
              >Cancel</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete for Everyone Confirm */}
      <AnimatePresence>
        {showDeleteForEveryoneConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed top-0 right-0 bottom-0 left-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowDeleteForEveryoneConfirm(null)}
          >
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-background rounded-2xl p-6 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-foreground mb-2">Delete for Everyone?</h3>
              <p className="text-muted-foreground text-sm mb-4">This message will be removed for all participants.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowDeleteForEveryoneConfirm(null)}
                  className="flex-1 py-3 bg-muted text-foreground rounded-xl text-sm font-bold"
                >Cancel</button>
                <button type="button" onClick={() => { if (showDeleteForEveryoneConfirm) handleDeleteForEveryone(showDeleteForEveryoneConfirm); }}
                  className="flex-1 py-3 bg-[#FF3B30] text-white rounded-xl text-sm font-bold"
                >Delete</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Report Modal */}
      <AnimatePresence>
        {showReportModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed top-0 right-0 bottom-0 left-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowReportModal(false)}
          >
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-background rounded-2xl p-6 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-foreground mb-3">Report Message</h3>
              <div className="space-y-2 mb-4">
                {['Spam', 'Harassment', 'Hate speech', 'Violence', 'Other'].map(reason => (
                  <button key={reason} type="button"
                    onClick={() => { setReportReason(reportReason === reason ? '' : reason); }}
                    className={`w-full text-left px-4 py-2.5 rounded-xl text-sm transition-colors ${reportReason === reason ? 'bg-[#00C300]/10 text-[#00C300] font-medium' : 'bg-muted text-foreground hover:bg-muted'
                      }`}
                  >{reason}</button>
                ))}
              </div>
              <textarea value={reportDetails} onChange={e => setReportDetails(e.target.value)}
                placeholder="Additional details (optional)"
                rows={2}
                className="w-full bg-muted rounded-xl px-3 py-2 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-[#00C300] mb-4"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowReportModal(false)}
                  className="flex-1 py-3 bg-muted text-foreground rounded-xl text-sm font-bold"
                >Cancel</button>
                <button type="button" onClick={() => { handleReport(); setShowReportModal(false); }} disabled={!reportReason}
                  className="flex-1 py-3 bg-[#FF3B30] text-white rounded-xl text-sm font-bold disabled:opacity-50"
                >Report</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Poll Modal */}
      <AnimatePresence>
        {showPollModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed top-0 right-0 bottom-0 left-0 bg-black/50 z-50 flex items-end justify-center"
            onClick={() => setShowPollModal(false)}
          >
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-background rounded-t-3xl p-5 w-full max-w-lg"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
              <h3 className="text-base font-bold text-foreground mb-3">Create Poll</h3>
              <input value={pollQuestion} onChange={e => setPollQuestion(e.target.value)}
                placeholder="Ask a question…"
                className="w-full bg-muted rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#00C300] mb-3"
              />
              <div className="space-y-2 mb-3">
                {pollOptions.map((opt, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={opt} onChange={e => { const o = [...pollOptions]; o[i] = e.target.value; setPollOptions(o); }}
                      placeholder={`Option ${i + 1}`}
                      className="flex-1 bg-muted rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                    />
                    {pollOptions.length > 2 && (
                      <button type="button" onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}
                        className="px-3 py-2 text-[#FF3B30] text-sm"
                      >✕</button>
                    )}
                  </div>
                ))}
              </div>
              {pollOptions.length < 6 && (
                <button type="button" onClick={() => setPollOptions([...pollOptions, ''])}
                  className="text-[#00C300] text-sm font-medium mb-3"
                >+ Add option</button>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowPollModal(false)}
                  className="flex-1 py-3 bg-muted text-foreground rounded-xl text-sm font-bold"
                >Cancel</button>
                <button type="button" onClick={handleSendPoll}
                  disabled={!pollQuestion.trim() || pollOptions.some(o => !o.trim())}
                  className="flex-1 py-3 bg-[#00C300] text-white rounded-xl text-sm font-bold disabled:opacity-50"
                >Send Poll</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Schedule Picker */}
      <AnimatePresence>
        {showSchedulePicker && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed top-0 right-0 bottom-0 left-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowSchedulePicker(false)}
          >
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-background rounded-2xl p-6 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-foreground mb-3">Schedule Message</h3>
              <p className="text-muted-foreground text-sm mb-3">Message: <span className="text-foreground font-medium">{input || '(current input)'}</span></p>
              <input type="datetime-local" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)}
                min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                className="w-full bg-muted rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#00C300] mb-4"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowSchedulePicker(false)}
                  className="flex-1 py-3 bg-muted text-foreground rounded-xl text-sm font-bold"
                >Cancel</button>
                <button type="button" onClick={handleScheduleSend} disabled={!scheduleDate || !input.trim()}
                  className="flex-1 py-3 bg-[#00C300] text-white rounded-xl text-sm font-bold disabled:opacity-50"
                >Schedule</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Delete Selected Confirm */}
      <AnimatePresence>
        {showDeleteSelectedConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed top-0 right-0 bottom-0 left-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowDeleteSelectedConfirm(false)}
          >
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-background rounded-2xl p-6 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-foreground mb-2">Delete Messages?</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Delete {selectedMessages.size} selected message{selectedMessages.size !== 1 ? 's' : ''} for you?
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowDeleteSelectedConfirm(false)}
                  className="flex-1 py-3 bg-muted text-foreground rounded-xl text-sm font-bold"
                >Cancel</button>
                <button type="button" onClick={confirmDeleteSelected}
                  className="flex-1 py-3 bg-[#FF3B30] text-white rounded-xl text-sm font-bold"
                >Delete</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-screen image viewer */}
      <ImageLightbox url={lightboxImage} onClose={() => setLightboxImage(null)} />

      {/* Attachment review sheet */}
      <MediaPreviewSheet
        open={pendingMedia.length > 0}
        files={pendingMedia}
        onClose={() => setPendingMedia([])}
        onRemove={(index) => setPendingMedia((prev) => prev.filter((_, i) => i !== index))}
        onSend={handleMediaSend}
      />

      {/* In-app camera */}
      <CameraCaptureSheet
        open={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={handleCameraCapture}
      />

      {/* Contact picker */}
      <ContactPickerSheet
        open={showContactPicker}
        onClose={() => setShowContactPicker(false)}
        friends={friends as Array<{ id: string; name?: string; username?: string; avatar?: string; phone?: string; email?: string; bio?: string }>}
        onSend={handleContactSend}
      />

      {/* Live location duration picker */}
      <LiveLocationSheet
        open={showLiveLocation}
        onClose={() => setShowLiveLocation(false)}
        onStart={handleStartLiveLocation}
        starting={liveLocationStarting}
      />
    </div>
  );
}