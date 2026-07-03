import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronDown, Phone, MoreHorizontal, Mic, Send, Search, X,
  Smile, Camera, Image as ImageIcon, MapPin, File, User, Plus, Wallet,
  Copy, Trash2, Reply, Forward, Heart, ThumbsUp, Laugh, Flame, Star, Pencil,
  Clock, FileText, ArrowRight, Calendar, Flag, UserMinus, Check, Ban, UserPlus,
  Loader, Info, Pin, Bookmark, BarChart3, Lock, MessageCircle
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { useFriendStore } from '@/store/useFriendStore';
import { isFirestoreAvailable, getDocById, updateDocById, COLLECTIONS } from '@/lib/firestore';
import { useTyping } from '@/hooks/useTyping';
import { useFilteredOnline } from '@/hooks/usePresence';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { useOfflineQueue, isOnline } from '@/hooks/useOfflineQueue';
import { useMessagePin } from '@/hooks/useMessagePin';
import { useSavedMessages } from '@/hooks/useSavedMessages';
import { useScheduledMessages } from '@/hooks/useScheduledMessages';
import { formatTime, getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
import type { Message, FriendRequest, SentRequest } from '@/types';
import { pushNotificationService } from '@/services/pushNotificationService';
import TransferModal from '@/components/TransferModal';
import { EmojiPicker } from './EmojiPicker';
import { toast } from 'sonner';

const reactionEmojis = [
  { emoji: '👍', label: 'like', color: 'text-[#2196F3]' },
  { emoji: '❤️', label: 'love', color: 'text-[#FF3B30]' },
  { emoji: '😂', label: 'laugh', color: 'text-[#FF9800]' },
  { emoji: '😮', label: 'wow', color: 'text-[#8B5CF6]' },
  { emoji: '😢', label: 'sad', color: 'text-[#2196F3]' },
  { emoji: '😡', label: 'angry', color: 'text-[#FF3B30]' },
  { emoji: '🎉', label: 'celebrate', color: 'text-[#FF9800]' },
  { emoji: '🔥', label: 'fire', color: 'text-[#FF5722]' },
];

const attachmentOptions = [
  { icon: <ImageIcon size={28} strokeWidth={1.5} />, label: 'Photos', color: 'bg-[#4CAF50]' },
  { icon: <Camera size={28} strokeWidth={1.5} />, label: 'Camera', color: 'bg-[#2196F3]' },
  { icon: <Phone size={28} strokeWidth={1.5} />, label: 'Audio', color: 'bg-[#00C300]' },
  { icon: <User size={28} strokeWidth={1.5} />, label: 'Contact', color: 'bg-[#FF9800]' },
  { icon: <MapPin size={28} strokeWidth={1.5} />, label: 'Location', color: 'bg-[#E91E63]' },
  { icon: <File size={28} strokeWidth={1.5} />, label: 'File', color: 'bg-[#673AB7]' },
  { icon: <BarChart3 size={28} strokeWidth={1.5} />, label: 'Poll', color: 'bg-[#8B5CF6]' },
];

export default function ChatRoom({ chatId, userId, onBack }: {
  chatId: string;
  userId: string;
  isMobile?: boolean;
  onBack?: () => void;
}) {
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();
  const { messages, sendMessage, subscribeMessages, markAsRead, deleteMessage, deleteForEveryone, addReaction, pinMessage, unpinMessage, sendPoll, votePoll, editMessage, sendContactCard, unlockChat, chats } = useChatStore();
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
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [processingAction, setProcessingAction] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const shouldAutoScrollRef = useRef(true);

  // Unread separator tracking
  const initialLatestTimestampRef = useRef<number | null>(null);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  // Message selection mode
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Swipe to reply tracking
  const [swipeReplyMsg, setSwipeReplyMsg] = useState<Message | null>(null);
  const touchStartXRef = useRef<number>(0);
  const touchCurrentXRef = useRef<number>(0);
  const swipeThreshold = 80; // pixels to trigger swipe

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const otherUser = friends.find(f => f.id === userId);
  const [otherUserProfile, setOtherUserProfile] = useState<{ name: string; avatar: string; id: string } | null>(null);
  const msgs = messages[chatId] || [];
  const isUserOnline = visibleOnline[userId];

  // Fetch non-friend user profile for chat header
  useEffect(() => {
    if (!userId || !currentUser || otherUser) return;
    let cancelled = false;
    const load = async () => {
      try {
        if (!isFirestoreAvailable()) return;
        const data = await getDocById('users', userId);
        if (data && !cancelled) {
          setOtherUserProfile({
            name: (data as any).name || 'User',
            avatar: (data as any).avatar || '',
            id: userId,
          });
        }
      } catch { /* ignore */ }
    };
    load();
    return () => { cancelled = true; };
  }, [userId, currentUser, otherUser]);

  const displayUser = otherUser || otherUserProfile || { name: 'User', avatar: '', id: userId };

  const filteredMsgs = searchQuery
    ? msgs.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : msgs;

  // Mark messages as read on mount AND when new messages arrive while viewing
  useEffect(() => {
    if (!chatId || !currentUser?.id) return;
    markAsRead(chatId, currentUser.id);
  }, [chatId, currentUser?.id, markAsRead]);

  // Disappearing messages timer - auto-destroy messages after timer expires
  useEffect(() => {
    if (!msgs.length || !currentUser?.id || !isFirestoreAvailable()) return;
    const now = Date.now();
    const toInitiate: Message[] = [];
    const toDestroy: Message[] = [];

    msgs.forEach(msg => {
      if (!msg.disappearingTimer || msg.disappearingTimer <= 0) return;
      if (msg.senderId === currentUser.id) return; // Only recipient triggers timer
      if (msg.destroyed) return;

      if (!msg.disappearingInitiatedAt) {
        toInitiate.push(msg);
      } else {
        const initiatedTime = msg.disappearingInitiatedAt instanceof Date
          ? msg.disappearingInitiatedAt.getTime()
          : new Date(msg.disappearingInitiatedAt).getTime();
        const expiresAt = initiatedTime + msg.disappearingTimer * 1000;
        if (now >= expiresAt) {
          toDestroy.push(msg);
        }
      }
    });

    if (toInitiate.length > 0) {
      toInitiate.forEach(msg => {
        updateDocById(COLLECTIONS.CHATS, chatId, {
          messages: msgs.map(m => m.id === msg.id ? { ...m, disappearingInitiatedAt: new Date().toISOString() } : m)
        }).catch(() => {});
      });
    }

    const timers = toInitiate.map(msg => {
      const timerMs = msg.disappearingTimer! * 1000;
      return setTimeout(() => {
        updateDocById(COLLECTIONS.CHATS, chatId, {
          messages: msgs.map(m => m.id === msg.id ? { ...m, destroyed: true, content: 'This message has disappeared' } : m)
        }).catch(() => {});
      }, timerMs);
    });

    if (toDestroy.length > 0) {
      toDestroy.forEach(msg => {
        updateDocById(COLLECTIONS.CHATS, chatId, {
          messages: msgs.map(m => m.id === msg.id ? { ...m, destroyed: true, content: 'This message has disappeared' } : m)
        }).catch(() => {});
      });
    }

    return () => timers.forEach(clearTimeout);
  }, [msgs, chatId, currentUser?.id]);

  // Scroll to bottom only when user was already at bottom
  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [msgs.length]);

  // Track scroll position to determine auto-scroll behavior
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const threshold = 100;
      const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
      shouldAutoScrollRef.current = atBottom;
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [chatId]);

  // Load friend status
  useEffect(() => {
    if (!currentUser?.id || !userId) return;
    const loadStatus = async () => {
      try {
        const status = await getFriendStatus(currentUser.id, userId);
        setFriendStatus(status);
      } catch {
        console.error('Failed to load friend status');
      }
    };
    loadStatus();
  }, [currentUser?.id, userId, getFriendStatus]);

  // Track initial latest message timestamp for unread separator
  useEffect(() => {
    if (msgs.length > 0 && initialLatestTimestampRef.current === null) {
      const latest = Math.max(...msgs.map(m => m.timestamp.getTime()));
      initialLatestTimestampRef.current = latest;
    }
  }, [msgs.length]);

  // Detect new messages arriving after initial load
  useEffect(() => {
    if (initialLatestTimestampRef.current === null || msgs.length === 0) return;
    const hasNew = msgs.some(m => m.timestamp.getTime() > initialLatestTimestampRef.current!);
    setHasNewMessages(hasNew);
  }, [msgs]);

  // Close more menu on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    if (showMoreMenu) {
      window.addEventListener('click', handleClick);
      return () => window.removeEventListener('click', handleClick);
    }
  }, [showMoreMenu]);

  // Refresh pending scheduled messages periodically
  useEffect(() => {
    setPendingSchedules(getPending());
    const interval = setInterval(() => {
      setPendingSchedules(getPending());
    }, 5000);
    return () => clearInterval(interval);
  }, [chatId, getPending]);

  useEffect(() => {
    const unsub = subscribeMessages(chatId);
    markAsRead(chatId, currentUser?.id);
    return unsub;
  }, [chatId, currentUser?.id, subscribeMessages, markAsRead]);

  // Push notification for new messages when app is not focused
  useEffect(() => {
    if (!msgs.length || !currentUser?.id) return;
    const lastMsg = msgs[msgs.length - 1];
    // Only notify for messages from other users
    if (lastMsg.senderId === currentUser.id) return;
    // Only notify if document is hidden (user not looking at app)
    if (typeof document !== 'undefined' && !document.hidden) return;
    // Debounce: don't notify for messages older than 5 seconds
    const msgAge = Date.now() - lastMsg.timestamp.getTime();
    if (msgAge > 5000) return;

    pushNotificationService.showMessageNotification(
      displayUser?.name || 'New Message',
      lastMsg.type === 'text' ? lastMsg.content : `Sent a ${lastMsg.type}`,
      chatId,
      lastMsg.senderId
    );
  }, [msgs, chatId, currentUser?.id, displayUser?.name]);

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

  const handleUnlock = async () => {
    const pin = lockPinInput.trim();
    if (pin.length !== 4) {
      setLockError('Please enter a 4-digit PIN');
      return;
    }
    setUnlocking(true);
    setLockError('');
    try {
      const chat = chats.find((c) => c.id === chatId);
      const storedPin = chat?.lockValue;
      if (!chat || !storedPin) {
        setLockError('No PIN is configured for this chat.');
        return;
      }
      if (pin !== storedPin) {
        setLockError('Incorrect PIN. Please try again.');
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
  };

  // If user clears/unmounts, ensure we stop typing
  useEffect(() => {
    if (!input.trim()) stopTyping();
    return () => {
      stopTyping();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  // Scroll detection: show scroll-to-bottom button + track if at bottom
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const threshold = 100;
      const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
      setShowScrollBtn(!atBottom);
      shouldAutoScrollRef.current = atBottom;
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => container.removeEventListener('scroll', handleScroll);
  }, [chatId]);

  // Scroll to bottom only when user was already at bottom
  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [msgs.length]);

  // Fetch last seen for other user
  useEffect(() => {
    if (!userId || isUserOnline) { setLastSeen(null); return; }
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

  // Load draft from localStorage
  useEffect(() => {
    const draft = localStorage.getItem(`chat_draft_${chatId}`);
    if (draft) setInput(draft);
  }, [chatId]);

  // Save draft to localStorage
  useEffect(() => {
    if (input.trim()) {
      localStorage.setItem(`chat_draft_${chatId}`, input);
    } else {
      localStorage.removeItem(`chat_draft_${chatId}`);
    }
  }, [input, chatId]);

  const handleSend = async () => {
    if (!input.trim() || !currentUser) return;
    // stop typing immediately after sending
    stopTyping();
    if (!isOnline()) { // this is the imported isOnline from useOfflineQueue!
      queueMessage({ type: 'direct', chatId, senderId: currentUser.id, content: input.trim(), replyTo: replyingTo?.id });
      setInput('');
      setShowAttachments(false);
      setReplyingTo(null);
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
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    try {
      const { uploadMediaBlob } = await import('@/lib/storage');
      const url = await uploadMediaBlob({ kind: 'chats', chatId, file, mimeType: file.type });
      const mediaType = type === 'image' ? 'image' : 'video';
      await sendMessage(chatId, currentUser.id, mediaType === 'image' ? '\u{1F4F7} Photo' : '\u{1F4F9} Video', mediaType, url);
    } catch {
      console.error('Upload error:');
      toast.error('Failed to upload media. Please try again.');
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Message copied');
    setContextMenu(null);
  };

  const handleDelete = async (msgId: string) => {
    try {
      await deleteMessage(chatId, msgId);
      toast.success('Message deleted');
    } catch {
      toast.error('Failed to delete message');
    }
    setContextMenu(null);
  };

  const handleDeleteForEveryone = async (msgId: string) => {
    try {
      await deleteForEveryone(chatId, msgId);
      toast.success('Message deleted for everyone');
    } catch {
      toast.error('Failed to delete message');
    }
    setContextMenu(null);
  };

  const handlePin = async (msg: Message) => {
    if (!currentUser?.id) return;
    try {
      await pinMessage(chatId, msg.id, msg.content);
      toast.success('Message pinned');
    } catch {
      toast.error('Failed to pin message');
    }
    setContextMenu(null);
  };

  const handleUnpin = async (msgId: string) => {
    if (!currentUser?.id) return;
    try {
      await unpinMessage(chatId, msgId);
      toast.success('Message unpinned');
    } catch {
      toast.error('Failed to unpin message');
    }
    setContextMenu(null);
  };

  const handleSave = (msg: Message) => {
    const sender = friends.find((f) => f.id === msg.senderId) || (msg.senderId === currentUser?.id ? currentUser : null);
    saveMessage(msg, sender?.name || 'Unknown');
    toast.success('Message saved');
    setContextMenu(null);
  };

  const handleUnsave = (msgId: string) => {
    unsaveMessage(msgId);
    toast.success('Message unsaved');
    setContextMenu(null);
  };

  const handleReact = async (msgId: string, reaction: string) => {
    if (!currentUser?.id) return;
    try {
      await addReaction(chatId, msgId, reaction, currentUser.id);
    } catch {
      toast.error('Failed to add reaction');
    }
    setSelectedReactionMsg(null);
    setContextMenu(null);
  };

  // ─── Swipe to Reply ─────────────────────────────
  const handleTouchStart = (e: React.TouchEvent, msg: Message) => {
    if (selectionMode) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchCurrentXRef.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (selectionMode) return;
    touchCurrentXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (msg: Message) => {
    if (selectionMode) return;
    const diff = touchStartXRef.current - touchCurrentXRef.current;
    if (diff > swipeThreshold && msg.type !== 'deleted') {
      setSwipeReplyMsg(msg);
      setReplyingTo(msg);
    }
  };

  // ─── Message Selection Mode ─────────────────────
  const handleMessageLongPress = (msg: Message) => {
    if (msg.type === 'deleted') return;
    setSelectionMode(true);
    setSelectedMessages(new Set([msg.id]));
  };

  const toggleMessageSelection = (msgId: string) => {
    setSelectedMessages(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedMessages(new Set());
  };

  const handleDeleteSelected = async () => {
    if (!currentUser?.id) return;
    for (const msgId of selectedMessages) {
      try {
        await deleteMessage(chatId, msgId);
      } catch { /* ignore */ }
    }
    toast.success(`${selectedMessages.size} message${selectedMessages.size > 1 ? 's' : ''} deleted`);
    exitSelectionMode();
  };

  const handleForwardSelected = () => {
    if (selectedMessages.size === 1) {
      const msg = msgs.find(m => m.id === Array.from(selectedMessages)[0]);
      if (msg) {
        setForwardMsg(msg);
        setShowForwardModal(true);
      }
    } else {
      toast.info('Select one message to forward');
    }
    exitSelectionMode();
  };

  const handleCopySelected = () => {
    const selectedMsgs = msgs.filter(m => selectedMessages.has(m.id));
    const text = selectedMsgs.map(m => m.content).join('\n');
    navigator.clipboard.writeText(text);
    toast.success('Messages copied');
    exitSelectionMode();
  };

  const handleContextMenu = (e: React.MouseEvent, msg: Message) => {
    e.preventDefault();
    if (selectionMode) {
      toggleMessageSelection(msg.id);
      return;
    }
    setContextMenu({ msg, x: e.clientX, y: e.clientY });
  };

  const handleVoiceSend = async () => {
    if (!currentUser) return;
    const blob = await stopRecording();
    if (!blob) return;
    try {
      const { uploadMediaBlob } = await import('@/lib/storage');
      const url = await uploadMediaBlob({ kind: 'voice', chatId, file: blob as unknown as File, mimeType: 'audio/webm' });
      await sendMessage(chatId, currentUser.id, '\u{1F3A4} Voice message', 'voice', url);
    } catch {
      console.error('Voice upload error');
      toast.error('Failed to send voice message');
    }
  };


  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    try {
      const { uploadMediaBlob } = await import('@/lib/storage');
      const url = await uploadMediaBlob({ kind: 'chats', chatId, file, mimeType: file.type });
      await sendMessage(chatId, currentUser.id, `\u{1F4C1} ${file.name}`, 'file', url);
    } catch {
      console.error('File upload error');
      toast.error('Failed to upload file. Please try again.');
    }
  };

  const handleContactShare = async () => {
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
  };

  const handleLocationShare = () => {
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
  };

  const handleForward = async (targetChatId: string) => {
    if (!forwardMsg || !currentUser) return;
    try {
      // Ensure chat exists before forwarding
      const { createDirectChat } = useChatStore.getState();
      if (targetChatId.startsWith('dm_')) {
        const parts = targetChatId.split('_');
        const otherId = parts.find((p) => p !== currentUser.id && p !== 'dm');
        if (otherId) {
          await createDirectChat(otherId, currentUser.id);
        }
      }
      await sendMessage(
        targetChatId,
        currentUser.id,
        forwardMsg.content,
        forwardMsg.type,
        forwardMsg.mediaUrl,
      );
      toast.success('Message forwarded');
      setShowForwardModal(false);
      setForwardMsg(null);
    } catch {
      toast.error('Failed to forward message');
    }
  };


  const handleScheduleSend = async () => {
    if (!input.trim() || !currentUser || !scheduleDate) return;
    const scheduledTime = new Date(scheduleDate).getTime();
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
  };

  const formatDateSeparator = (date: Date) => {
    const now = new Date();
    const d = new Date(date);
    if (d.toDateString() === now.toDateString()) return 'Today';
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  };

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

  type LegacySentRequest = SentRequest & { to_user_id?: string };
  type LegacyFriendRequest = FriendRequest & { fromUserId?: string; from_user_id?: string };

  const findSentRequest = (toUserId: string) => {
    return sentRequests.find((r) => {
      const record = r as LegacySentRequest;
      return record.toUserId === toUserId || record.to_user_id === toUserId;
    });
  };

  const findReceivedRequest = (fromUserId: string) => {
    return requests.find((r) => {
      const record = r as LegacyFriendRequest;
      return record.from === fromUserId || record.fromUserId === fromUserId || record.from_user_id === fromUserId;
    });
  };

  const handleAddFriend = async () => {
    if (!currentUser?.id || !userId) return;
    setProcessingAction(true);
    try {
      await sendRequest(userId, currentUser.id);
      toast.success('Friend request sent');
      setFriendStatus('request_sent');
    } catch {
      toast.error('Failed to send friend request');
    }
    setProcessingAction(false);
  };

  const handleCancelRequest = async () => {
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
    }
    setProcessingAction(false);
  };

  const handleAcceptRequest = async () => {
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
    }
    setProcessingAction(false);
  };

  const handleRejectRequest = async () => {
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
    }
    setProcessingAction(false);
  };

  const handleBlockUser = async () => {
    if (!currentUser?.id || !userId) return;
    setProcessingAction(true);
    try {
      await blockUser(userId, currentUser.id);
      toast.success('User blocked');
      setFriendStatus('blocked');
      setShowMoreMenu(false);
    } catch {
      toast.error('Failed to block user');
    }
    setProcessingAction(false);
  };

  const handleUnblockUser = async () => {
    if (!currentUser?.id || !userId) return;
    setProcessingAction(true);
    try {
      await unblockUser(userId, currentUser.id);
      toast.success('User unblocked');
      setFriendStatus('not_friends');
      setShowMoreMenu(false);
    } catch {
      toast.error('Failed to unblock user');
    }
    setProcessingAction(false);
  };

  const handleRemoveFriend = async () => {
    if (!currentUser?.id || !userId) return;
    setProcessingAction(true);
    try {
      await removeFriend(userId, currentUser.id);
      toast.success('Friend removed');
      setFriendStatus('not_friends');
      setShowMoreMenu(false);
    } catch {
      toast.error('Failed to remove friend');
    }
    setProcessingAction(false);
  };

  const handleReportSubmit = async () => {
    if (!currentUser?.id || !userId || !reportReason) return;
    setProcessingAction(true);
    try {
      await reportUser({ reporterId: currentUser.id, reportedId: userId, reason: reportReason, details: reportDetails });
      toast.success('Report submitted');
      setShowReportModal(false);
      setShowMoreMenu(false);
      setReportReason('');
      setReportDetails('');
    } catch {
      toast.error('Failed to submit report');
    }
    setProcessingAction(false);
  };

  const insertEmoji = (emoji: string) => {
    setInput(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  const handleEditStart = (msg: Message) => {
    setEditingMessageId(msg.id);
    setInput(msg.content);
    setContextMenu(null);
  };

  const handleEditCancel = () => {
    setEditingMessageId(null);
    const draft = localStorage.getItem(`chat_draft_${chatId}`);
    setInput(draft || '');
  };

  const handleEditSave = async (msgId: string) => {
    if (!input.trim() || !currentUser) return;
    try {
      await editMessage(chatId, msgId, input.trim());
      setEditingMessageId(null);
      setInput('');
    } catch {
      toast.error('Failed to edit message');
    }
  };

  const reportOptions = ['Spam', 'Harassment', 'Inappropriate content', 'Fake account', 'Other'];

  const friendBanner = (() => {
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
  })();

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
        {selectionMode ? (
          <motion.div
            key="selection-header"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="shrink-0 flex justify-between items-center px-4 py-3 bg-[#00C300] border-b border-[#00A300] z-10"
          >
            <div className="flex items-center gap-3">
              <button type="button" onClick={exitSelectionMode} className="p-1 text-white" aria-label="Cancel selection">
                <X size={24} />
              </button>
              <span className="text-white font-bold text-base">{selectedMessages.size} selected</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleCopySelected} className="p-2 text-white hover:bg-white/20 rounded-full" title="Copy" aria-label="Copy selected">
                <Copy size={20} />
              </button>
              <button type="button" onClick={handleForwardSelected} className="p-2 text-white hover:bg-white/20 rounded-full" title="Forward" aria-label="Forward selected">
                <Forward size={20} />
              </button>
              <button type="button" onClick={handleDeleteSelected} className="p-2 text-white hover:bg-white/20 rounded-full" title="Delete" aria-label="Delete selected">
                <Trash2 size={20} />
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="normal-header"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="shrink-0 flex justify-between items-center px-2 py-3 bg-white border-b border-[#EBEBEB] z-10"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <button type="button" onClick={onBack || (() => navigate(-1))} aria-label="Go back" className="p-2 -ml-2 active:bg-gray-100 rounded-full text-[#111111]">
                <ChevronLeft size={28} strokeWidth={1.5} />
              </button>
              <div className="w-9 h-9 rounded-full bg-[#F5F5F5] flex items-center justify-center overflow-hidden shrink-0">
                {sanitizeMediaUrl(displayUser?.avatar) ? (
                  <img src={sanitizeMediaUrl(displayUser?.avatar)} className="w-full h-full object-cover" alt="User avatar" />
                ) : (
                  <img src={getDefaultAvatar(displayUser?.id || userId || displayUser?.name || 'U')} className="w-full h-full object-cover" alt="User avatar" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-[#111111] leading-tight truncate">{displayUser?.name || 'Chat'}</h3>
                <p className="text-[11px] text-[#8D8D8D]">
                  {Object.keys(typingUsers).length > 0 ? 'typing...' : isUserOnline ? 'Online' : lastSeen ? `last seen ${lastSeen}` : 'Offline'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 pr-3 text-[#111111]">
              <button type="button" onClick={() => setShowSearch(!showSearch)} className="active:opacity-60" aria-label="Search messages" title="Search messages">
                <Search size={22} strokeWidth={1.5} className={showSearch ? 'text-[#00C300]' : ''} />
              </button>
          <button type="button" onClick={() => setShowTransfer(true)} className="active:opacity-60" aria-label="Send money" title="Send money">
            <Wallet size={22} strokeWidth={1.5} className="text-[#00C300]" />
          </button>
          <button type="button" onClick={() => navigate('/call', { state: { userId, mode: 'voice' } })}
            className="active:opacity-60" aria-label="Start voice call"
          >
            <Phone size={22} strokeWidth={1.5} />
          </button>
          <div className="relative" ref={moreMenuRef}>
            <button type="button" onClick={() => setShowMoreMenu(!showMoreMenu)} className="active:opacity-60" aria-label="Open chat options">
              <MoreHorizontal size={22} strokeWidth={1.5} />
            </button>
            <AnimatePresence>
              {showMoreMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -5 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -5 }}
                  className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-[#EBEBEB] py-1 z-50 w-44"
                >
                  <button type="button" onClick={() => { navigate(`/profile/${userId}`); setShowMoreMenu(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#111111] hover:bg-[#F5F5F5] transition-colors text-left"
                  >
                    <User size={14} /> View Profile
                  </button>
                  <button type="button" onClick={() => { navigate(`/chat-info/${chatId}`); setShowMoreMenu(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#111111] hover:bg-[#F5F5F5] transition-colors text-left"
                  >
                    <Info size={14} /> Chat Info
                  </button>
                  {friendStatus === 'friends' && (
                    <button type="button" onClick={handleRemoveFriend}
                      disabled={processingAction}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#FF3B30] hover:bg-[#FF3B30]/10 transition-colors text-left disabled:opacity-50"
                    >
                      <UserMinus size={14} /> Remove Friend
                    </button>
                  )}
                  {friendStatus !== 'blocked' ? (
                    <button type="button" onClick={handleBlockUser}
                      disabled={processingAction}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#111111] hover:bg-[#F5F5F5] transition-colors text-left disabled:opacity-50"
                    >
                      <Ban size={14} /> Block User
                    </button>
                  ) : (
                    <button type="button" onClick={handleUnblockUser}
                      disabled={processingAction}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#00C300] hover:bg-[#00C300]/10 transition-colors text-left disabled:opacity-50"
                    >
                      <Check size={14} /> Unblock User
                    </button>
                  )}
                  <button type="button" onClick={() => { setShowReportModal(true); setShowMoreMenu(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#111111] hover:bg-[#F5F5F5] transition-colors text-left"
                  >
                    <Flag size={14} /> Report User
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    )}
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

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 scrollbar-hide scroll-smooth">
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
                  onClick={() => inputRef.current?.focus()}
                  className="px-5 py-2.5 bg-[#00C300] text-white rounded-full text-sm font-medium active:bg-[#00A300] transition-colors"
                >
                  Start Chatting
                </button>
              )}
            </div>
          )}

          {filteredMsgs.map((msg, index) => {
            const isMe = msg.senderId === currentUser?.id;
            const prevMsg = index > 0 ? filteredMsgs[index - 1] : null;
            const isSameSender = prevMsg && prevMsg.senderId === msg.senderId;
            const showAvatar = !isMe && !isSameSender;
            const msgDate = formatDateSeparator(msg.timestamp);
            const showDate = dateSeparatorMap.get(msg.id) || false;

            const reactions = msg.reactions || {};
            const hasReactions = Object.values(reactions).some((users) => (users as string[]).length > 0);

            // Unread separator
            const isNew = initialLatestTimestampRef.current !== null && 
              msg.timestamp.getTime() > initialLatestTimestampRef.current;
            const prevIsNew = prevMsg && initialLatestTimestampRef.current !== null &&
              prevMsg.timestamp.getTime() > initialLatestTimestampRef.current;
            const showUnreadSeparator = isNew && !prevIsNew && index > 0 && hasNewMessages;

            const isSelected = selectedMessages.has(msg.id);

            // Money transfer message
            if (msg.type === 'money_transfer' && msg.transferData) {
              const isIncoming = msg.transferData.toUserId === currentUser?.id;
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex justify-center my-3"
                >
                  <div className={`rounded-2xl px-5 py-3 max-w-[80%] text-center border border-[#EBEBEB] ${
                    isIncoming ? 'bg-[#00C300]/10' : 'bg-white'
                  }`}>
                    <p className="text-[#00C300] text-xs font-medium mb-1">
                      {isIncoming ? '\u{1F4B0} You received' : '\u{1F4B8} You sent'}
                    </p>
                    <p className="text-[#111111] text-xl font-bold">
                      {msg.transferData.currency === 'BDT' ? `\u09F3${msg.transferData.amount}` : `${msg.transferData.amount} coins`}
                    </p>
                    {msg.transferData.note && (
                      <p className="text-[#8D8D8D] text-xs mt-1">{msg.transferData.note}</p>
                    )}
                    <p className="text-[#8D8D8D] text-[10px] mt-1">{formatTime(msg.timestamp)}</p>
                  </div>
                </motion.div>
              );
            }

            // Poll message
            if (msg.type === 'poll' && msg.pollData) {
              const poll = msg.pollData;
              const hasVoted = Object.values(poll.votes || {}).flat().includes(currentUser?.id || '');
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                >
                  {showAvatar && (
                    <div className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center mr-2 self-end shrink-0 overflow-hidden">
                      {sanitizeMediaUrl(displayUser?.avatar) ? (
                        <img src={sanitizeMediaUrl(displayUser?.avatar)} className="w-full h-full object-cover" alt="User avatar" />
                      ) : (
                        <img src={getDefaultAvatar(displayUser?.id || userId || displayUser?.name || 'U')} className="w-full h-full object-cover" alt="User avatar" />
                      )}
                    </div>
                  )}
                  <div className={`max-w-[70%] ${!isMe && !showAvatar ? 'ml-10' : ''}`}>
                    <div className={`inline-block px-4 py-3 rounded-2xl ${isMe ? 'bg-[#8B5CF6] text-white rounded-br-none' : 'bg-white text-[#111111] rounded-bl-none'}`}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <BarChart3 size={14} />
                        <span className="text-xs font-medium">Poll</span>
                      </div>
                      <p className="text-sm font-medium mb-2">{poll.question}</p>
                      <div className="space-y-1.5">
                        {(poll.options || []).map((opt: string, i: number) => {
                          const votes = (poll.votes?.[String(i)] || []) as string[];
                          const total = (poll.totalVotes || 0);
                          const percent = total > 0 ? Math.round((votes.length / total) * 100) : 0;
                          const isVoted = votes.includes(currentUser?.id || '');
                          return (
                            <button type="button" key={i}
                              onClick={() => {
                                if (!currentUser?.id) return;
                                votePoll(chatId, msg.id, i, currentUser.id);
                              }}
                              className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all relative overflow-hidden ${
                                isVoted
                                  ? isMe ? 'bg-white/30 text-white' : 'bg-[#8B5CF6]/10 text-[#8B5CF6]'
                                  : isMe ? 'bg-white/10 text-white/90 hover:bg-white/20' : 'bg-[#F5F5F5] text-[#111111] hover:bg-[#EBEBEB]'
                              }`}
                            >
                              {hasVoted && (
                                <progress
                                  value={votes.length}
                                  max={total}
                                  className={`absolute left-0 top-0 h-full w-full ${isMe ? 'bg-white/20' : 'bg-[#8B5CF6]/10'} appearance-none rounded-xl overflow-hidden`}
                                  aria-label={`${percent}% voted`}
                                />
                              )}
                              <span className="relative z-10 flex items-center justify-between">
                                <span>{opt}</span>
                                {hasVoted && <span className="text-xs opacity-70">{votes.length} ({percent}%)</span>}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {hasVoted && (
                        <p className={`text-xs mt-2 ${isMe ? 'text-white/60' : 'text-[#8D8D8D]'}`}>
                          {poll.totalVotes || 0} vote{(poll.totalVotes || 0) !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                    <div className={`text-[10px] mt-1 ${isMe ? 'text-white/70 text-right' : 'text-[#8D8D8D]'}`}>
                      {formatTime(msg.timestamp)} {isMe && (
                        <span className={`inline-flex items-center ${msg.read ? 'text-blue-200' : 'text-white/70'}`}>
                          <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="inline-block">
                            {msg.read ? (
                              <>
                                <path d="M1 5L4 8L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M5 5L8 8L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </>
                            ) : (
                              <path d="M1 5L5 9L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            )}
                          </svg>
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            }

            const isSearchMatch = searchQuery && msg.content.toLowerCase().includes(searchQuery.toLowerCase());

            // Contact card message
            if (msg.type === 'contact_card' && msg.contactCard) {
              const card = msg.contactCard;
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                >
                  {showAvatar && (
                    <div className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center mr-2 self-end shrink-0 overflow-hidden">
                      {sanitizeMediaUrl(displayUser?.avatar) ? (
                        <img src={sanitizeMediaUrl(displayUser?.avatar)} className="w-full h-full object-cover" alt="User avatar" />
                      ) : (
                        <img src={getDefaultAvatar(displayUser?.id || userId || displayUser?.name || 'U')} className="w-full h-full object-cover" alt="User avatar" />
                      )}
                    </div>
                  )}
                  <div className={`max-w-[70%] ${!isMe && !showAvatar ? 'ml-10' : ''}`}>
                    <div className={`inline-block px-4 py-3 rounded-2xl ${isMe ? 'bg-[#00C300] text-white rounded-br-none' : 'bg-white text-[#111111] rounded-bl-none'} shadow-sm`}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center shrink-0 overflow-hidden">
                          {card.avatar ? (
                            <img src={card.avatar} className="w-full h-full object-cover" alt="User avatar" />
                          ) : (
                            <img src={getDefaultAvatar(card.userId || card.name || 'U')} className="w-full h-full object-cover" alt="User avatar" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{card.name}</p>
                          {card.username && <p className="text-xs opacity-70">@{card.username}</p>}
                        </div>
                      </div>
                      {card.phone && <p className="text-xs opacity-80 mb-1">📞 {card.phone}</p>}
                      {card.email && <p className="text-xs opacity-80 mb-1">✉️ {card.email}</p>}
                      {card.bio && <p className="text-xs opacity-70 line-clamp-2">{card.bio}</p>}
                      <button
                        type="button"
                        onClick={() => navigate(`/profile/${card.userId}`)}
                        className={`mt-2 w-full py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          isMe ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-[#F5F5F5] text-[#111111] hover:bg-[#EBEBEB]'
                        }`}
                      >
                        View Profile
                      </button>
                    </div>
                    <div className={`text-[10px] mt-1 ${isMe ? 'text-white/70 text-right' : 'text-[#8D8D8D]'}`}>
                      {formatTime(msg.timestamp)} {isMe && (
                        <span className={`inline-flex items-center ${msg.read ? 'text-blue-200' : 'text-white/70'}`}>
                          <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="inline-block">
                            {msg.read ? (
                              <>
                                <path d="M1 5L4 8L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M5 5L8 8L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </>
                            ) : (
                              <path d="M1 5L5 9L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            )}
                          </svg>
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            }


            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="flex justify-center my-4">
                    <span className="bg-[#E4E6EB] text-[#8D8D8D] text-[11px] px-3 py-1 rounded-full font-medium">
                      {msgDate}
                    </span>
                  </div>
                )}
                {/* Unread Messages Separator */}
                {showUnreadSeparator && (
                  <div className="flex justify-center my-3">
                    <div className="flex items-center gap-2 px-4 py-1.5 bg-[#FF3B30]/10 rounded-full">
                      <span className="w-2 h-2 bg-[#FF3B30] rounded-full" />
                      <span className="text-[#FF3B30] text-[11px] font-medium">New Messages</span>
                    </div>
                  </div>
                )}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${isSelected ? 'opacity-70' : ''}`}
                  onContextMenu={(e) => { if (msg.type !== 'deleted') handleContextMenu(e, msg); }}
                  onTouchStart={(e) => handleTouchStart(e, msg)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={() => handleTouchEnd(msg)}
                  onMouseDown={() => {
                    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = setTimeout(() => handleMessageLongPress(msg), 600);
                  }}
                  onMouseUp={() => {
                    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                  }}
                  onMouseLeave={() => {
                    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                  }}
                  onClick={() => {
                    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                    if (selectionMode) toggleMessageSelection(msg.id);
                  }}
                >
                  {showAvatar && (
                    <div className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center mr-2 self-end shrink-0 overflow-hidden">
                      {sanitizeMediaUrl(displayUser?.avatar) ? (
                        <img src={sanitizeMediaUrl(displayUser?.avatar)} className="w-full h-full object-cover" alt="User avatar" />
                      ) : (
                        <img src={getDefaultAvatar(displayUser?.id || userId || displayUser?.name || 'U')} className="w-full h-full object-cover" alt="User avatar" />
                      )}
                    </div>
                  )}
                  <div className={`max-w-[70%] relative ${!isMe && !showAvatar ? 'ml-10' : ''}`}>
                    {/* Reply preview */}
                    {msg.replyTo && (
                      <div className="bg-black/10 rounded-t-2xl px-3 py-1.5 mb-0.5">
                        <p className={`text-[10px] truncate ${isMe ? 'text-white/70' : 'text-[#8D8D8D]'}`}>
                          {(() => {
                            const replyMsg = msgs.find(m => m.id === msg.replyTo);
                            return replyMsg ? replyMsg.content.substring(0, 30) + (replyMsg.content.length > 30 ? '...' : '') : 'Replying to message';
                          })()}
                        </p>
                      </div>
                    )}
                    {msg.type === 'image' && msg.mediaUrl && (
                      <img src={msg.mediaUrl} onClick={() => setLightboxImage(msg.mediaUrl || null)} className="rounded-2xl mb-1 max-w-full cursor-pointer hover:opacity-95 transition-opacity" alt="Shared image" />
                    )}
                    {msg.type === 'video' && msg.mediaUrl && (
                      <video src={msg.mediaUrl} className="rounded-2xl mb-1 max-w-full" controls />
                    )}
                    {msg.type === 'voice' && msg.mediaUrl && (
                      <audio src={msg.mediaUrl} className="max-w-full mb-1" controls />
                    )}
                    {msg.type === 'file' && msg.mediaUrl && (
                      <a
                        href={msg.mediaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 bg-black/10 rounded-xl px-3 py-2 mb-1 max-w-full hover:bg-black/20 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <FileText size={18} className={`shrink-0 ${isMe ? 'text-white' : 'text-[#111111]'}`} />
                        <span className={`text-sm truncate ${isMe ? 'text-white' : 'text-[#111111]'}`}>{msg.content.replace('📁 ', '')}</span>
                      </a>
                    )}
                    {msg.type === 'location' && msg.mediaUrl && (
                      <a
                        href={msg.mediaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 bg-black/10 rounded-xl px-3 py-2 mb-1 max-w-full hover:bg-black/20 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MapPin size={18} className="text-[#FF3B30] shrink-0" />
                        <span className="text-white text-sm">Open in Maps</span>
                      </a>
                    )}
                    {msg.type === 'deleted' && (
                      <div
                        className={`inline-block px-3 py-2 rounded-2xl text-[13px] italic ${
                          isMe
                            ? 'bg-[#00C300]/60 text-white/80 rounded-br-none'
                            : 'bg-white/60 text-[#8D8D8D] rounded-bl-none'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      </div>
                    )}
                    {msg.type !== 'deleted' && editingMessageId === msg.id ? (
                      <div className={`inline-block px-3 py-2 rounded-2xl text-[15px] w-full ${isMe ? 'bg-[#00C300] text-white rounded-br-none' : 'bg-white text-[#111111] rounded-bl-none'}`}>
                        <input
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); handleEditSave(msg.id); }
                            if (e.key === 'Escape') { handleEditCancel(); }
                          }}
                          autoFocus
                          aria-label="Edit message content"
                          className={`w-full bg-transparent focus:outline-none text-[15px] ${isMe ? 'text-white placeholder:text-white/50' : 'text-[#111111] placeholder:text-[#8D8D8D]'}`}
                        />
                        <div className="flex items-center gap-2 mt-2">
                          <button type="button" onClick={() => handleEditSave(msg.id)} aria-label="Save edit" className={isMe ? 'text-white/80 hover:text-white' : 'text-[#00C300] hover:text-[#00A300]'}>
                            <Check size={16} />
                          </button>
                          <button type="button" onClick={handleEditCancel} aria-label="Cancel edit" className={isMe ? 'text-white/70 hover:text-white' : 'text-[#8D8D8D] hover:text-[#111111]'}>
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`inline-block px-3 py-2 rounded-2xl text-[15px] cursor-pointer active:scale-[0.98] transition-transform ${
                          isSearchMatch ? 'ring-2 ring-[#FFD700]' : ''
                        } ${
                          isMe
                            ? 'bg-[#00C300] text-white rounded-br-none'
                            : 'bg-white text-[#111111] rounded-bl-none'
                        }`}
                        onClick={() => setSelectedReactionMsg(selectedReactionMsg === msg.id ? null : msg.id)}
                        onDoubleClick={() => setReplyingTo(msg)}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      </div>
                    )}
                    {/* Reactions */}
                    {hasReactions && (
                      <div className={`flex gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'} flex-wrap`}>
                        {Object.entries(reactions).map(([reaction, users]) => {
                          if ((users as string[]).length === 0) return null;
                          const rc = reactionEmojis.find(r => r.label === reaction);
                          if (!rc) return null;
                          const isMeReacted = (users as string[]).includes(currentUser?.id || '');
                          return (
                            <button
                              type="button"
                              key={reaction}
                              onClick={() => handleReact(msg.id, reaction)}
                              className={`rounded-full px-1.5 py-0.5 text-xs shadow-sm flex items-center gap-0.5 border transition-all hover:scale-105 ${
                                isMeReacted
                                  ? 'bg-[#00C300]/10 border-[#00C300]/30'
                                  : 'bg-white border-transparent'
                              }`}
                            >
                              <span className="text-sm">{rc.emoji}</span>
                              <span className="text-[#8D8D8D] text-[10px]">{(users as string[]).length}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className={`text-[10px] mt-1 ${isMe ? 'text-white/70 text-right' : 'text-[#8D8D8D]'}`}>
                      {formatTime(msg.timestamp)} {isMe && (
                        <span className={`inline-flex items-center ${msg.read ? 'text-blue-200' : 'text-white/70'}`}>
                          <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="inline-block">
                            {msg.read ? (
                              <>
                                <path d="M1 5L4 8L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M5 5L8 8L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </>
                            ) : (
                              <path d="M1 5L5 9L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            )}
                          </svg>
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>

                {/* Reaction Picker */}
                <AnimatePresence>
                  {selectedReactionMsg === msg.id && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 10 }}
                      className={`flex ${isMe ? 'justify-end' : 'justify-start'} mt-1`}
                    >
                      <div className="bg-white rounded-full shadow-lg px-2 py-1 flex gap-0.5">
                        {reactionEmojis.map((reaction) => (
                          <button type="button" key={reaction.label}
                            onClick={() => handleReact(msg.id, reaction.label)}
                            className="p-1.5 hover:bg-[#F5F5F5] rounded-full transition-all hover:scale-125 text-xl"
                            aria-label={`React with ${reaction.label}`}
                          >
                            {reaction.emoji}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}

          {/* Typing indicator */}
          {Object.keys(typingUsers).length > 0 && (
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl rounded-bl-none px-4 py-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-[#8D8D8D] rounded-full animate-bounce typing-dot-0" />
                  <span className="w-2 h-2 bg-[#8D8D8D] rounded-full animate-bounce typing-dot-150" />
                  <span className="w-2 h-2 bg-[#8D8D8D] rounded-full animate-bounce typing-dot-300" />
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
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="absolute bottom-24 right-4 w-10 h-10 bg-white rounded-full shadow-lg border border-[#EBEBEB] flex items-center justify-center text-[#8D8D8D] hover:text-[#111111] z-20 transition-colors"
              title="Scroll to bottom"
            >
              <ChevronDown size={20} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Reply preview */}
      <AnimatePresence>
        {replyingTo && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="shrink-0 bg-white border-t border-[#EBEBEB] px-4 py-2 flex items-center gap-2"
          >
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-[#00C300] font-medium">Replying to</p>
              <p className="text-[#8D8D8D] text-xs truncate">{replyingTo.content}</p>
            </div>
            <button type="button" onClick={() => setReplyingTo(null)} aria-label="Cancel reply" className="text-[#8D8D8D] hover:text-[#111111]">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Attachments Panel */}
      <AnimatePresence>
        {showAttachments && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 220 }}
            exit={{ height: 0 }}
            className="shrink-0 bg-[#F5F5F5] border-t border-gray-200 overflow-hidden z-10"
          >
            <div className="grid grid-cols-4 gap-y-5 px-6 pt-5 pb-8">
              {attachmentOptions.map((item, i) => (
                <div key={i} className="flex flex-col items-center gap-2 active:opacity-70">
                  <button type="button" onClick={() => {
                      if (item.label === 'Photos') {
                        photoInputRef.current?.click();
                      } else if (item.label === 'Camera') {
                        videoInputRef.current?.click();
                      } else if (item.label === 'Location') {
                        handleLocationShare();
                        setShowAttachments(false);
                      } else if (item.label === 'File') {
                        const fileEl = document.createElement('input');
                        fileEl.type = 'file';
                        fileEl.onchange = (e) => {
                          handleFileUpload(e as unknown as React.ChangeEvent<HTMLInputElement>);
                          setShowAttachments(false);
                        };
                        fileEl.click();
                      } else if (item.label === 'Audio') {
                        startRecording();
                        setShowAttachments(false);
                      } else if (item.label === 'Contact') {
                        handleContactShare();
                      } else if (item.label === 'Poll') {
                        setShowPollModal(true);
                        setShowAttachments(false);
                      }
                    }}
                    className={`w-14 h-14 ${item.color} rounded-full flex items-center justify-center text-white shadow-sm cursor-pointer`}
                  >
                    {item.icon}
                  </button>
                  <span className="text-[11px] text-[#111111]">{item.label}</span>
                </div>
              ))}
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { handleMediaUpload(e, 'image'); setShowAttachments(false); }} aria-label="Upload photo" />
              <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => { handleMediaUpload(e, 'video'); setShowAttachments(false); }} aria-label="Upload video" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* Input */}
      <div className="shrink-0 bg-[#F5F5F5] px-3 py-2.5 flex items-end gap-3 z-20">
        <button type="button" onClick={() => setShowAttachments(!showAttachments)}
          className={`p-1.5 mb-0.5 rounded-full transition-colors ${
            showAttachments ? 'bg-gray-300 text-gray-700' : 'text-gray-500 hover:bg-gray-200'
          }`}
          aria-label="Toggle attachments"
        >
          <Plus size={24} strokeWidth={1.5} />
        </button>

        {isRecording ? (
          <div className="flex-1 bg-white rounded-2xl border border-[#FF3B30] flex items-center px-4 min-h-[40px] gap-3">
            <div className="w-3 h-3 rounded-full bg-[#FF3B30] animate-pulse" />
            <span className="text-[#FF3B30] text-sm font-medium">{Math.floor(duration / 60)}:{(duration % 60).toString().padStart(2, '0')}</span>
            <span className="text-[#8D8D8D] text-xs">Recording...</span>
            <button type="button" onClick={cancelRecording} aria-label="Cancel recording" className="ml-auto text-[#8D8D8D] hover:text-[#111111]">
              <X size={18} />
            </button>
          </div>
        ) : (
          <div className="flex-1 bg-white rounded-2xl border border-gray-200 flex items-center px-3 min-h-[40px]">
              <input
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (e.target.value.trim().length > 0) {
                  sendTyping();
                } else {
                  stopTyping();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              onClick={() => setShowAttachments(false)}
              aria-label="Type a message"
              placeholder="Aa"
              className="flex-1 py-2 text-[15px] focus:outline-none bg-transparent text-[#111111] placeholder:text-[#8D8D8D]"
            />
            <button type="button" className="text-gray-400 p-1 hover:text-gray-600 transition-colors mx-1"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              aria-label="Open emoji picker"
            >
              <Smile size={20} strokeWidth={1.5} />
            </button>
            {!input.trim() && (
              <button type="button" className="text-gray-400 p-1 hover:text-gray-600 transition-colors" onClick={() => {
                  if (isRecording) {
                    handleVoiceSend();
                  } else {
                    startRecording();
                  }
                }} aria-label="Toggle voice recording">
                <Mic size={20} strokeWidth={1.5} />
              </button>
            )}
          </div>
        )}

        {isRecording ? (
          <button type="button" onClick={handleVoiceSend}
            className="mb-1 p-1.5 text-white bg-[#FF3B30] rounded-full active:scale-95 transition-transform shadow-sm"
            aria-label="Send voice message"
          >
            <Send size={18} />
          </button>
        ) : input.trim() ? (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setShowSchedulePicker(true)}
              className="mb-0.5 p-1.5 text-gray-500 hover:bg-gray-200 rounded-full transition-colors"
              title="Schedule message"
            >
              <Clock size={22} strokeWidth={1.5} />
            </button>
            <button type="button" onClick={handleSend}
              className="mb-1 p-1.5 text-white bg-[#00C300] rounded-full active:scale-95 transition-transform shadow-sm"
              aria-label="Send message"
            >
              <Send size={18} />
            </button>
          </div>
        ) : (
          <button type="button" className="mb-0.5 p-1.5 text-gray-500 hover:bg-gray-200 rounded-full transition-colors" onClick={() => setShowSchedulePicker(true)} aria-label="Schedule message">
            <Clock size={24} strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Emoji Picker */}
      <AnimatePresence>
        {showEmojiPicker && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="shrink-0 z-20 bg-[#F5F5F5] border-t border-[#EBEBEB] px-3 py-2"
          >
            <EmojiPicker onEmojiSelect={insertEmoji} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed right-4 top-24 bg-white rounded-xl shadow-xl border border-[#EBEBEB] py-1 z-50 w-40"
          >
            <button type="button" onClick={() => { setReplyingTo(contextMenu.msg); setContextMenu(null); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#111111] hover:bg-[#F5F5F5] transition-colors"
            >
              <Reply size={14} /> Reply
            </button>
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
                <button type="button" onClick={() => handleDeleteForEveryone(contextMenu.msg.id)}
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
              <h3 className="text-lg font-bold text-[#111111] mb-4">Forward to</h3>
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
                  <label className="text-[#8D8D8D] text-xs mb-1 block">Question</label>
                  <input
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    placeholder="Ask a question..."
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
                {reportOptions.map((option) => (
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
    </div>
  );
}
