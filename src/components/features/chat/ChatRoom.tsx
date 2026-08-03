import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
// Simple windowing (virtualization-like) implemented below; no external lib required
import {
  ChevronDown, X, Check, Search, Flag,
  Copy, Trash2, Reply, Forward, Pencil,
  Clock, ArrowRight, Calendar, UserPlus,
  Loader, Pin, Bookmark, BarChart3, Lock, MessageCircle,
  Languages, WifiOff,
} from 'lucide-react';

import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { useFriendStore } from '@/store/useFriendStore';
import { isFirestoreAvailable, COLLECTIONS, getDocById } from '@/lib/firestore';
import { useTyping } from '@/hooks/useTyping';
import { useFilteredOnline } from '@/hooks/usePresence';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { useOfflineQueue, isOnline } from '@/hooks/useOfflineQueue';
import { useMessagePin } from '@/hooks/useMessagePin';
import { useSavedMessages } from '@/hooks/useSavedMessages';
import { useScheduledMessages } from '@/hooks/useScheduledMessages';
import { useDisappearingTimers } from '@/hooks/useDisappearingTimers';
import { useChatScrollBehavior } from '@/hooks/useChatScrollBehavior';
import { getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
import { SWIPE_THRESHOLD, REPORT_OPTIONS, formatDateSeparator } from '@/lib/chatConstants';

import type { Message, FriendRequest, SentRequest } from '@/types';

import { pushNotificationService } from '@/services/pushNotificationService';
import TransferModal from '@/components/TransferModal';
import { ChatHeader } from './ChatHeader';
import { MessageItem } from './MessageItem';
import { InputBar } from './InputBar';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { toast } from 'sonner';

const BG_OPTIONS = [
  { label: 'Default', value: '' },
  { label: 'Mint', value: 'linear-gradient(135deg,#e8f5e9,#f1f8e9)' },
  { label: 'Sky', value: 'linear-gradient(135deg,#e3f2fd,#e8eaf6)' },
  { label: 'Sunset', value: 'linear-gradient(135deg,#fff3e0,#fce4ec)' },
  { label: 'Lavender', value: 'linear-gradient(135deg,#f3e5f5,#ede7f6)' },
  { label: 'Night', value: 'linear-gradient(135deg,#1a1a2e,#16213e)' },
  { label: 'Rose', value: 'linear-gradient(135deg,#fce4ec,#f8bbd0)' },
  { label: 'Ocean', value: 'linear-gradient(135deg,#e0f7fa,#b2ebf2)' },
];

type LegacySentRequest = SentRequest & { to_user_id?: string };
type LegacyFriendRequest = FriendRequest & { fromUserId?: string; from_user_id?: string };

export default function ChatRoom({ chatId, userId, onBack }: {
  chatId: string;
  userId: string;
  onBack?: () => void;
}): ReactElement {
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();
  const { messages, sendMessage, subscribeMessages, markAsRead, deleteMessage, deleteForEveryone, addReaction, pinMessage, unpinMessage, sendPoll, votePoll, editMessage, sendContactCard, unlockChat, chats, createDirectChat, loadOlderMessages, hasMore } = useChatStore();
  const { pinnedMessages } = useMessagePin(chatId);
  const { saveMessage, unsaveMessage, isSaved } = useSavedMessages(currentUser?.id);
  const {
    friends, getFriendStatus, getUserById, sendRequest, cancelRequest, acceptRequest,
    rejectRequest, blockUser, unblockUser, reportUser, removeFriend, sentRequests, requests
  } = useFriendStore();
  const { typingUsers, sendTyping, stopTyping } = useTyping(chatId);
  const { filtered: visibleOnline } = useFilteredOnline(currentUser?.id || '', friends);
  const { queueMessage } = useOfflineQueue();
  const { isRecording, duration, startRecording, stopRecording, cancelRecording } = useVoiceRecorder();
  const { schedule, getPending } = useScheduledMessages(chatId, sendMessage);


  const [input, setInput] = useState('');
  const [editInput, setEditInput] = useState('');
  const [showAttachments, setShowAttachments] = useState(false);
  const [pendingSchedules, setPendingSchedules] = useState<ReturnType<typeof getPending>>([]);

  const [showTransfer, setShowTransfer] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{ msg: Message; x: number; y: number } | null>(null);
  const [selectedReactionMsg, setSelectedReactionMsg] = useState<string | null>(null);


  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [forwardBatch, setForwardBatch] = useState<Message[]>([]);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [isChatLocked, setIsChatLocked] = useState(false);
  const [lockPinInput, setLockPinInput] = useState('');
  const [lockError, setLockError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [friendStatus, setFriendStatus] = useState<string>('friends');
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [processingAction, setProcessingAction] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [showDeleteForEveryoneConfirm, setShowDeleteForEveryoneConfirm] = useState<string | null>(null);

  const msgs = useMemo(() => messages[chatId] ?? [], [messages, chatId]);

  // Scroll behavior — hook owns refs, auto-scroll, and scroll button visibility
  const { messagesEndRef, messagesContainerRef, showScrollBtn, scrollToBottom, shouldAutoScrollRef } = useChatScrollBehavior(msgs.length);

  // Unread separator tracking
  const initialLatestTimestampRef = useRef<number | null>(null);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  // Message selection mode
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Swipe to reply tracking
  const touchStartXRef = useRef<number>(0);
  const touchCurrentXRef = useRef<number>(0);

  // Translation cache & state
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());

  // Offline state
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Chat background theme
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [chatBg, setChatBg] = useState<string>(() => localStorage.getItem(`chat_bg_${chatId}`) || '');

  const otherUser = friends.find(f => f.id === userId);
  const [otherUserProfile, setOtherUserProfile] = useState<{ name: string; avatar: string; id: string } | null>(null);
  const isUserOnline = !!visibleOnline[userId];

  // Disappearing messages timer - must be after msgs is declared
  useDisappearingTimers(chatId, currentUser?.id, msgs);

  // Mark this chat as the active room for notification sound gating
  useEffect(() => {
    // Lazy import avoids any circular deps
     
    import('@/lib/activeChat').then(({ setActiveChatId }) => setActiveChatId(chatId));
    return () => {
      import('@/lib/activeChat').then(({ setActiveChatId }) => setActiveChatId(null));
    };
  }, [chatId]);


  // Fetch non-friend user profile for chat header
  useEffect(() => {
    if (!userId || !currentUser || otherUser) return;
    let cancelled = false;
    const load = async () => {
      try {
        if (!isFirestoreAvailable()) return;
        const data = await getDocById(COLLECTIONS.USERS, userId);
        if (data && !cancelled) {
          setOtherUserProfile({
            name: (data as { name?: string }).name || 'User',
            avatar: (data as { avatar?: string }).avatar || '',
            id: userId,
          });
        }
      } catch { /* ignore */ }
    };
    load();
    return () => { cancelled = true; };
  }, [userId, currentUser, otherUser]);

  const displayUser = useMemo(
    () => {
      const u = otherUser || otherUserProfile || { name: 'User', avatar: '', id: userId };
      return { name: u.name ?? 'User', avatar: u.avatar ?? '', id: u.id ?? userId };
    },
    [otherUser, otherUserProfile, userId]
  );

  const filteredMsgs = useMemo(
    () => searchQuery
      ? msgs.filter(m => (m.content || '').toLowerCase().includes(searchQuery.toLowerCase()))
      : msgs,
    [msgs, searchQuery]
  );

  const activeTypingUsers = useMemo(
    () => Object.keys(typingUsers).filter((id) => id !== currentUser?.id),
    [typingUsers, currentUser?.id]
  );

  const lastMessage = useMemo(
    () => msgs[msgs.length - 1] ?? null,
    [msgs]
  );

  const latestMessageTimestamp = useMemo(
    () => msgs.reduce((max, m) => {
      const ts = m.timestamp.getTime();
      return ts > max ? ts : max;
    }, 0),
    [msgs]
  );

  // Load friend status
  useEffect(() => {
    if (!currentUser?.id || !userId) return;
    if (currentUser.id === userId) {
      setFriendStatus('self');
      return;
    }

    const loadStatus = async () => {
      try {
        const status = await getFriendStatus(currentUser.id, userId);
        setFriendStatus(status);
      } catch { /* ignore */ }
    };
    loadStatus();
  }, [currentUser?.id, userId, getFriendStatus]);

  useEffect(() => {
    setEditingMessageId(null);
    setEditInput('');
    setReplyingTo(null);
    setHasNewMessages(false);
    initialLatestTimestampRef.current = null;
    shouldAutoScrollRef.current = true; // reset on chat switch
    setContextMenu(null);
    setSelectionMode(false);
    setSelectedMessages(new Set());
    const draft = localStorage.getItem(`chat_draft_${chatId}`);
    setInput(draft || '');
    setPendingSchedules(getPending());
  }, [chatId, getPending]);

  // Track initial latest message timestamp for unread separator
  useEffect(() => {
    if (latestMessageTimestamp > 0 && initialLatestTimestampRef.current === null) {
      initialLatestTimestampRef.current = latestMessageTimestamp;
    }
  }, [latestMessageTimestamp]);

  // Detect new messages arriving after initial load
  useEffect(() => {
    if (initialLatestTimestampRef.current === null || latestMessageTimestamp === 0) return;
    setHasNewMessages(latestMessageTimestamp > initialLatestTimestampRef.current);
  }, [latestMessageTimestamp]);



  // Refresh pending scheduled messages periodically (30s — hook already polls at 10s)
  useEffect(() => {
    setPendingSchedules(getPending());
    const interval = setInterval(() => {
      setPendingSchedules(getPending());
    }, 30000);
    return () => clearInterval(interval);
  }, [chatId, getPending]);

  useEffect(() => {
    const unsub = subscribeMessages(chatId);
    if (currentUser?.id) markAsRead(chatId, currentUser.id);
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [chatId, currentUser?.id, subscribeMessages, markAsRead]);

  // Debounced live markAsRead — keep read receipts fresh as new messages
  // arrive while the room is open without hammering the DB on every event.
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!lastMessage || !currentUser?.id) return;
    if (lastMessage.senderId === currentUser.id) return;
    if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
    markReadTimerRef.current = setTimeout(() => {
      markAsRead(chatId, currentUser?.id);
    }, 1500);
    return () => { if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current); };
  }, [lastMessage, chatId, currentUser?.id, markAsRead]);


  // Push notification for new messages when app is not focused
  useEffect(() => {
    if (!lastMessage || !currentUser?.id) return;
    if (lastMessage.senderId === currentUser.id) return;
    if (typeof document !== 'undefined' && !document.hidden) return;
    const msgAge = Date.now() - lastMessage.timestamp.getTime();
    if (msgAge > 5000) return;

    pushNotificationService.showMessageNotification(
      displayUser?.name || 'New Message',
      lastMessage.type === 'text' ? lastMessage.content : `Sent a ${lastMessage.type}`,
      chatId,
      lastMessage.senderId
    );
}, [lastMessage, chatId, currentUser?.id, displayUser?.name]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    const chat = chats.find(c => c.id === chatId);
    setIsChatLocked(!!chat?.chatLocked);
  }, [chatId, chats]);
  
  const handleUnlock = useCallback(async () => {
    setUnlocking(true);
    try {
      const chat = chats.find((c) => c.id === chatId);
      const storedPin = chat?.lockValue;
      const pin = lockPinInput || '';
      if (!chat || !storedPin) {
        setLockError('No PIN is configured for this chat.');
        setUnlocking(false);
        return;
      }

      // If storedPin looks like a SHA-256 hex (64 chars), hash the input and compare.
      let match = false;
      if (storedPin.length === 64) {
        try {
          const encoder = new TextEncoder();
          const data = encoder.encode(pin);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
          // constant-time comparison
          if (hex.length === storedPin.length) {
            match = true;
            for (let i = 0; i < hex.length; i++) {
              if (hex.charCodeAt(i) !== storedPin.charCodeAt(i)) { match = false; }
            }
          }
        } catch {
          match = false;
        }
      } else {
        // plaintext comparison (constant-time style)
        match = pin.length === storedPin.length;
        if (match) {
          for (let i = 0; i < pin.length; i++) {
            if (pin.charCodeAt(i) !== storedPin.charCodeAt(i)) { match = false; }
          }
        }
      }

      if (!match) {
        setLockError('Incorrect PIN. Please try again.');
        setUnlocking(false);
        return;
      }

      await unlockChat(chatId);
      setIsChatLocked(false);
      setLockPinInput('');
      toast.success('Chat unlocked');
    } catch {
      setLockError('Failed to unlock. Please try again.');
    } finally {
      setUnlocking(false);
    }
  }, [chatId, chats, lockPinInput, unlockChat]);

  // Stop typing when input is cleared or on unmount
  useEffect(() => {
    if (!input.trim()) stopTyping();
    return () => { stopTyping(); };
  }, [input, stopTyping]);

  // Fetch last seen — resets properly when userId or online status changes
  useEffect(() => {
    setLastSeen(null);
    if (!userId || isUserOnline) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await getUserById(userId);
        if (cancelled || !data) return;
        const ls = data.lastSeen;
        if (ls) {
          const ts = ls instanceof Date ? ls.getTime() : new Date(ls).getTime();
          const diff = Date.now() - ts;
          if (diff < 60000) setLastSeen('just now');
          else if (diff < 3600000) setLastSeen(`${Math.floor(diff / 60000)}m ago`);
          else if (diff < 86400000) setLastSeen(`${Math.floor(diff / 3600000)}h ago`);
          else setLastSeen(`${Math.floor(diff / 86400000)}d ago`);
        }
      } catch { /* ignore */ }
    };
    load();
    const interval = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [userId, isUserOnline, getUserById]);

  // Debounce draft saves
  const draftInputRef = useRef(input);
  draftInputRef.current = input;
  const chatIdRef = useRef(chatId);
  chatIdRef.current = chatId;
  useEffect(() => {
    const timer = setTimeout(() => {
      const val = draftInputRef.current;
      const id = chatIdRef.current;
      if (val.trim()) {
        localStorage.setItem(`chat_draft_${id}`, val);
      } else {
        localStorage.removeItem(`chat_draft_${id}`);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [input, chatId]);

  // Cleanup long-press timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  // Offline detection
  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Persist chat background
  useEffect(() => {
    if (chatBg) localStorage.setItem(`chat_bg_${chatId}`, chatBg);
    else localStorage.removeItem(`chat_bg_${chatId}`);
  }, [chatBg, chatId]);

  // Load chat bg when chatId changes
  useEffect(() => {
    setChatBg(localStorage.getItem(`chat_bg_${chatId}`) || '');
  }, [chatId]);

  const handleEditStart = useCallback((msg: Message) => {
    setEditingMessageId(msg.id);
    setEditInput(msg.content);
    setContextMenu(null);
  }, []);

  const handleEditCancel = useCallback(() => {
    setEditingMessageId(null);
    setEditInput('');
  }, []);

  const handleEditSave = useCallback(async (msgId: string) => {
    if (!editInput.trim() || !currentUser) return;
    try {
      await editMessage(chatId, msgId, editInput.trim());
      setEditingMessageId(null);
      setEditInput('');
    } catch {
      toast.error('Failed to edit message');
    }
  }, [chatId, currentUser, editMessage, editInput]);

  const handleTranslate = useCallback(async (msg: Message) => {
    if (translations[msg.id]) return; // already translated
    const cacheKey = `translate_${msg.id}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      setTranslations(prev => ({ ...prev, [msg.id]: cached }));
      setContextMenu(null);
      return;
    }
    setTranslatingIds(prev => new Set(prev).add(msg.id));
    setContextMenu(null);
    try {
      const safeContent = msg.content.slice(0, 500);
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(safeContent)}&langpair=autodetect|en`);
      const data = await res.json();
      const translated = data?.responseData?.translatedText || msg.content;
      setTranslations(prev => ({ ...prev, [msg.id]: translated }));
      localStorage.setItem(cacheKey, translated);
    } catch {
      toast.error('Translation failed');
    } finally {
      setTranslatingIds(prev => { const s = new Set(prev); s.delete(msg.id); return s; });
    }
  }, [translations]);

  const handleRetry = useCallback(async (msg: Message) => {
    if (!currentUser) return;
    // Remove the failed optimistic message before resending to avoid duplicates
    useChatStore.setState((s) => ({
      messages: { ...s.messages, [chatId]: (s.messages[chatId] ?? []).filter((m) => m.id !== msg.id) },
    }));
    try {
      await sendMessage(chatId, currentUser.id, msg.content, msg.type, msg.mediaUrl, msg.replyTo);
      toast.success('Message resent');
    } catch {
      toast.error('Retry failed');
    }
  }, [chatId, currentUser, sendMessage]);

  const loadingOlderRef = useRef(false);
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);

  const handleSend = useCallback(async () => {
    if (!currentUser) return;
    if (editingMessageId) {
      await handleEditSave(editingMessageId);
      return;
    }

    if (!input.trim()) return;
    stopTyping();
    if (!isOnline()) {
      queueMessage({ type: 'direct', chatId, senderId: currentUser.id, content: input.trim(), replyTo: replyingTo?.id });
      setInput('');
      setShowAttachments(false);
      setReplyingTo(null);
      setEditingMessageId(null);
      return;
    }
    try {
      await sendMessage(chatId, currentUser.id, input.trim(), 'text', undefined, replyingTo?.id);
      setInput('');
      setShowAttachments(false);
      setReplyingTo(null);
    } catch {
      toast.error('Failed to send message');
    }
  }, [chatId, currentUser, editingMessageId, input, replyingTo?.id, stopTyping, queueMessage, sendMessage, handleEditSave]);

  const handleMediaUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 25MB.');
      return;
    }
    try {
      const { uploadMediaBlob } = await import('@/lib/storage');
      const url = await uploadMediaBlob({ kind: 'chats', chatId, file, mimeType: file.type });
      const mediaType = type === 'image' ? 'image' : 'video';
      await sendMessage(chatId, currentUser.id, mediaType === 'image' ? '\u{1F4F7} Photo' : '\u{1F4F9} Video', mediaType, url);
    } catch {
      toast.error('Failed to upload media. Please try again.');
    }
  }, [chatId, currentUser, sendMessage]);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Message copied');
    setContextMenu(null);
  }, []);

  const handleDelete = useCallback(async (msgId: string) => {
    try {
      await deleteMessage(chatId, msgId);
      toast.success('Message deleted');
    } catch {
      toast.error('Failed to delete message');
    }
    setContextMenu(null);
  }, [chatId, deleteMessage]);

  const handleDeleteForEveryone = useCallback(async (msgId: string) => {
    try {
      await deleteForEveryone(chatId, msgId);
      toast.success('Message deleted for everyone');
    } catch {
      toast.error('Failed to delete message');
    }
    setContextMenu(null);
  }, [chatId, deleteForEveryone]);

  const handlePin = useCallback(async (msg: Message) => {
    if (!currentUser?.id) return;
    try {
      await pinMessage(chatId, msg.id, msg.content);
      toast.success('Message pinned');
    } catch {
      toast.error('Failed to pin message');
    }
    setContextMenu(null);
  }, [chatId, currentUser?.id, pinMessage]);

  const handleUnpin = useCallback(async (msgId: string) => {
    if (!currentUser?.id) return;
    try {
      await unpinMessage(chatId, msgId);
      toast.success('Message unpinned');
    } catch {
      toast.error('Failed to unpin message');
    }
    setContextMenu(null);
  }, [chatId, currentUser?.id, unpinMessage]);

  const handleSave = useCallback((msg: Message) => {
    const sender = friends.find((f) => f.id === msg.senderId) || (msg.senderId === currentUser?.id ? currentUser : null);
    saveMessage(msg, sender?.name || 'Unknown');
    toast.success('Message saved');
    setContextMenu(null);
  }, [friends, currentUser, saveMessage]);

  const handleUnsave = useCallback((msgId: string) => {
    unsaveMessage(msgId);
    toast.success('Message unsaved');
    setContextMenu(null);
  }, [unsaveMessage]);

  const handleReact = useCallback(async (msgId: string, reaction: string) => {
    if (!currentUser?.id) return;
    try {
      await addReaction(chatId, msgId, reaction, currentUser.id);
    } catch {
      toast.error('Failed to add reaction');
    }
    setSelectedReactionMsg(null);
    setContextMenu(null);
  }, [chatId, currentUser, addReaction]);

  // ─── Swipe to Reply ─────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (selectionMode) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchCurrentXRef.current = e.touches[0].clientX;
  }, [selectionMode]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (selectionMode) return;
    touchCurrentXRef.current = e.touches[0].clientX;
  }, [selectionMode]);

  const handleTouchEnd = useCallback((msg: Message) => {
    if (selectionMode) return;
    const diff = touchStartXRef.current - touchCurrentXRef.current;
    if (diff > SWIPE_THRESHOLD && msg.type !== 'deleted') {
      setReplyingTo(msg);
    }
  }, [selectionMode]);

  // ─── Message Selection Mode ─────────────────────
  const handleMessageLongPress = useCallback((msg: Message) => {
    if (msg.type === 'deleted') return;
    setSelectionMode(true);
    setSelectedMessages(new Set([msg.id]));
  }, []);

  const toggleMessageSelection = useCallback((msgId: string) => {
    setSelectedMessages(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedMessages(new Set());
  }, []);

  const handleDeleteSelected = useCallback(async () => {
    if (!currentUser?.id) return;
    for (const msgId of selectedMessages) {
      try {
        await deleteMessage(chatId, msgId);
      } catch { /* ignore */ }
    }
    toast.success(`${selectedMessages.size} message${selectedMessages.size > 1 ? 's' : ''} deleted`);
    exitSelectionMode();
  }, [chatId, currentUser?.id, deleteMessage, selectedMessages, exitSelectionMode]);

  const handleForwardSelected = useCallback(() => {
    if (selectedMessages.size >= 1) {
      const selectedMsgs = msgs.filter(m => selectedMessages.has(m.id));
      if (selectedMsgs.length === 1) {
        setForwardMsg(selectedMsgs[0]);
        setForwardBatch([]);
      } else {
        setForwardMsg(selectedMsgs[0]);
        setForwardBatch(selectedMsgs);
      }
      setShowForwardModal(true);
    }
    exitSelectionMode();
  }, [msgs, selectedMessages, exitSelectionMode]);

  const handleCopySelected = useCallback(() => {
    const selectedMsgs = msgs.filter(m => selectedMessages.has(m.id));
    const text = selectedMsgs.map(m => m.content).join('\n');
    navigator.clipboard.writeText(text);
    toast.success('Messages copied');
    exitSelectionMode();
  }, [msgs, selectedMessages, exitSelectionMode]);

  const handleContextMenu = useCallback((e: React.MouseEvent, msg: Message) => {
    e.preventDefault();
    if (selectionMode) {
      toggleMessageSelection(msg.id);
      return;
    }
    setContextMenu({ msg, x: e.clientX, y: e.clientY });
  }, [selectionMode, toggleMessageSelection]);

  const handleVoiceSend = useCallback(async () => {
    if (!currentUser) return;
    const blob = await stopRecording();
    if (!blob) return;
    try {
      const { uploadMediaBlob } = await import('@/lib/storage');
      // storage adapter accepts Blob | File; avoid unsafe File casting
      const url = await uploadMediaBlob({ kind: 'voice', chatId, file: blob, mimeType: blob.type || 'audio/webm' });
      await sendMessage(chatId, currentUser.id, '\u{1F3A4} Voice message', 'voice', url);
    } catch {
      toast.error('Failed to send voice message');
    }
  }, [chatId, currentUser, stopRecording, sendMessage]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 25MB.');
      return;
    }
    try {
      const { uploadMediaBlob } = await import('@/lib/storage');
      const url = await uploadMediaBlob({ kind: 'chats', chatId, file, mimeType: file.type });
      await sendMessage(chatId, currentUser.id, `\u{1F4C1} ${file.name}`, 'file', url);
    } catch {
      toast.error('Failed to upload file. Please try again.');
    }
  }, [chatId, currentUser, sendMessage]);

  const handleContactShare = useCallback(async () => {
    if (!currentUser) return;
    await sendContactCard(chatId, currentUser.id, {
      userId: currentUser.id,
      name: currentUser.name || 'User',
      phone: currentUser.phone,
      email: currentUser.email,
      avatar: currentUser.avatar,
      username: currentUser.username,
      bio: currentUser.bio,
    });
    toast.success('Contact shared');
    setShowAttachments(false);
  }, [chatId, currentUser, sendContactCard]);

  const handleLocationShare = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (!currentUser) return;
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const url = `https://www.google.com/maps?q=${lat},${lng}`;
        await sendMessage(chatId, currentUser.id, `\u{1F4CD} Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, 'location', url);
        toast.success('Location shared');
      },
      () => {
        toast.error('Location access denied');
      }
    );
  }, [chatId, currentUser, sendMessage]);

  const handleForward = useCallback(async (targetChatId: string) => {
    if (!currentUser) return;
    const msgsToForward = forwardBatch.length > 1 ? forwardBatch : forwardMsg ? [forwardMsg] : [];
    if (msgsToForward.length === 0) return;
    try {
      if (targetChatId.startsWith('dm_')) {
        const parts = targetChatId.split('_');
        const otherId = parts.find((p) => p !== currentUser.id && p !== 'dm');
        if (otherId) await createDirectChat(otherId, currentUser.id);
      }
      for (const m of msgsToForward) {
        await sendMessage(targetChatId, currentUser.id, m.content, m.type, m.mediaUrl);
      }
      toast.success(msgsToForward.length > 1 ? `${msgsToForward.length} messages forwarded` : 'Message forwarded');
      setShowForwardModal(false);
      setForwardMsg(null);
      setForwardBatch([]);
    } catch {
      toast.error('Failed to forward message');
    }
  }, [currentUser, forwardBatch, forwardMsg, sendMessage, createDirectChat]);

  const handleScheduleSend = useCallback(async () => {
    if (!input.trim() || !currentUser || !scheduleDate) return;
    const scheduledTime = new Date(scheduleDate).getTime();
    if (Number.isNaN(scheduledTime)) {
      toast.error('Invalid date selected');
      return;
    }
    const now = Date.now();
    const delay = scheduledTime - now;
    if (delay <= 0) {
      toast.error('Please select a future time');
      return;
    }
    try {
      // Persist to localStorage so message survives refresh
      schedule({
        senderId: currentUser.id,
        content: input.trim(),
        type: 'text',
        mediaUrl: undefined,
        replyTo: replyingTo?.id,
        scheduledAt: scheduledTime,
      });
      toast.success(`Message scheduled for ${new Date(scheduleDate).toLocaleString()}`);
    } catch {
      toast.error('Failed to schedule message');
    }
    setShowSchedulePicker(false);
    setScheduleDate('');
    setPendingSchedules(getPending());
  }, [input, currentUser, scheduleDate, replyingTo?.id, schedule, getPending]);

  // Pre-compute date separators to avoid mutation during render
  const dateSeparatorMap = useMemo(() => {
    const map = new Map<string, boolean>();
    let last: string | null = null;
    filteredMsgs.forEach((msg) => {
      const msgDate = formatDateSeparator(msg.timestamp);
      map.set(msg.id, msgDate !== last);
      last = msgDate;
    });
    return map;
  }, [filteredMsgs]);

  const findSentRequest = useCallback((toUserId: string) => {
    return sentRequests.find((r) => {
      const record = r as LegacySentRequest;
      return record.toUserId === toUserId || record.to_user_id === toUserId;
    });
  }, [sentRequests]);

  const findReceivedRequest = useCallback((fromUserId: string) => {
    return requests.find((r) => {
      const record = r as LegacyFriendRequest;
      return record.from === fromUserId || record.fromUserId === fromUserId || record.from_user_id === fromUserId;
    });
  }, [requests]);

  const handleAddFriend = useCallback(async () => {
    if (!currentUser?.id || !userId) return;
    setProcessingAction(true);
    try {
      await sendRequest(userId, currentUser.id);
      toast.success('Friend request sent');
      setFriendStatus('request_sent');
    } catch {
      toast.error('Failed to send friend request');
    } finally {
      setProcessingAction(false);
    }
  }, [currentUser?.id, userId, sendRequest]);

  const handleCancelRequest = useCallback(async () => {
    if (!currentUser?.id || !userId) return;
    const req = findSentRequest(userId);
    if (!req) return;
    setProcessingAction(true);
    try {
      await cancelRequest(req.id);
      toast.success('Friend request cancelled');
      setFriendStatus('not_friends');
    } catch {
      toast.error('Failed to cancel request');
    } finally {
      setProcessingAction(false);
    }
  }, [cancelRequest, currentUser?.id, findSentRequest, userId]);

  const handleAcceptRequest = useCallback(async () => {
    if (!currentUser?.id || !userId) return;
    const req = findReceivedRequest(userId);
    if (!req) return;
    setProcessingAction(true);
    try {
      await acceptRequest(req.id);
      toast.success('Friend request accepted');
      setFriendStatus('friends');
    } catch {
      toast.error('Failed to accept request');
    } finally {
      setProcessingAction(false);
    }
  }, [acceptRequest, currentUser?.id, findReceivedRequest, userId]);

  const handleRejectRequest = useCallback(async () => {
    if (!currentUser?.id || !userId) return;
    const req = findReceivedRequest(userId);
    if (!req) return;
    setProcessingAction(true);
    try {
      await rejectRequest(req.id);
      toast.success('Friend request declined');
      setFriendStatus('not_friends');
    } catch {
      toast.error('Failed to decline request');
    } finally {
      setProcessingAction(false);
    }
  }, [currentUser?.id, rejectRequest, findReceivedRequest, userId]);

  const handleBlockUser = useCallback(async () => {
    if (!currentUser?.id || !userId) return;
    setProcessingAction(true);
    try {
      await blockUser(userId, currentUser.id);
      toast.success('User blocked');
      setFriendStatus('blocked');
    } catch {
      toast.error('Failed to block user');
    } finally {
      setProcessingAction(false);
    }
  }, [currentUser?.id, userId, blockUser]);

  const handleUnblockUser = useCallback(async () => {
    if (!currentUser?.id || !userId) return;
    setProcessingAction(true);
    try {
      await unblockUser(userId, currentUser.id);
      toast.success('User unblocked');
      setFriendStatus('not_friends');
    } catch {
      toast.error('Failed to unblock user');
    } finally {
      setProcessingAction(false);
    }
  }, [currentUser?.id, userId, unblockUser]);

  const handleRemoveFriend = useCallback(async () => {
    if (!currentUser?.id || !userId) return;
    setProcessingAction(true);
    try {
      await removeFriend(userId, currentUser.id);
      toast.success('Friend removed');
      setFriendStatus('not_friends');
    } catch {
      toast.error('Failed to remove friend');
    } finally {
      setProcessingAction(false);
    }
  }, [currentUser?.id, userId, removeFriend]);

  const handleMouseDown = useCallback((msg: Message) => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => handleMessageLongPress(msg), 600);
  }, [handleMessageLongPress]);

  const handleMouseUp = useCallback(() => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  }, []);

  const handleMsgClick = useCallback((msg: Message) => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    if (selectionMode) toggleMessageSelection(msg.id);
  }, [selectionMode, toggleMessageSelection]);

  const handleDoubleClick = useCallback((msg: Message) => {
    setReplyingTo(msg);
  }, []);

  const handleSetLightbox = useCallback((url: string) => setLightboxImage(url), []);
  const handleNavigate = useCallback((path: string) => navigate(path), [navigate]);
  const handleVotePoll = useCallback((cId: string, msgId: string, idx: number, uId: string) => votePoll(cId, msgId, idx, uId), [votePoll]);
  const handleSetReactionMsg = useCallback((id: string | null) => setSelectedReactionMsg(id), []);
  const handleEditInputChange = useCallback((v: string) => setEditInput(v), []);
  const handleSetReplyingTo = useCallback((msg: Message) => setReplyingTo(msg), []);

  const toggleSearch = useCallback(() => {
    if (showSearch) setSearchQuery('');
    setShowSearch((prev) => !prev);
  }, [showSearch]);

  const insertEmoji = useCallback((emoji: string) => {
    setInput(prev => prev + emoji);
  }, []);

  const handleReportSubmit = useCallback(async () => {
    if (!currentUser?.id || !userId || !reportReason) return;
    setProcessingAction(true);
    try {
      await reportUser({ reporterId: currentUser.id, reportedId: userId, reason: reportReason, details: reportDetails });
      toast.success('Report submitted');
      setShowReportModal(false);
      setReportReason('');
      setReportDetails('');
    } catch {
      toast.error('Failed to submit report');
    } finally {
      setProcessingAction(false);
    }
  }, [currentUser?.id, userId, reportReason, reportDetails, reportUser]);

  const friendBanner = useMemo(() => {
    if (friendStatus === 'friends' || friendStatus === 'self') return null;
    switch (friendStatus) {
      case 'not_friends':
        return (
          <div className="shrink-0 bg-[#FFF3E0] border-b border-[#FF9800]/20 px-4 py-2.5 flex items-center justify-between gap-3">
            <p className="text-[#111111] text-sm flex-1">You are not friends yet. Send a friend request to unlock all features.</p>
            <button type="button" onClick={handleAddFriend} disabled={processingAction} className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-[#00C300] rounded-full text-xs font-medium text-white active:bg-[#00A300] transition-colors disabled:opacity-50">
              <UserPlus size={12} /> Add Friend
            </button>
          </div>
        );
      case 'request_sent':
        return (
          <div className="shrink-0 bg-[#FFF3E0] border-b border-[#FF9800]/20 px-4 py-2.5 flex items-center justify-between gap-3">
            <p className="text-[#111111] text-sm flex-1">Friend request sent.</p>
            <button type="button" onClick={handleCancelRequest} disabled={processingAction} className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-[#FF9800] rounded-full text-xs font-medium text-white active:bg-[#F57C00] transition-colors disabled:opacity-50">
              <X size={12} /> Cancel Request
            </button>
          </div>
        );
      case 'request_received':
        return (
          <div className="shrink-0 bg-[#E8F5E9] border-b border-[#00C300]/20 px-4 py-2.5 flex items-center justify-between gap-3">
            <p className="text-[#111111] text-sm flex-1">{displayUser?.name || 'User'} wants to be friends.</p>
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={handleAcceptRequest} disabled={processingAction} className="flex items-center gap-1 px-3 py-1.5 bg-[#00C300] rounded-full text-xs font-medium text-white active:bg-[#00A300] transition-colors disabled:opacity-50">
                <Check size={12} /> Accept
              </button>
              <button type="button" onClick={handleRejectRequest} disabled={processingAction} className="flex items-center gap-1 px-3 py-1.5 bg-[#FF3B30] rounded-full text-xs font-medium text-white active:bg-[#D32F2F] transition-colors disabled:opacity-50">
                <X size={12} /> Decline
              </button>
            </div>
          </div>
        );
      case 'blocked':
        return (
          <div className="shrink-0 bg-[#FFEBEE] border-b border-[#FF3B30]/20 px-4 py-2.5 flex items-center justify-between gap-3">
            <p className="text-[#111111] text-sm flex-1">You have blocked this user.</p>
            <button type="button" onClick={handleUnblockUser} disabled={processingAction} className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-[#00C300] rounded-full text-xs font-medium text-white active:bg-[#00A300] transition-colors disabled:opacity-50">
              <Check size={12} /> Unblock
            </button>
          </div>
        );
      default:
        return null;
    }
  }, [friendStatus, displayUser?.name, processingAction, handleAddFriend, handleCancelRequest, handleAcceptRequest, handleRejectRequest, handleUnblockUser]);

  return (
    <div className="flex flex-col h-full bg-[#F0F2F5] relative">
      {/* Chat Lock Overlay */}
      <AnimatePresence>
        {isChatLocked && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center p-6"
          >
            <div className="w-16 h-16 rounded-full bg-[#F5F5F5] flex items-center justify-center mb-4">
              <Lock size={32} className="text-[#8D8D8D]" />
            </div>
            <h3 className="text-lg font-bold text-[#111111] mb-1">This Chat is Locked</h3>
            <p className="text-[#8D8D8D] text-sm text-center mb-6">Enter your PIN to unlock this conversation</p>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={lockPinInput}
              onChange={(e) => { setLockPinInput(e.target.value.replace(/\D/g, '').slice(0, 4)); setLockError(''); }}
              aria-label="Enter 4 digit PIN"
              placeholder="Enter 4-digit PIN"
              className="w-full max-w-[200px] bg-[#F5F5F5] rounded-xl px-4 py-3 text-center text-lg font-bold tracking-[0.5em] text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#8D8D8D] placeholder:tracking-normal placeholder:text-sm mb-2"
            />
            {lockError && <p className="text-[#FF3B30] text-xs mb-3">{lockError}</p>}
            <div className="flex gap-2 w-full max-w-[200px]">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="flex-1 py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleUnlock}
                disabled={unlocking || lockPinInput.length !== 4}
                className="flex-1 py-3 bg-[#00C300] text-white rounded-xl text-sm font-bold disabled:opacity-50"
              >
                {unlocking ? 'Unlocking...' : 'Unlock'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <AnimatePresence mode="wait">
        <ChatHeader
          key={selectionMode ? 'selection' : 'normal'}
          displayUser={displayUser}
          userId={userId}
          isUserOnline={isUserOnline}
          lastSeen={lastSeen}
          activeTypingUsers={activeTypingUsers}
          showSearch={showSearch}
          selectionMode={selectionMode}
          selectedCount={selectedMessages.size}
          friendStatus={friendStatus}
          processingAction={processingAction}
          onBack={onBack || (() => navigate(-1))}
          onToggleSearch={toggleSearch}
          onToggleBgPicker={() => setShowBgPicker(true)}
          onToggleTransfer={() => setShowTransfer(true)}
          onVoiceCall={() => navigate('/call', { state: { userId, mode: 'voice' } })}
          onVideoCall={() => navigate('/call', { state: { userId, mode: 'video' } })}
          onViewProfile={() => navigate(`/profile/${userId}`)}
          onChatInfo={() => navigate(`/chat-info/${chatId}`)}
          onRemoveFriend={handleRemoveFriend}
          onBlockUser={handleBlockUser}
          onUnblockUser={handleUnblockUser}
          onReport={() => setShowReportModal(true)}
          onCopySelected={handleCopySelected}
          onForwardSelected={handleForwardSelected}
          onDeleteSelected={handleDeleteSelected}
          onExitSelection={exitSelectionMode}
        />
      </AnimatePresence>

      {/* Search Bar */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 bg-white border-b border-[#EBEBEB] overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 py-2">
              <Search size={16} className="text-[#8D8D8D]" />
              <input
                autoFocus
                aria-label="Search messages"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search messages..."
                className="flex-1 bg-[#F5F5F5] rounded-xl px-3 py-2 text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#8D8D8D]"
              />
              <button type="button" onClick={() => { setShowSearch(false); setSearchQuery(''); }} className="text-[#8D8D8D]" aria-label="Clear search">
                <X size={18} />
              </button>
            </div>
            {searchQuery && (
              <p className="px-4 pb-2 text-[#8D8D8D] text-xs">
                {filteredMsgs.length} result{filteredMsgs.length !== 1 ? 's' : ''}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Friend Action Banner */}
      <AnimatePresence>
        {friendBanner && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 overflow-hidden"
          >
            {friendBanner}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pinned Messages Banner */}
      <AnimatePresence>
        {pinnedMessages.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 bg-[#FFD700]/10 border-b border-[#FFD700]/30 px-4 py-2"
          >
            <div className="flex items-center gap-2">
              <Pin size={14} className="text-[#FFD700]" />
              <p className="text-[#111111] text-xs font-medium">Pinned Message</p>
            </div>
            <p className="text-[#111111] text-sm truncate mt-0.5">{pinnedMessages[0].content}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Offline Banner */}
      <AnimatePresence>
        {isOffline && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 bg-[#FF3B30] px-4 py-2 flex items-center gap-2"
          >
            <WifiOff size={14} className="text-white shrink-0" />
            <p className="text-white text-xs font-medium">You're offline · Messages will be queued</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="relative flex-1 overflow-y-auto p-4 scrollbar-hide scroll-smooth"
        style={chatBg ? { background: chatBg } : undefined}
      >
        <div className="space-y-2">
          {/* Empty State */}
          {filteredMsgs.length === 0 && !showSearch && (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] py-12">
              <div className="w-20 h-20 rounded-full bg-[#E8F5E9] flex items-center justify-center mb-4">
                <MessageCircle size={36} className="text-[#00C300]" />
              </div>
              <p className="text-[#111111] font-semibold text-base mb-1">No messages yet</p>
              <p className="text-[#8D8D8D] text-sm text-center mb-4 max-w-[200px]">
                {friendStatus === 'friends' 
                  ? `Send a message to start chatting with ${displayUser?.name || 'this user'}`
                  : 'Send a friend request to start chatting'}
              </p>
              {friendStatus === 'friends' && (
                <button
                  type="button"
                  className="px-5 py-2.5 bg-[#00C300] text-white rounded-full text-sm font-medium active:bg-[#00A300] transition-colors"
                >
                  Start Chatting
                </button>
              )}
            </div>
          )}

          {filteredMsgs.length > 0 && (
            <Virtuoso
              ref={virtuosoRef}
              data={filteredMsgs}
              initialTopMostItemIndex={Math.max(0, filteredMsgs.length - 1)}
              itemContent={(index, msg) => {
                  const isMe = msg.senderId === currentUser?.id;
                  const prevMsg = index > 0 ? filteredMsgs[index - 1] : null;
                  const isSameSender = prevMsg && prevMsg.senderId === msg.senderId;
                  const showAvatar = !isMe && !isSameSender;
                  const msgDate = formatDateSeparator(msg.timestamp);
                  const showDate = dateSeparatorMap.get(msg.id) || false;
                  const isNew = initialLatestTimestampRef.current !== null &&
                    msg.timestamp.getTime() > initialLatestTimestampRef.current;
                  const prevIsNew = prevMsg && initialLatestTimestampRef.current !== null &&
                    prevMsg.timestamp.getTime() > initialLatestTimestampRef.current;
                  const showUnreadSeparator = isNew && !prevIsNew && index > 0 && hasNewMessages;
                  const isSelected = selectedMessages.has(msg.id);
                  const isSearchMatch = searchQuery
                    ? msg.content.toLowerCase().includes(searchQuery.toLowerCase())
                    : false;

                  return (
                    <div key={msg.id}>
                      <MessageItem
                        msg={msg}
                        isMe={isMe}
                        showAvatar={showAvatar}
                        showDate={showDate}
                        msgDate={msgDate}
                        showUnreadSeparator={showUnreadSeparator}
                        isSelected={isSelected}
                        isSearchMatch={isSearchMatch}
                        editingMessageId={editingMessageId}
                        editInput={editInput}
                        selectionMode={selectionMode}
                        selectedReactionMsg={selectedReactionMsg}
                        displayUser={displayUser}
                        userId={userId}
                        currentUserId={currentUser?.id || ''}
                        msgs={msgs}
                        translatedText={translations[msg.id]}
                        isTranslating={translatingIds.has(msg.id)}
                        onContextMenu={handleContextMenu}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={() => handleTouchEnd(msg)}
                        onMouseDown={() => handleMouseDown(msg)}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        onClick={() => handleMsgClick(msg)}
                        onDoubleClick={() => handleDoubleClick(msg)}
                        onReact={handleReact}
                        onSetReactionMsg={handleSetReactionMsg}
                        onEditInputChange={handleEditInputChange}
                        onEditSave={() => handleEditSave(msg.id)}
                        onEditCancel={handleEditCancel}
                        onSetReplyingTo={handleSetReplyingTo}
                        onSetLightbox={handleSetLightbox}
                        onVotePoll={handleVotePoll}
                        onNavigate={handleNavigate}
                        onRetry={() => handleRetry(msg)}
                        chatId={chatId}
                      />
                    </div>
                  );
                }}
                startReached={async () => {
                  if (hasMore[chatId] && !loadingOlderRef.current) {
                    loadingOlderRef.current = true;
                    try { await loadOlderMessages(chatId); } catch { /* ignore */ }
                    loadingOlderRef.current = false;
                  }
                }}
                rangeChanged={(range) => {
                  const atBottom = range.endIndex >= filteredMsgs.length - 1;
                  shouldAutoScrollRef.current = atBottom;
                }}
                followOutput={shouldAutoScrollRef.current ? 'smooth' : false}
                style={{ height: '100%', minHeight: '200px' }}
              />
          )}
          
          {/* Typing indicator */}
          {activeTypingUsers.length > 0 && (
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[#8D8D8D]">
                    {activeTypingUsers.slice(0, 2).join(', ')}{activeTypingUsers.length > 2 ? ` +${activeTypingUsers.length - 2}` : ''}
                  </span>
                  <div className="flex gap-1 items-center">
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        className="w-1.5 h-1.5 bg-[#ADADAD] rounded-full animate-bounce"
                        style={{ animationDelay: `${delay}ms`, animationDuration: '1s' }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Scroll to bottom button */}
        <AnimatePresence>
          {showScrollBtn && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 8 }}
              onClick={scrollToBottom}
              className="absolute bottom-4 right-4 w-10 h-10 bg-white rounded-full shadow-lg border border-[#EBEBEB] flex items-center justify-center text-[#8D8D8D] hover:text-[#111111] z-20 transition-colors tap-scale"
              title="Scroll to bottom"
              aria-label="Scroll to bottom"
            >
              <ChevronDown size={20} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Pending Scheduled Messages Indicator */}
      {pendingSchedules.length > 0 && (
        <div className="shrink-0 bg-[#8B5CF6]/10 px-3 py-1.5 flex items-center justify-between z-20">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-[#8B5CF6]" />
            <span className="text-xs text-[#8B5CF6] font-medium">
              {pendingSchedules.length} scheduled message{pendingSchedules.length > 1 ? 's' : ''}
            </span>
          </div>
          <button type="button" onClick={() => setPendingSchedules(getPending())}
            className="text-xs text-[#8B5CF6] hover:text-[#7C3AED] font-medium"
          >
            View
          </button>
        </div>
      )}

      <InputBar
        input={input}
        replyingTo={replyingTo}
        showAttachments={showAttachments}
        showEmojiPicker={showEmojiPicker}
        isRecording={isRecording}
        duration={duration}
        onInputChange={setInput}
        onSend={handleSend}
        onTyping={sendTyping}
        onStopTyping={stopTyping}
        onToggleAttachments={() => setShowAttachments(prev => !prev)}
        onToggleEmojiPicker={() => setShowEmojiPicker(prev => !prev)}
        onEmojiSelect={insertEmoji}
        onCancelReply={() => setReplyingTo(null)}
        onStartRecording={() => { startRecording(); setShowAttachments(false); }}
        onCancelRecording={cancelRecording}
        onVoiceSend={handleVoiceSend}
        onSchedule={() => setShowSchedulePicker(true)}
        onPhotoUpload={(e) => { handleMediaUpload(e, 'image'); setShowAttachments(false); }}
        onVideoUpload={(e) => { handleMediaUpload(e, 'video'); setShowAttachments(false); }}
        onFileUpload={(e) => { handleFileUpload(e); setShowAttachments(false); }}
        onLocationShare={() => { handleLocationShare(); setShowAttachments(false); }}
        onContactShare={handleContactShare}
        onPollOpen={() => { setShowPollModal(true); setShowAttachments(false); }}
      />

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed bg-white rounded-xl shadow-xl border border-[#EBEBEB] py-1 z-50 w-40"
            style={{ top: Math.min(contextMenu.y, window.innerHeight - 320), left: Math.min(contextMenu.x, window.innerWidth - 160) }}
          >
            <button type="button" onClick={() => { setReplyingTo(contextMenu.msg); setContextMenu(null); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#111111] hover:bg-[#F5F5F5] transition-colors"
            >
              <Reply size={14} /> Reply
            </button>
            {contextMenu.msg.type === 'text' && (
              <button type="button" onClick={() => handleTranslate(contextMenu.msg)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#111111] hover:bg-[#F5F5F5] transition-colors"
              >
                <Languages size={14} /> Translate
              </button>
            )}
            {contextMenu.msg.senderId === currentUser?.id && contextMenu.msg.type === 'text' && (
              <button type="button" onClick={() => { handleEditStart(contextMenu.msg); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#111111] hover:bg-[#F5F5F5] transition-colors"
              >
                <Pencil size={14} /> Edit
              </button>
            )}
            <button type="button" onClick={() => { handlePin(contextMenu.msg); setContextMenu(null); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#111111] hover:bg-[#F5F5F5] transition-colors"
            >
              <Pin size={14} /> Pin
            </button>
            {pinnedMessages.some(p => p.message_id === contextMenu.msg.id) && (
              <button type="button" onClick={() => { handleUnpin(contextMenu.msg.id); setContextMenu(null); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#FF3B30] hover:bg-[#FF3B30]/10 transition-colors"
              >
                <Pin size={14} /> Unpin
              </button>
            )}
            {isSaved(contextMenu.msg.id) ? (
              <button type="button" onClick={() => { handleUnsave(contextMenu.msg.id); setContextMenu(null); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#FF3B30] hover:bg-[#FF3B30]/10 transition-colors"
              >
                <Bookmark size={14} /> Unsave
              </button>
            ) : (
              <button type="button" onClick={() => { handleSave(contextMenu.msg); setContextMenu(null); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#111111] hover:bg-[#F5F5F5] transition-colors"
              >
                <Bookmark size={14} /> Save
              </button>
            )}
            <button type="button" onClick={() => handleCopy(contextMenu.msg.content)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#111111] hover:bg-[#F5F5F5] transition-colors"
              aria-label="Copy message"
            >
              <Copy size={14} /> Copy
            </button>
            <button type="button" onClick={() => { setForwardMsg(contextMenu.msg); setShowForwardModal(true); setContextMenu(null); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#111111] hover:bg-[#F5F5F5] transition-colors"
            >
              <Forward size={14} /> Forward
            </button>
            {contextMenu.msg.senderId === currentUser?.id && (
              <>
                <button type="button" onClick={() => { setShowDeleteForEveryoneConfirm(contextMenu.msg.id); setContextMenu(null); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#FF3B30] hover:bg-[#FF3B30]/10 transition-colors"
                >
                  <Trash2 size={14} /> Delete for Everyone
                </button>
                <button type="button" onClick={() => handleDelete(contextMenu.msg.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#FF3B30] hover:bg-[#FF3B30]/10 transition-colors"
                >
                  <Trash2 size={14} /> Delete for Me
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transfer Modal */}
      <TransferModal
        open={showTransfer}
        onClose={() => setShowTransfer(false)}
        chatId={chatId}
        toUserId={userId}
        toUserName={displayUser?.name}
      />

      {/* Forward Modal */}
      <AnimatePresence>
        {showForwardModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowForwardModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full max-h-[80vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-[#111111] mb-4">
                Forward {forwardBatch.length > 1 ? `${forwardBatch.length} messages` : 'to'}
              </h3>
              <div className="space-y-2">
                {friends.length === 0 ? (
                  <p className="text-[#8D8D8D] text-sm text-center py-4">No friends to forward to</p>
                ) : (
                  friends.map((friend) => (
                    <button type="button" key={friend.id}
                      onClick={async () => {
                        const targetChatId = 'dm_' + [currentUser?.id, friend.id].sort().join('_');
                        await handleForward(targetChatId);

                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#F5F5F5] transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center overflow-hidden shrink-0">
                        {sanitizeMediaUrl(friend.avatar) ? (
                          <img src={sanitizeMediaUrl(friend.avatar)} className="w-full h-full object-cover" alt="User avatar" />
                        ) : (
                          <img src={getDefaultAvatar(friend.id || friend.name || 'U')} className="w-full h-full object-cover" alt="User avatar" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[#111111] text-sm font-medium truncate">{friend.name}</p>
                        <p className="text-[#8D8D8D] text-xs truncate">{friend.statusMessage || 'Tap to forward'}</p>
                      </div>
                      <ArrowRight size={18} className="text-[#C7C7CC] shrink-0" />
                    </button>
                  ))
                )}
              </div>
              <button type="button" onClick={() => setShowForwardModal(false)}
                className="w-full mt-4 py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Schedule Picker */}
      <AnimatePresence>
        {showSchedulePicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowSchedulePicker(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-[#111111] mb-4 flex items-center gap-2">
                <Calendar size={20} className="text-[#8B5CF6]" /> Schedule Message
              </h3>
              <p className="text-[#8D8D8D] text-sm mb-3">Select a date and time to send this message:</p>
              <input
                type="datetime-local"
                aria-label="Select scheduled date and time"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="w-full bg-[#F5F5F5] rounded-xl px-3 py-3 text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]"
              />
              <p className="text-[#8D8D8D] text-xs mt-2 mb-4">Message: {input || 'No message'}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowSchedulePicker(false)}
                  className="flex-1 py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold"
                >
                  Cancel
                </button>
                <button type="button" onClick={handleScheduleSend}
                  disabled={!scheduleDate || !input.trim()}
                  className="flex-1 py-3 bg-[#8B5CF6] text-white rounded-xl text-sm font-bold disabled:opacity-50"
                >
                  Schedule
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Poll Creation Modal */}
      <AnimatePresence>
        {showPollModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowPollModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-[#111111] mb-4 flex items-center gap-2">
                <BarChart3 size={20} className="text-[#8B5CF6]" /> Create Poll
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="text-[#8D8D8D] text-xs mb-1 block" htmlFor="poll-question-input">Question</label>
                  <input
                    id="poll-question-input"
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    placeholder="Ask a question..."
                    aria-label="Poll question"
                    className="w-full bg-[#F5F5F5] rounded-xl px-4 py-3 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] placeholder:text-[#8D8D8D]"
                  />
                </div>
                {pollOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={opt}
                      onChange={(e) => {
                        const next = [...pollOptions];
                        next[i] = e.target.value;
                        setPollOptions(next);
                      }}
                      aria-label={`Poll option ${i + 1}`}
                      placeholder={`Option ${i + 1}`}
                      className="flex-1 bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] placeholder:text-[#8D8D8D]"
                    />
                    {pollOptions.length > 2 && (
                      <button type="button" onClick={() => setPollOptions(pollOptions.filter((_, idx) => idx !== i))}
                        className="p-2 text-[#FF3B30] hover:bg-[#FF3B30]/10 rounded-full transition-colors"
                        aria-label="Remove poll option"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
                {pollOptions.length < 6 && (
                  <button type="button" onClick={() => setPollOptions([...pollOptions, ''])}
                    className="w-full py-2.5 bg-[#F5F5F5] text-[#8B5CF6] rounded-xl text-sm font-medium hover:bg-[#8B5CF6]/10 transition-colors"
                  >
                    + Add Option
                  </button>
                )}
              </div>
              <div className="flex gap-2 mt-4">
                <button type="button" onClick={() => setShowPollModal(false)}
                  className="flex-1 py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold"
                >
                  Cancel
                </button>
                <button type="button" onClick={() => {
                    if (!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2) {
                      toast.error('Enter a question and at least 2 options');
                      return;
                    }
                    sendPoll(chatId, currentUser?.id || '', pollQuestion.trim(), pollOptions.filter(o => o.trim()));
                    toast.success('Poll created');
                    setPollQuestion('');
                    setPollOptions(['', '']);
                    setShowPollModal(false);
                  }}
                  disabled={!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2}
                  className="flex-1 py-3 bg-[#8B5CF6] text-white rounded-xl text-sm font-bold disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Report Modal */}
      <AnimatePresence>
        {showReportModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowReportModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[#111111]">Report User</h2>
                <button type="button" onClick={() => setShowReportModal(false)} className="p-1 text-[#8D8D8D]" aria-label="Close report dialog"><X size={18} /></button>
              </div>
              <p className="text-[#8D8D8D] text-sm mb-3">Why are you reporting {displayUser?.name || 'this user'}?</p>
              <div className="space-y-2 mb-3">
                {REPORT_OPTIONS.map((option) => (
                  <button type="button" key={option}
                    onClick={() => setReportReason(option)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm transition-colors ${
                      reportReason === option ? 'bg-[#00C300]/10 text-[#00C300] font-medium' : 'bg-[#F5F5F5] text-[#111111]'
                    }`}
                  >
                    {option}
                    {reportReason === option && <Check size={16} />}
                  </button>
                ))}
              </div>
              <div className="mb-4">
                <label className="text-[#8D8D8D] text-xs mb-1 block">Details (optional)</label>
                <textarea
                  value={reportDetails}
                  onChange={e => setReportDetails(e.target.value)}
                  className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300] resize-none min-h-[60px]"
                  placeholder="Add more details..."
                  maxLength={500}
                />
                <p className="text-[#C7C7CC] text-[10px] text-right mt-0.5">{reportDetails.length}/500</p>
              </div>
              <button type="button" onClick={handleReportSubmit}
                disabled={!reportReason || processingAction}
                className="w-full bg-[#FF3B30] hover:bg-[#D32F2F] text-white rounded-xl py-3 text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {processingAction ? <Loader size={16} className="animate-spin" /> : <Flag size={16} />}
                Submit Report
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
            onClick={() => setLightboxImage(null)}
          >
            <button type="button" onClick={() => setLightboxImage(null)} aria-label="Close image preview"
              className="absolute top-4 right-4 text-white/80 hover:text-white p-2"
            >
              <X size={28} />
            </button>
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              src={lightboxImage}
              className="max-w-full max-h-full rounded-lg"
              alt="Lightbox image"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete for Everyone Confirmation */}
      <AnimatePresence>
        {showDeleteForEveryoneConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowDeleteForEveryoneConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-14 h-14 rounded-full bg-[#FF3B30]/10 flex items-center justify-center mx-auto mb-4">
                <Trash2 size={28} className="text-[#FF3B30]" />
              </div>
              <h3 className="text-lg font-bold text-[#111111] text-center mb-2">Delete for Everyone?</h3>
              <p className="text-[#8D8D8D] text-sm text-center mb-6">
                This message will be deleted for everyone in this chat. This action cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteForEveryoneConfirm(null)}
                  className="flex-1 py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleDeleteForEveryone(showDeleteForEveryoneConfirm);
                    setShowDeleteForEveryoneConfirm(null);
                  }}
                  className="flex-1 py-3 bg-[#FF3B30] text-white rounded-xl text-sm font-bold"
                >
                  Delete for Everyone
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Background Theme Picker */}
      <AnimatePresence>
        {showBgPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
            onClick={() => setShowBgPicker(false)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-white rounded-t-3xl p-6 w-full max-w-lg"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-base font-bold text-[#111111] mb-4">Chat Background</h3>
              <div className="grid grid-cols-4 gap-3">
                {BG_OPTIONS.map((opt) => (
                  <button
                    type="button"
                    key={opt.label}
                    onClick={() => { setChatBg(opt.value); setShowBgPicker(false); }}
                    className={`h-16 rounded-2xl border-2 transition-all ${
                      chatBg === opt.value ? 'border-[#00C300] scale-105' : 'border-transparent'
                    }`}
                    style={opt.value ? { background: opt.value } : { background: '#F0F2F5' }}
                    title={opt.label}
                  >
                    {!opt.value && <span className="text-[10px] text-[#8D8D8D] font-medium">Default</span>}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
