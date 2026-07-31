
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, MoreHorizontal, Mic, Send, Smile, Camera,
  Image as ImageIcon, MapPin, File as FileIcon, User, Plus, Users, Phone, UserPlus, Settings, LogOut,
  Search, X, Copy, Trash2, Reply, Forward, Heart, ThumbsUp, Laugh, Flame, Star,
  Clock, FileText, ArrowRight, Calendar, Edit, CheckCircle, Crown
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useGroupStore } from '@/store/useGroupStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { useTyping } from '@/hooks/useTyping';
import { useOfflineQueue, isOnline } from '@/hooks/useOfflineQueue';
import { useScheduledMessages } from '@/hooks/useScheduledMessages';
import { formatTime } from '@/lib/utils';
import type { Message } from '@/types';
import { toast } from 'sonner';

const reactionEmojis = [
  { icon: ThumbsUp, label: 'like', color: 'text-[#2196F3]' },
  { icon: Heart, label: 'love', color: 'text-[#FF3B30]' },
  { icon: Laugh, label: 'laugh', color: 'text-[#FF9800]' },
  { icon: Star, label: 'wow', color: 'text-[#8B5CF6]' },
  { icon: Flame, label: 'fire', color: 'text-[#FF5722]' },
];

const quickEmojis = ['\u{1F44D}', '\u{2764}', '\u{1F602}', '\u{1F62E}', '\u{1F64F}', '\u{1F525}'];

function formatDateSeparator(date: Date) {
  const now = new Date();
  const d = new Date(date);
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

const attachmentOptions = [
  { icon: <ImageIcon size={28} strokeWidth={1.5} />, label: 'Photos', color: 'bg-[#4CAF50]' },
  { icon: <Camera size={28} strokeWidth={1.5} />, label: 'Camera', color: 'bg-[#2196F3]' },
  { icon: <Phone size={28} strokeWidth={1.5} />, label: 'Audio', color: 'bg-[#00C300]' },
  { icon: <User size={28} strokeWidth={1.5} />, label: 'Contact', color: 'bg-[#FF9800]' },
  { icon: <MapPin size={28} strokeWidth={1.5} />, label: 'Location', color: 'bg-[#E91E63]' },
  { icon: <FileIcon size={28} strokeWidth={1.5} />, label: 'File', color: 'bg-[#673AB7]' },
];

export default function GroupChatPage() {
  const navigate = useNavigate();
  const _params = useParams();
  const groupId = (_params as { groupId?: string }).groupId;
  const { user: currentUser } = useAuthStore();
  const {
    groups, groupMessages, subscribeGroupMessages, sendGroupMessage,
    deleteGroupMessage, deleteGroupMessageForEveryone, addGroupReaction, leaveGroup, editGroupMessage
  } = useGroupStore();
  const { friends } = useFriendStore();
  const { isRecording, duration, startRecording, stopRecording, cancelRecording } = useVoiceRecorder();

  const [input, setInput] = useState('');
  const [showAttachments, setShowAttachments] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [, setIsUploading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [contextMenu, setContextMenu] = useState<{ msg: Message; x: number; y: number } | null>(null);
  const [selectedReactionMsg, setSelectedReactionMsg] = useState<string | null>(null);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [pendingSchedules, setPendingSchedules] = useState<ReturnType<typeof getPending>>([]);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editInput, setEditInput] = useState('');
  const { typingUsers, sendTyping, stopTyping } = useTyping(groupId);
  const { queueMessage } = useOfflineQueue();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  void showEmojiPicker; // reserved for future emoji picker integration

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const sendGroupMessageForScheduler = useCallback(
    async (chatId: string, senderId: string, content: string, type?: string, mediaUrl?: string, replyTo?: Message | string) => {
      const replyId = (typeof replyTo === 'string' ? replyTo : replyTo?.id) || '';
      await sendGroupMessage(chatId, senderId, content, type || 'text', mediaUrl, replyId);
    },
    [sendGroupMessage]
  );

  const { schedule, getPending } = useScheduledMessages(groupId || '', sendGroupMessageForScheduler);

  // Refresh pending scheduled messages periodically
  useEffect(() => {
    setPendingSchedules(getPending());
    const interval = setInterval(() => setPendingSchedules(getPending()), 5000);
    return () => clearInterval(interval);
  }, [groupId, getPending]);

  const group = useMemo(() => groups.find(g => g.id === groupId), [groups, groupId]);
  const msgs = useMemo(() => groupId ? (groupMessages[groupId] || []) : [], [groupMessages, groupId]);
  const participants = useMemo(() => group?.participants || [], [group]);
  const memberCount = participants.length;

  const filteredMsgs = useMemo(() =>
    searchQuery ? msgs.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase())) : msgs,
    [msgs, searchQuery]
  );

  useEffect(() => {
    if (!groupId) return;
    const unsub = subscribeGroupMessages(groupId);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // Scroll to bottom only when user was already at bottom
  const shouldAutoScrollRef = useRef(true);
  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [msgs.length]);

  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Track scroll position to determine auto-scroll behavior
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      shouldAutoScrollRef.current = atBottom;
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [groupId]);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // Stop typing on unmount
  useEffect(() => {
    return () => { stopTyping(); };
  }, [stopTyping]);

  const getSenderName = useCallback((senderId: string) => {
    if (senderId === 'system') return 'System';
    if (senderId === currentUser?.id) return 'You';
    const f = friends.find(f => f.id === senderId);
    return f?.name || 'Member';
  }, [currentUser?.id, friends]);

  const getSenderAvatar = useCallback((senderId: string) => {
    if (senderId === currentUser?.id) return currentUser?.avatar;
    const f = friends.find(f => f.id === senderId);
    return f?.avatar;
  }, [currentUser?.id, currentUser?.avatar, friends]);

  const handleSend = async () => {
    if (!input.trim() || !currentUser || !groupId) return;
    stopTyping();
    if (!isOnline()) {
      queueMessage({ type: 'group', chatId: groupId, senderId: currentUser.id, content: input.trim(), replyTo: replyingTo?.id });
      setInput('');
      setShowAttachments(false);
      setReplyingTo(null);
      return;
    }
    try {
      await sendGroupMessage(groupId, currentUser.id, input.trim(), 'text', undefined, replyingTo?.id);
      setInput('');
      setShowAttachments(false);
      setReplyingTo(null);
    } catch {
      toast.error('Failed to send message');
    }
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>, mediaType: string) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser || !groupId) return;
    setIsUploading(true);
    try {
      const { uploadMediaBlob } = await import('@/lib/storage');
      const url = await uploadMediaBlob({ kind: 'chats', chatId: groupId, file, mimeType: file.type });
      await sendGroupMessage(groupId, currentUser.id, mediaType === 'image' ? '\u{1F4F7} Photo' : '\u{1F4F9} Video', mediaType, url);
    } catch {
      toast.error('Failed to upload media');
    }
    setIsUploading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser || !groupId) return;
    setIsUploading(true);
    try {
      const { uploadMediaBlob } = await import('@/lib/storage');
      const url = await uploadMediaBlob({ kind: 'chats', chatId: groupId, file, mimeType: file.type });
      await sendGroupMessage(groupId, currentUser.id, `\u{1F4C1} ${file.name}`, 'file', url);
    } catch {
      toast.error('Failed to upload file');
    }
    setIsUploading(false);
  };

  const handleVoiceSend = async () => {
    if (!currentUser || !groupId) return;
    const blob = await stopRecording();
    if (!blob) return;
    try {
      const { uploadMediaBlob } = await import('@/lib/storage');
      const file = new File([blob], 'voice-message.webm', { type: 'audio/webm' });
      const url = await uploadMediaBlob({ kind: 'voice', chatId: groupId, file, mimeType: 'audio/webm' });
      await sendGroupMessage(groupId, currentUser.id, '\u{1F3A4} Voice message', 'voice', url);
    } catch {
      toast.error('Failed to send voice message');
    }
  };

  const handleLocationShare = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (!currentUser || !groupId) return;
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const url = `https://www.google.com/maps?q=${lat},${lng}`;
        await sendGroupMessage(groupId, currentUser.id, `\u{1F4CD} Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, 'location', url);
        toast.success('Location shared');
      },
      (/* err */) => { toast.error('Location access denied'); }
    );
  };

  const handleContactShare = async () => {
    if (!currentUser || !groupId) return;
    try {
      await sendGroupMessage(groupId, currentUser.id, `\u{1F464} Contact: ${currentUser.name}`, 'contact');
      toast.success('Contact shared');
    } catch {
      toast.error('Failed to share contact');
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Message copied');
    setContextMenu(null);
  };

  const handleDelete = (msgId: string) => {
    deleteGroupMessage(groupId || '', msgId);
    toast.success('Message deleted');
    setContextMenu(null);
  };

  const handleReact = (msgId: string, reaction: string) => {
    if (currentUser && groupId) {
      addGroupReaction(groupId, msgId, reaction, currentUser.id);
    }
    setSelectedReactionMsg(null);
    setContextMenu(null);
  };

  const handleContextMenu = (e: React.MouseEvent, msg: Message) => {
    e.preventDefault();
    setContextMenu({ msg, x: e.clientX, y: e.clientY });
  };

  const handleForward = async (targetChatId: string) => {
    if (!forwardMsg || !currentUser || !groupId) return;
    try {
      await sendGroupMessage(targetChatId, currentUser.id, forwardMsg.content, forwardMsg.type, forwardMsg.mediaUrl);
      toast.success('Message forwarded');
      setShowForwardModal(false);
      setForwardMsg(null);
    } catch {
      toast.error('Failed to forward message');
    }
  };

  const handleScheduleSend = async () => {
    if (!input.trim() || !currentUser || !groupId || !scheduleDate) return;
    const scheduledTime = new Date(scheduleDate).getTime();
    if (scheduledTime <= Date.now()) {
      toast.error('Please select a future time');
      return;
    }
    try {
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

  const handleEditMessage = async () => {
    if (!editingMessage || !groupId) return;
    try {
      await editGroupMessage(groupId, editingMessage.id, editInput);
      toast.success('Message edited');
      setShowEditModal(false);
      setEditingMessage(null);
      setEditInput('');
    } catch {
      toast.error('Failed to edit message');
    }
  };

  const menuItems = [
    { icon: UserPlus, label: 'Add Member', action: () => { navigate(`/add-friends`); setShowMenu(false); } },
    { icon: Users, label: 'View Members', action: () => { setShowMembersModal(true); setShowMenu(false); } },
    { icon: Settings, label: 'Group Settings', action: () => { if (groupId) { navigate(`/group-info/${groupId}`); } setShowMenu(false); } },
    { icon: LogOut, label: 'Leave Group', action: () => { if (groupId && currentUser) { leaveGroup(groupId, currentUser.id); navigate('/chats'); } } },
  ];

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

  if (!group) {
    return (
      <div className="h-[100dvh] bg-[#8BA3C7] flex items-center justify-center">
        <div className="text-center text-white">
          <Users size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">Group not found</p>
          <button type="button" onClick={() => navigate('/chats')} className="mt-4 text-sm underline">Go back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#8BA3C7]">
      {/* Header */}
      <div className="shrink-0 flex justify-between items-center px-2 py-3 bg-white border-b border-[#EBEBEB] z-10">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 active:bg-gray-100 rounded-full text-[#111111]">
            <ChevronLeft size={28} strokeWidth={1.5} />
          </button>
          <div className="w-9 h-9 rounded-full bg-[#00C300]/10 flex items-center justify-center shrink-0">
            {group.avatar ? (
              <img src={group.avatar} className="w-full h-full object-cover rounded-full" alt="User avatar" />
            ) : (
              <Users size={18} className="text-[#00C300]" />
            )}
          </div>
          <div>
            <h3 className="text-base font-bold text-[#111111] leading-tight">{group.name || 'Group'}</h3>
            <p className="text-[11px] text-[#8D8D8D]">{memberCount} members</p>
          </div>
        </div>
        <div className="flex items-center gap-4 pr-3 text-[#111111]">
          <button type="button" onClick={() => setShowSearch(!showSearch)} className="active:opacity-60" title="Search messages">
            <Search size={22} strokeWidth={1.5} className={showSearch ? 'text-[#00C300]' : ''} />
          </button>
          <button type="button" className="active:opacity-60" onClick={() => navigate('/call', { state: { userId: participants.find(p => p !== currentUser?.id), mode: 'voice' } })}><Phone size={22} strokeWidth={1.5} /></button>
          <button type="button" onClick={() => setShowMenu(!showMenu)} className="active:opacity-60 relative">
            <MoreHorizontal size={22} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {showMenu && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-16 right-4 bg-white rounded-xl shadow-lg border border-[#EBEBEB] z-30 overflow-hidden w-48"
          >
            {menuItems.map((item, i) => (
              <button type="button" key={i}
                onClick={() => { item.action(); setShowMenu(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#F5F5F5] active:bg-gray-100 transition-colors"
              >
                <item.icon size={18} className={item.label === 'Leave Group' ? 'text-[#FF3B30]' : 'text-[#8D8D8D]'} />
                <span className={`text-sm ${item.label === 'Leave Group' ? 'text-[#FF3B30]' : 'text-[#111111]'}`}>{item.label}</span>
              </button>
            ))}
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
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search messages..."
                className="flex-1 bg-[#F5F5F5] rounded-xl px-3 py-2 text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#8D8D8D]"
              />
              <button type="button" onClick={() => { setShowSearch(false); setSearchQuery(''); }} className="text-[#8D8D8D]">
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

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 scrollbar-hide">
        <div className="space-y-4">
          {/* Group info banner */}
          <div className="flex justify-center my-4">
            <div className="bg-black/20 text-white text-center text-[11px] px-4 py-2 rounded-2xl backdrop-blur-sm max-w-[80%]">
              <p className="font-medium text-xs mb-0.5">{group.name}</p>
              <p className="opacity-80">{group.description || `${memberCount} members`}</p>
            </div>
          </div>

          {filteredMsgs.map((msg) => {
            const isMe = msg.senderId === currentUser?.id;
            const isSystem = msg.senderId === 'system';
            const msgDate = formatDateSeparator(msg.timestamp);
            const showDate = dateSeparatorMap.get(msg.id) || false;
            const isSearchMatch = searchQuery && msg.content.toLowerCase().includes(searchQuery.toLowerCase());
            const reactions = msg.reactions || {};
            const hasReactions = Object.values(reactions).some((users: string[]) => users.length > 0);

            if (isSystem) {
              return (
                <div key={msg.id} className="flex justify-center my-2">
                  <span className="bg-black/15 text-white text-[10px] px-3 py-1 rounded-full">{msg.content}</span>
                </div>
              );
            }

            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="flex justify-center my-4">
                    <span className="bg-black/20 text-white text-[11px] px-3 py-1 rounded-full backdrop-blur-sm">{msgDate}</span>
                  </div>
                )}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                  onContextMenu={(e) => handleContextMenu(e, msg)}
                >
                  {!isMe && (
                    <div className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center mr-2 self-end shrink-0 overflow-hidden">
                      {getSenderAvatar(msg.senderId) ? (
                        <img src={getSenderAvatar(msg.senderId)} className="w-full h-full object-cover" alt="User avatar" />
                      ) : (
                        <span className="text-[#8D8D8D] text-xs font-bold">{getSenderName(msg.senderId)[0]}</span>
                      )}
                    </div>
                  )}
                  <div className="max-w-[70%]">
                    {!isMe && <p className="text-[10px] text-gray-200 ml-1 mb-0.5">{getSenderName(msg.senderId)}</p>}
                    {msg.replyTo && (
                      <div className="bg-black/10 rounded-t-2xl px-3 py-1.5 mb-0.5">
                        <p className="text-white/70 text-[10px] truncate">Replying to message</p>
                      </div>
                    )}
                    {msg.type === 'image' && msg.mediaUrl && (
                      <img src={msg.mediaUrl} className="rounded-2xl mb-1 max-w-full cursor-pointer hover:opacity-95 transition-opacity" alt="Shared image" />
                    )}
                    {msg.type === 'video' && msg.mediaUrl && (
                      <video src={msg.mediaUrl} className="rounded-2xl mb-1 max-w-full" controls />
                    )}
                    {msg.type === 'voice' && msg.mediaUrl && (
                      <audio src={msg.mediaUrl} className="max-w-full mb-1" controls />
                    )}
                    {msg.type === 'file' && msg.mediaUrl && (
                      <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-black/10 rounded-xl px-3 py-2 mb-1 max-w-full hover:bg-black/20 transition-colors" onClick={(e) => e.stopPropagation()}>
                        <FileText size={18} className="text-white shrink-0" />
                        <span className="text-white text-sm truncate">{msg.content.replace('\ud83d\udcc1 ', '')}</span>
                      </a>
                    )}
                    {msg.type === 'location' && msg.mediaUrl && (
                      <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-black/10 rounded-xl px-3 py-2 mb-1 max-w-full hover:bg-black/20 transition-colors" onClick={(e) => e.stopPropagation()}>
                        <MapPin size={18} className="text-[#FF3B30] shrink-0" />
                        <span className="text-white text-sm">Open in Maps</span>
                      </a>
                    )}
                    <div
                      className={`inline-block px-3 py-2 rounded-2xl text-[15px] cursor-pointer active:scale-[0.98] transition-transform ${isSearchMatch ? 'ring-2 ring-[#FFD700]' : ''} ${
                        isMe ? 'bg-[#00C300] text-white rounded-br-none' : 'bg-white text-[#111111] rounded-bl-none'
                      }`}
                      onClick={() => setSelectedReactionMsg(selectedReactionMsg === msg.id ? null : msg.id)}
                      onDoubleClick={() => setReplyingTo(msg)}
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    </div>
                    {/* Reactions */}
                    {hasReactions && (
                      <div className={`flex gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                        {Object.entries(reactions).map(([reaction, users]) => {
                          if ((users as string[]).length === 0) return null;
                          const rc = reactionEmojis.find(r => r.label === reaction);
                          if (!rc) return null;
                          return (
                            <span key={reaction} className="bg-white rounded-full px-1.5 py-0.5 text-xs shadow-sm flex items-center gap-0.5">
                              <rc.icon size={12} className={rc.color} />
                              <span className="text-[#8D8D8D] text-[10px]">{(users as string[]).length}</span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <div className={`text-[10px] mt-1 ${isMe ? 'text-white text-right' : 'text-gray-200'}`}>
                {formatTime(msg.timestamp)} {msg.edited && '(edited)'} {isMe && <span>{msg.read ? '\u2713\u2713' : '\u2713'}</span>}
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
                      <div className="bg-white rounded-full shadow-lg px-2 py-1 flex gap-1">
                        {reactionEmojis.map((reaction) => (
                          <button type="button" key={reaction.label}
                            onClick={() => handleReact(msg.id, reaction.label)}
                            className="p-1 hover:bg-[#F5F5F5] rounded-full transition-colors"
                          >
                            <reaction.icon size={20} className={reaction.color} />
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
          {Object.entries(typingUsers).length > 0 && (
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl rounded-bl-none px-4 py-2 flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-[#8D8D8D] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-[#8D8D8D] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-[#8D8D8D] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-[#8D8D8D]">
                  {Object.values(typingUsers).slice(0, 2).join(', ')} {Object.keys(typingUsers).length > 2 ? `+${Object.keys(typingUsers).length - 2} more` : ''} typing
                </span>
              </div>
            </div>
          )}

          {/* Quick emoji reactions */}
          {msgs.length > 0 && !searchQuery && (
            <div className="flex justify-center gap-2 py-2">
              {quickEmojis.map(emoji => (
                <button type="button" key={emoji}
                  onClick={() => currentUser && groupId && sendGroupMessage(groupId, currentUser.id, emoji)}
                  className="w-8 h-8 rounded-full bg-white/40 hover:bg-white/70 flex items-center justify-center text-lg transition-all active:scale-90"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
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
              <p className="text-[10px] text-[#00C300] font-medium">Replying to {getSenderName(replyingTo.senderId)}</p>
              <p className="text-[#8D8D8D] text-xs truncate">{replyingTo.content}</p>
            </div>
            <button type="button" onClick={() => setReplyingTo(null)} className="text-[#8D8D8D] hover:text-[#111111]">
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
                      }
                    }}
                    className={`w-14 h-14 ${item.color} rounded-full flex items-center justify-center text-white shadow-sm cursor-pointer`}
                  >
                    {item.icon}
                  </button>
                  <span className="text-[11px] text-[#111111]">{item.label}</span>
                </div>
              ))}
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { handleMediaUpload(e, 'image'); setShowAttachments(false); }} />
              <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => { handleMediaUpload(e, 'video'); setShowAttachments(false); }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pending Scheduled Messages Indicator */}
      {pendingSchedules.length > 0 && (
        <div className="shrink-0 bg-[#8B5CF6]/10 px-3 py-1.5 flex items-center gap-2 z-20">
          <Clock size={14} className="text-[#8B5CF6]" />
          <span className="text-xs text-[#8B5CF6] font-medium">
            {pendingSchedules.length} scheduled message{pendingSchedules.length > 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 bg-[#F5F5F5] px-3 py-2.5 flex items-end gap-3 z-20">
        <button type="button" onClick={() => setShowAttachments(!showAttachments)}
          className={`p-1.5 mb-0.5 rounded-full transition-colors ${showAttachments ? 'bg-gray-300 text-gray-700' : 'text-gray-500 hover:bg-gray-200'}`}
        >
          <Plus size={24} strokeWidth={1.5} />
        </button>

        {isRecording ? (
          <div className="flex-1 bg-white rounded-2xl border border-[#FF3B30] flex items-center px-4 min-h-[40px] gap-3">
            <div className="w-3 h-3 rounded-full bg-[#FF3B30] animate-pulse" />
            <span className="text-[#FF3B30] text-sm font-medium">{Math.floor(duration / 60)}:{(duration % 60).toString().padStart(2, '0')}</span>
            <span className="text-[#8D8D8D] text-xs">Recording...</span>
            <button type="button" onClick={cancelRecording} className="ml-auto text-[#8D8D8D] hover:text-[#111111]">
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
                if (e.target.value.trim()) sendTyping(); else stopTyping();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              onBlur={() => stopTyping()}
              onClick={() => setShowAttachments(false)}
              placeholder="Aa"
              className="flex-1 py-2 text-[15px] focus:outline-none bg-transparent text-[#111111] placeholder:text-[#8D8D8D]"
            />
            <button type="button" className="text-gray-400 p-1 hover:text-gray-600 transition-colors mx-1"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            >
              <Smile size={20} strokeWidth={1.5} />
            </button>
            <button type="button" className="text-gray-400 p-1 hover:text-gray-600 transition-colors"
              onClick={() => {
                if (isRecording) { handleVoiceSend(); } else { startRecording(); }
              }}
            >
              <Mic size={20} strokeWidth={1.5} />
            </button>
          </div>
        )}

        {isRecording ? (
          <button type="button" onClick={handleVoiceSend}
            className="mb-1 p-1.5 text-white bg-[#FF3B30] rounded-full active:scale-95 transition-transform shadow-sm"
          >
            <Send size={18} />
          </button>
        ) : input.trim() ? (
          <button type="button" onClick={handleSend}
            className="mb-1 p-1.5 text-white bg-[#00C300] rounded-full active:scale-95 transition-transform shadow-sm"
          >
            <Send size={18} />
          </button>
        ) : (
          <button type="button" className="mb-0.5 p-1.5 text-gray-500 hover:bg-gray-200 rounded-full transition-colors"
            onClick={() => setShowSchedulePicker(true)}
          >
            <Clock size={24} strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{ top: Math.min(contextMenu.y, window.innerHeight - 200), left: Math.min(contextMenu.x, window.innerWidth - 160) }}
            className="fixed bg-white rounded-xl shadow-xl border border-[#EBEBEB] py-1 z-50 w-40"
          >
            <button type="button" onClick={() => { setReplyingTo(contextMenu.msg); setContextMenu(null); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#111111] hover:bg-[#F5F5F5] transition-colors"
            >
              <Reply size={14} /> Reply
            </button>
            <button type="button" onClick={() => handleCopy(contextMenu.msg.content)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#111111] hover:bg-[#F5F5F5] transition-colors"
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
                <button type="button" onClick={() => {
                  setEditingMessage(contextMenu.msg);
                  setEditInput(contextMenu.msg.content);
                  setShowEditModal(true);
                  setContextMenu(null);
                }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#111111] hover:bg-[#F5F5F5] transition-colors"
                >
                  <Edit size={14} /> Edit
                </button>
                <button type="button" onClick={() => {
                  if (groupId) {
                    deleteGroupMessageForEveryone(groupId, contextMenu.msg.id);
                    toast.success('Message deleted for everyone');
                    setContextMenu(null);
                  }
                }}
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

      {/* View Members Modal */}
      <AnimatePresence>
        {showMembersModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowMembersModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full max-h-[80vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-[#111111] flex items-center gap-2">
                  <Users size={20} className="text-[#00C300]" /> Group Members
                </h3>
                <button type="button" onClick={() => setShowMembersModal(false)} className="text-[#8D8D8D] hover:text-[#111111]">
                  <X size={20} />
                </button>
              </div>
              <p className="text-[#8D8D8D] text-xs mb-3">{memberCount} members total</p>
              <div className="space-y-2">
                {participants.map((pId) => {
                  const friend = friends.find((f) => f.id === pId);
                  const isCurrentUser = pId === currentUser?.id;
                  const isAdmin = group?.admins?.includes(pId);
                  const name = isCurrentUser ? 'You' : (friend?.name || 'Member');
                  const avatar = isCurrentUser ? (currentUser?.avatar || '') : (friend?.avatar || '');

                  return (
                    <div key={pId} className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#F5F5F5] transition-colors">
                      <div className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center shrink-0 overflow-hidden">
                        {avatar ? (
                          <img src={avatar} className="w-full h-full object-cover" alt="User avatar" />
                        ) : (
                          <User size={18} className="text-[#8D8D8D]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <p className="text-[#111111] text-sm font-medium truncate">{name}</p>
                          {isAdmin && (
                            <Crown size={12} className="text-[#FFD700] fill-[#FFD700]" />
                          )}
                        </div>
                        <p className="text-[#8D8D8D] text-xs truncate">
                          {isCurrentUser ? 'This is you' : (friend?.statusMessage || 'Member')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={() => setShowMembersModal(false)}
                className="w-full mt-4 py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Message Modal */}
      <AnimatePresence>
        {showEditModal && editingMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowEditModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-[#111111] mb-4 flex items-center gap-2">
                <Edit size={20} className="text-[#8B5CF6]" /> Edit Message
              </h3>
              <textarea
                value={editInput}
                onChange={(e) => setEditInput(e.target.value)}
                className="w-full bg-[#F5F5F5] rounded-xl px-3 py-3 text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] min-h-[100px]"
                placeholder="Edit your message..."
                autoFocus
              />
              <div className="flex gap-2 mt-4">
                <button type="button" onClick={() => {
                  setShowEditModal(false);
                  setEditingMessage(null);
                  setEditInput('');
                }}
                  className="flex-1 py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold"
                >
                  Cancel
                </button>
                <button type="button" onClick={handleEditMessage}
                  disabled={!editInput.trim()}
                  className="flex-1 py-3 bg-[#8B5CF6] text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  <CheckCircle size={16} /> Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                {groups.length === 0 ? (
                  <p className="text-[#8D8D8D] text-sm text-center py-4">No groups to forward to</p>
                ) : (
                  groups.map((g) => (
                    <button type="button" key={g.id}
                      onClick={async () => { await handleForward(g.id); }}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#F5F5F5] transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-[#00C300]/10 flex items-center justify-center shrink-0">
                        <Users size={18} className="text-[#00C300]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[#111111] text-sm font-medium truncate">{g.name}</p>
                        <p className="text-[#8D8D8D] text-xs truncate">{g.participants.length} members</p>
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
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="w-full bg-[#F5F5F5] rounded-xl px-3 py-3 text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]"
              />
              <p className="text-[#8D8D8D] text-xs mt-2 mb-4">Message: {input || 'No message'}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowSchedulePicker(false)} className="flex-1 py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold">
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
    </div>
  );
}
