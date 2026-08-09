import { useState, useRef, useMemo, useCallback } from 'react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, Loader, Lock,
} from 'lucide-react';

import { useFilteredOnline, useOnlineUsers } from '@/hooks/usePresence';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { useChatScrollBehavior } from '@/hooks/useChatScrollBehavior';
import { uploadMediaBlob } from '@/lib/storage';
import { SWIPE_THRESHOLD, formatDateSeparator } from '@/lib/chatConstants';
import { sanitizeMediaUrl } from '@/lib/utils';

import type { Message } from '@/types';
import { useCallContext } from '@/context/CallContextBase';
import { ChatHeader } from './ChatHeader';
import { MessageItem } from './MessageItem';
import { MessageSearch } from './MessageSearch';
import { InputBar } from './InputBar';
import TransferModal from '@/components/TransferModal';
import { Virtuoso } from 'react-virtuoso';
import { toast } from 'sonner';

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
    setLightboxImage,
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
} = useChatRoom(chatId, userId);

  const { chats } = useChatStore();

const { isRecording, duration, startRecording, stopRecording, cancelRecording } = useVoiceRecorder();
  useFilteredOnline(currentUser?.id || '', friends);
  const { onlineUsers } = useOnlineUsers();
  const callCtx = useCallContext();
  const handleCall = useCallback((video: boolean) => {
    const du = displayUser;
    if (du && typeof du === 'object' && 'id' in du && !('then' in du)) {
      callCtx.startCall({ id: (du as { id: string }).id }, video ? 'video' : 'voice');
    }
  }, [displayUser, callCtx]);

  const virtuoso = useRef<any>(null);
  const initialLatestTimestampRef = useRef<number | null>(null);
const [hasNewMessages, setHasNewMessages] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [showTransfer, setShowTransfer] = useState(false);
  const [showDeleteSelectedConfirm, setShowDeleteSelectedConfirm] = useState(false);
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

  // markAsRead is handled inside useChatRoom on message subscription

const handleVoiceSend = useCallback(async () => {
    if (!currentUser) return;
    try {
      const blob = await stopRecording();
      if (!blob) return;
      // Single upload path (no double-upload) with the correct 'voice' kind,
      // then send as a typed 'voice' message.
      const url = await uploadMediaBlob(blob, { userId: currentUser.id, kind: 'voice', contentType: 'audio/webm' });
      await useChatStore.getState().sendMessage(chatId, currentUser.id, 'Voice message', 'voice', url);
      scrollToBottom();
    } catch {
      toast.error('Failed to send voice message.');
    }
  }, [chatId, currentUser, scrollToBottom, stopRecording]);

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
      await unlockChat(chat.id);
      const success = true;
      if (success) {
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

  const _handleReaction = useCallback(async (msgId: string, reaction: string) => {
    if (!currentUser) return;
    try {
      await addReaction(chatId, msgId, reaction, currentUser.id);
      setSelectedReactionMsg(null);
    } catch {
      toast.error('Failed to add reaction.');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, currentUser, addReaction]);

const handleEditStart = useCallback((msg: Message) => {
    setEditingMessageId(msg.id);
    setEditInput(msg.content);
    setContextMenu(null);
  }, [setEditingMessageId, setEditInput, setContextMenu]);

  const _handleReply = useCallback((msg: Message) => {
    setReplyingTo(msg);
    setContextMenu(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const _handleForwardClick = useCallback((msg: Message) => {
    setForwardMsg(msg);
    setShowForwardModal(true);
    setContextMenu(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const shouldShowUnreadSeparator = useCallback((msg: Message) => {
    return hasNewMessages && msg.timestamp.getTime() >= (initialLatestTimestampRef.current ?? 0) && msg.senderId !== currentUser?.id;
  }, [hasNewMessages, currentUser?.id]);

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

  const handleClearSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedMessages(new Set());
  }, []);

  const handleCopySelected = useCallback(async () => {
    const selected = msgs.filter(m => selectedMessages.has(m.id));
    const text = selected.map(m => m.content).filter(Boolean).join('\n');
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${selected.length} message(s).`);
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
    <div className="flex flex-col h-full bg-white" style={{ backgroundImage: chatBg }}>
      <ChatHeader
        displayUser={displayUser && typeof displayUser === 'object' && 'id' in displayUser && !('then' in displayUser) ? { id: (displayUser as {id:string;name:string;avatar?:string}).id, name: (displayUser as {id:string;name:string}).name || '', avatar: (displayUser as {id:string;avatar?:string}).avatar || '' } : { id: userId, name: '', avatar: '' }}
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
            className="shrink-0 bg-white border-b border-[#EBEBEB] overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 py-2.5">
              <span className="text-xs font-semibold text-[#8D8D8D] mr-1">Background:</span>
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
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    chatBg === opt.value
                      ? 'bg-[#00C300] text-white'
                      : 'bg-[#F5F5F5] text-[#111111] hover:bg-[#EBEBEB]'
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
              className="absolute inset-0 bg-black/50 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-4"
            >
              <Lock size={48} className="text-white mb-4" />
              <h3 className="text-white text-lg font-bold">Chat Locked</h3>
              <p className="text-gray-300 text-sm mb-4">Enter PIN to unlock</p>
              <input
                type="password"
                value={lockPinInput}
                onChange={(e) => setLockPinInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                className="bg-gray-800 text-white rounded-md px-3 py-2 text-center w-40"
                placeholder="PIN"
              />
              {lockError && <p className="text-red-400 text-xs mt-2">{lockError}</p>}
              <button
                onClick={handleUnlock}
                disabled={unlocking}
                className="mt-4 bg-[#00C300] text-white px-4 py-2 rounded-md disabled:opacity-50"
              >
                {unlocking ? <Loader size={16} className="animate-spin" /> : 'Unlock'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

<Virtuoso
          ref={virtuoso}
          data={msgs}
          initialTopMostItemIndex={msgs.length > 0 ? msgs.length - 1 : 0}
          atBottomStateChange={handleAtBottomStateChange}
          followOutput={'auto'}
itemContent={(index, msg) => (
            <MessageItem
              key={msg.id}
              msg={msg}
isMe={msg.senderId === currentUser?.id}
              showAvatar={shouldShowAvatar(msg, index)}
              showDate={shouldShowDate(msg, index)}
              msgDate={formatDateSeparator(msg.timestamp)}
              showUnreadSeparator={shouldShowUnreadSeparator(msg)}
              isSelected={selectedMessages.has(msg.id)}
              isSearchMatch={searchQuery ? (msg.content || '').toLowerCase().includes(searchQuery.toLowerCase()) : false}
              editingMessageId={editingMessageId}
              editInput={editInput}
              selectionMode={selectionMode}
              selectedReactionMsg={selectedReactionMsg}
              displayUser={displayUser && typeof displayUser === 'object' && 'id' in displayUser && !('then' in displayUser) ? { id: (displayUser as {id:string;name:string;avatar?:string}).id, name: (displayUser as {id:string;name:string}).name || '', avatar: (displayUser as {id:string;avatar?:string}).avatar || '' } : { id: userId, name: '', avatar: '' }}
userId={userId}
currentUserId={currentUser?.id || ''}
              msgs={msgs}
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
              <div className="p-4">
                {hasMore && (
                  <button
                    onClick={async () => {
                      setLoadingOlder(true);
                      await loadOlderMessages(chatId);
                      setLoadingOlder(false);
                    }}
                    disabled={loadingOlder}
                    className="text-[#00C300] text-sm disabled:opacity-50"
                  >
                    {loadingOlder ? 'Loading...' : 'Load older messages'}
                  </button>
                )}
              </div>
            ),
          }}
        />

        {!isAtBottom && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 right-4 bg-white rounded-full p-2 shadow-md z-10"
          >
            <ChevronDown size={24} />
          </button>
        )}
      </div>

      {/* Input bar */}
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
onSend={() => handleSend()}
        onTyping={() => sendTyping()}
        onStopTyping={stopTyping}
        onEmojiSelect={(emoji) => setInput(input + emoji)}
        onStartRecording={startRecording}
        onCancelRecording={cancelRecording}
        onVoiceSend={handleVoiceSend}
        onPhotoUpload={(e) => handleMediaUpload(Array.from(e.target.files || []))}
        onVideoUpload={(e) => handleMediaUpload(Array.from(e.target.files || []))}
        onFileUpload={(e) => handleMediaUpload(Array.from(e.target.files || []))}
        onSchedule={() => setShowSchedulePicker(true)}
        onContactShare={() => {
          if (currentUser) handleSendContact({ userId: currentUser.id, name: currentUser.name || 'User', phone: currentUser.phone, email: currentUser.email, avatar: currentUser.avatar, username: currentUser.username });
        }}
        onLocationShare={() => {
          /* logic to share location */
        }}
        onPollOpen={() => setShowPollModal(true)}
        onStickerSelect={async (sticker) => {
          if (!currentUser) return;
          try {
            if (sticker.type === 'gif') {
              setInput(sticker.content);
              await handleSend();
            } else {
              setInput(sticker.content);
              await handleSend();
            }
            scrollToBottom();
          } catch {
            toast.error('Failed to send sticker.');
          }
        }}
      />

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed bg-white rounded-xl shadow-xl border border-gray-100 z-50 py-1 min-w-[160px]"
            style={{ top: Math.min(contextMenu.position?.y ?? 0, window.innerHeight - 300), left: Math.min(contextMenu.position?.x ?? 0, window.innerWidth - 180) }}
            onClick={(e) => e.stopPropagation()}
          >
            {[
              { label: 'Reply', action: () => { setReplyingTo(contextMenu.msg); setContextMenu(null); } },
              { label: 'Copy', action: () => { navigator.clipboard.writeText(contextMenu.msg.content); toast.success('Copied'); setContextMenu(null); } },
              ...(contextMenu.msg.senderId === currentUser?.id ? [
                { label: 'Edit', action: () => handleEditStart(contextMenu.msg as Message) },
                { label: 'Recall', action: () => handleRecall(contextMenu.msg.id) },
                { label: 'Delete for everyone', action: () => setShowDeleteForEveryoneConfirm(contextMenu.msg.id) },
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
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
                  label === 'Delete for everyone' || label === 'Delete for me' ? 'text-red-500' : 'text-gray-800'
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
            className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
            onClick={() => { setShowForwardModal(false); setForwardMsg(null); setForwardBatch([] as any); }}
          >
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white rounded-t-3xl p-5 w-full max-w-lg max-h-[70vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
<div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
              <h3 className="text-base font-bold text-[#111111] mb-3">Forward to…</h3>
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
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#F5F5F5] rounded-xl transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center overflow-hidden shrink-0">
                        {sanitizeMediaUrl(avatar) ? (
                          <img src={sanitizeMediaUrl(avatar)} className="w-full h-full object-cover" alt="" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-[#00C300]/10 text-[#00C300] font-bold text-sm">
                            {name.charAt(0) || (target.type === 'group' ? 'G' : 'U')}
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-medium text-[#111111] truncate">{name || 'Chat'}</span>
                    </button>
                  );
                })}
                {chats.filter(c => c.id !== chatId).length === 0 && (
                  <p className="text-sm text-[#8D8D8D] px-3 py-4 text-center">No other chats to forward to.</p>
                )}
              </div>
              <button type="button" onClick={() => { setShowForwardModal(false); setForwardMsg(null); setForwardBatch([] as any); }}
                className="mt-3 w-full py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold"
              >Cancel</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete for Everyone Confirm */}
      <AnimatePresence>
        {showDeleteForEveryoneConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowDeleteForEveryoneConfirm(null)}
          >
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-[#111111] mb-2">Delete for Everyone?</h3>
              <p className="text-[#8D8D8D] text-sm mb-4">This message will be removed for all participants.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowDeleteForEveryoneConfirm(null)}
                  className="flex-1 py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold"
                >Cancel</button>
                <button type="button" onClick={() => { if (contextMenu) handleDeleteForEveryone(contextMenu.msg.id); setShowDeleteForEveryoneConfirm(null); }}
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
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowReportModal(false)}
          >
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-[#111111] mb-3">Report Message</h3>
              <div className="space-y-2 mb-4">
                {['Spam', 'Harassment', 'Hate speech', 'Violence', 'Other'].map(reason => (
                  <button key={reason} type="button"
onClick={() => { setReportReason(reportReason === reason ? '' : reason); }}
                    className={`w-full text-left px-4 py-2.5 rounded-xl text-sm transition-colors ${
                      reportReason === reason ? 'bg-[#00C300]/10 text-[#00C300] font-medium' : 'bg-[#F5F5F5] text-[#111111] hover:bg-[#EBEBEB]'
                    }`}
                  >{reason}</button>
                ))}
              </div>
              <textarea value={reportDetails} onChange={e => setReportDetails(e.target.value)}
                placeholder="Additional details (optional)"
                rows={2}
                className="w-full bg-[#F5F5F5] rounded-xl px-3 py-2 text-sm text-[#111111] resize-none focus:outline-none focus:ring-2 focus:ring-[#00C300] mb-4"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowReportModal(false)}
                  className="flex-1 py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold"
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
            className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
            onClick={() => setShowPollModal(false)}
          >
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white rounded-t-3xl p-5 w-full max-w-lg"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
              <h3 className="text-base font-bold text-[#111111] mb-3">Create Poll</h3>
              <input value={pollQuestion} onChange={e => setPollQuestion(e.target.value)}
                placeholder="Ask a question…"
                className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#00C300] mb-3"
              />
              <div className="space-y-2 mb-3">
                {pollOptions.map((opt, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={opt} onChange={e => { const o = [...pollOptions]; o[i] = e.target.value; setPollOptions(o); }}
                      placeholder={`Option ${i + 1}`}
                      className="flex-1 bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#00C300]"
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
                  className="flex-1 py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold"
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
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowSchedulePicker(false)}
          >
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-[#111111] mb-3">Schedule Message</h3>
              <p className="text-[#8D8D8D] text-sm mb-3">Message: <span className="text-[#111111] font-medium">{input || '(current input)'}</span></p>
              <input type="datetime-local" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)}
                min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#00C300] mb-4"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowSchedulePicker(false)}
                  className="flex-1 py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold"
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
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowDeleteSelectedConfirm(false)}
          >
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-[#111111] mb-2">Delete Messages?</h3>
              <p className="text-[#8D8D8D] text-sm mb-4">
                Delete {selectedMessages.size} selected message{selectedMessages.size !== 1 ? 's' : ''} for you?
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowDeleteSelectedConfirm(false)}
                  className="flex-1 py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold"
                >Cancel</button>
                <button type="button" onClick={confirmDeleteSelected}
                  className="flex-1 py-3 bg-[#FF3B30] text-white rounded-xl text-sm font-bold"
                >Delete</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}