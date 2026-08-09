import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Users, Image as ImageIcon, FileText, Link, Trash2,
  Download, ChevronRight, Search, X, Loader, Volume2, VolumeX,
  Archive, RotateCcw, Star, Lock, Unlock, Clock
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { useGroupStore } from '@/store/useGroupStore';
import { useFriendStore } from '@/store/useFriendStore';
import { isFirestoreAvailable } from '@/lib/firestore';
import { getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
import { toast } from 'sonner';
import type { Message, User } from '@/types';

export default function ChatInfoPage() {
  const _params = useParams();
  const chatId = (_params as { chatId?: string }).chatId;
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();
  const { chats, archiveChat, unarchiveChat, getSharedMedia, setDisappearingMessages, lockChat, unlockChat } = useChatStore();
  const { groups } = useGroupStore();
  const { friends, toggleFavorite } = useFriendStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [activeMediaTab, setActiveMediaTab] = useState<'media' | 'files' | 'links'>('media');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showFullParticipants, setShowFullParticipants] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [disappearingTimer, setDisappearingTimer] = useState<number>(0);
  const [showDisappearingPicker, setShowDisappearingPicker] = useState(false);
  const [isChatLocked, setIsChatLocked] = useState(false);
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false);
  const [unlockPinInput, setUnlockPinInput] = useState('');
  const [unlockPinError, setUnlockPinError] = useState('');
  const [lockPinInput, setLockPinInput] = useState('');
  const [isFavorited, setIsFavorited] = useState(false);

  const chat = useMemo(() => {
    const direct = chats.find(c => c.id === chatId);
    const group = groups.find(g => g.id === chatId);
    return direct || group || null;
  }, [chats, groups, chatId]);

  const isGroup = chat?.type === 'group';
  const isDirect = !isGroup;

  const participants = useMemo(() => {
    if (!chat) return [];
    const participantIds = chat.participants || [];
    return participantIds.map(id => {
      const friend = friends.find(f => f.id === id);
      if (friend) return friend;
      if (id === currentUser?.id) return currentUser as User;
      return { id, name: 'Unknown', username: 'unknown' } as User;
    }).filter(Boolean) as User[];
  }, [chat, friends, currentUser]);

  const otherUser = useMemo(() => {
    if (isGroup || !chat) return null;
    return participants.find(p => p.id !== currentUser?.id) || null;
  }, [participants, currentUser, isGroup, chat]);

  // Load shared media using store method
  useEffect(() => {
    if (!chatId) return;
    setLoadingMessages(true);
    const load = async () => {
      try {
        const media = await getSharedMedia(chatId);
        setMessages(media);
      } catch {
        // ignore
      }
      setLoadingMessages(false);
    };
    load();
  }, [chatId, getSharedMedia]);

  // Load disappearing messages setting
  useEffect(() => {
    if (!chatId) return;
    const c = chats.find(c => c.id === chatId);
    if (c && c.disappearingMessages !== undefined) {
      setDisappearingTimer(c.disappearingMessages || 0);
    }
  }, [chatId, chats]);

  // Load chat lock status
  useEffect(() => {
    if (!chatId) return;
    const c = chats.find(c => c.id === chatId);
    if (c) {
      setIsChatLocked(!!c.chatLocked);
    }
  }, [chatId, chats]);

  // Load favorite status for other user
  useEffect(() => {
    if (!otherUser || !currentUser) return;
    const fav = currentUser.favorites?.includes(otherUser.id) || false;
    setIsFavorited(fav);
  }, [otherUser, currentUser]);

  // Check mute status
  useEffect(() => {
    if (!chatId || !currentUser) return;
    const key = `muted_${chatId}_${currentUser.id}`;
    setIsMuted(localStorage.getItem(key) === 'true');
  }, [chatId, currentUser]);

  const mediaMessages = useMemo(() =>
    messages.filter(m => m.type === 'image' || m.type === 'video'),
    [messages]);

  const fileMessages = useMemo(() =>
    messages.filter(m => m.type === 'file'),
    [messages]);

  const linkMessages = useMemo(() =>
    messages.filter(m => m.type === 'text' && /https?:\/\/\S+/.test(m.content)),
    [messages]);

  const handleToggleMute = () => {
    if (!chatId || !currentUser) return;
    const key = `muted_${chatId}_${currentUser.id}`;
    const next = !isMuted;
    localStorage.setItem(key, String(next));
    setIsMuted(next);
    toast.success(next ? 'Chat muted' : 'Chat unmuted');
  };

  const handleClearChat = async () => {
    if (!chatId) return;
    if (!isFirestoreAvailable()) {
      toast.error('Offline');
      return;
    }

    setShowClearConfirm(false);
    try {
      // Correct Firestore subcollection path: chats/{chatId}/messages
      const { querySubcollection, deleteSubcollectionDoc, COLLECTIONS } = await import('@/lib/firestore');
      const msgs = await querySubcollection(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, []);
      await Promise.all(
        msgs.map((msg: { id: string }) => deleteSubcollectionDoc(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, msg.id)),
      );
      toast.success('Chat cleared');
      setMessages([]);
    } catch {
      toast.error('Failed to clear chat');
    }
  };

  const handleExportChat = () => {
    if (!chat) return;
    const data = {
      chat: { id: chat.id, name: chat.name, type: chat.type },
      messages: messages.map(m => ({
        sender: participants.find(p => p.id === m.senderId)?.name || 'Unknown',
        content: m.content,
        type: m.type,
        timestamp: m.timestamp,
      })),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-${chat.id}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Chat exported');
  };

  const handleToggleFavorite = async () => {
    if (!otherUser || !currentUser) return;
    await toggleFavorite(otherUser.id, currentUser.id, currentUser.favorites || []);
    setIsFavorited(!isFavorited);
    toast.success(isFavorited ? 'Removed from favorites' : 'Added to favorites');
  };

  const handleSetDisappearing = async (seconds: number) => {
    if (!chatId) return;
    await setDisappearingMessages(chatId, seconds);
    setDisappearingTimer(seconds);
    setShowDisappearingPicker(false);
    toast.success(seconds === 0 ? 'Disappearing messages off' : `Disappearing messages set to ${seconds === 86400 ? '24 hours' : seconds === 604800 ? '7 days' : '90 days'}`);
  };

  const handleToggleChatLock = async () => {
    if (!chatId || !currentUser) return;
    if (isChatLocked) {
      // G3: require PIN confirmation before unlocking from ChatInfoPage
      setUnlockPinInput('');
      setUnlockPinError('');
      setShowUnlockConfirm(true);
    } else {
      setShowLockConfirm(true);
    }
  };

  const handleUnlockFromInfo = async () => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat?.lockValue) {
      setUnlockPinError('No PIN configured.');
      return;
    }
    const storedPin = chat.lockValue;
    const pin = unlockPinInput;
    let matched: boolean;
    if (storedPin.length === 64) {
      try {
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(pin));
        const hex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        matched = hex.length === storedPin.length && [...hex].every((c, i) => c === storedPin[i]);
      } catch { matched = false; }
    } else {
      matched = pin.length === storedPin.length && [...pin].every((c, i) => c === storedPin[i]);
    }
    if (!matched) {
      setUnlockPinError('Incorrect PIN. Please try again.');
      return;
    }
    await unlockChat(chatId!);
    setIsChatLocked(false);
    setShowUnlockConfirm(false);
    toast.success('Chat unlocked');
  };

  const handleLockChat = async (lockType: 'pin' | 'biometric', lockValue: string) => {
    if (!chatId) return;
    await lockChat(chatId, lockType, lockValue);
    setIsChatLocked(true);
    setShowLockConfirm(false);
    toast.success('Chat locked with PIN');
  };

  const filteredParticipants = participants.filter(p =>
    p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!chat) {
    return (
      <div className="min-h-[100dvh] bg-[#F5F5F5] flex items-center justify-center">
        <div className="text-center">
          <Loader size={32} className="animate-spin text-[#00C300] mx-auto mb-2" />
          <p className="text-[#8D8D8D] text-sm">Loading chat info...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#F5F5F5]">
      {/* Header */}
      <div className="bg-white border-b border-[#EBEBEB] sticky top-0 z-10">
        <div className="flex items-center gap-3 p-4">
          <button type="button" onClick={() => navigate(-1)} aria-label="Go back" className="p-2 -ml-2 hover:bg-[#F5F5F5] rounded-full text-[#111111]">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-lg font-bold text-[#111111] flex-1">Chat Info</h1>
          <button type="button" onClick={() => setShowSearch(!showSearch)} aria-label={showSearch ? 'Close search' : 'Open search'}
            className="p-2 hover:bg-[#F5F5F5] rounded-full text-[#8D8D8D]"
          >
            {showSearch ? <X size={20} /> : <Search size={20} />}
          </button>
        </div>
        {showSearch && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="px-4 pb-3">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search participants..."
              autoFocus
              className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#8D8D8D]"
            />
          </motion.div>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Chat Header Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-[#EBEBEB] p-6 text-center"
        >
          <div className="w-20 h-20 rounded-full bg-[#F5F5F5] mx-auto mb-3 overflow-hidden flex items-center justify-center">
            {isDirect && otherUser ? (
              sanitizeMediaUrl(otherUser.avatar) ? (
                <img src={sanitizeMediaUrl(otherUser.avatar)} className="w-full h-full object-cover" alt="User avatar" />
              ) : (
                <img src={getDefaultAvatar(otherUser.id)} className="w-full h-full object-cover" alt="User avatar" />
              )
            ) : chat.avatar ? (
              <img src={sanitizeMediaUrl(chat.avatar)} className="w-full h-full object-cover" alt="User avatar" />
            ) : (
              <Users size={32} className="text-[#8D8D8D]" />
            )}
          </div>
          <h2 className="text-xl font-bold text-[#111111]">
            {isDirect && otherUser ? otherUser.name : chat.name || 'Chat'}
          </h2>
          <p className="text-[#8D8D8D] text-sm mt-1">
            {isDirect && otherUser
              ? (otherUser.statusMessage || 'Direct Message')
              : `${participants.length} members · ${isGroup ? 'Group' : 'Direct'}`}
          </p>
          {isDirect && otherUser?.username && (
            <p className="text-[#8D8D8D] text-xs mt-0.5">@{otherUser.username}</p>
          )}
          {isDirect && otherUser && (
            <button
              type="button"
              onClick={handleToggleFavorite}
              className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${isFavorited
                ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                : 'bg-[#F5F5F5] text-[#8D8D8D] hover:bg-[#EBEBEB]'
                }`}
            >
              <Star size={14} className={isFavorited ? 'fill-yellow-500 text-yellow-500' : ''} />
              {isFavorited ? 'Favorited' : 'Add to Favorites'}
            </button>
          )}
        </motion.div>

        {/* Participants */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden"
        >
          <div className="flex items-center justify-between p-4 border-b border-[#EBEBEB]">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-[#00C300]" />
              <h3 className="text-[#111111] font-semibold text-sm">Participants</h3>
            </div>
            <span className="text-[#8D8D8D] text-xs">{participants.length}</span>
          </div>
          <div className="divide-y divide-[#EBEBEB]">
            {(showFullParticipants ? filteredParticipants : filteredParticipants.slice(0, 5)).map(p => (
              <button type="button" key={p.id}
                onClick={() => {
                  if (p.id === currentUser?.id) navigate('/profile');
                  else navigate(`/profile/${p.id}`);
                }}
                className="w-full flex items-center gap-3 p-3 hover:bg-[#F5F5F5] transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-[#F5F5F5] overflow-hidden flex items-center justify-center shrink-0">
                  {sanitizeMediaUrl(p.avatar) ? (
                    <img src={sanitizeMediaUrl(p.avatar)} className="w-full h-full object-cover" alt="User avatar" />
                  ) : (
                    <img src={getDefaultAvatar(p.id)} className="w-full h-full object-cover" alt="User avatar" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[#111111] text-sm font-medium truncate">
                    {p.name} {p.id === currentUser?.id && <span className="text-[#8D8D8D] text-xs">(You)</span>}
                  </p>
                  <p className="text-[#8D8D8D] text-xs truncate">@{p.username || 'user'}</p>
                </div>
                {p.id === currentUser?.id && (
                  <span className="text-[10px] bg-[#00C300]/10 text-[#00C300] px-2 py-0.5 rounded-full font-medium">Admin</span>
                )}
                <ChevronRight size={16} className="text-[#C7C7CC] shrink-0" />
              </button>
            ))}
          </div>
          {filteredParticipants.length > 5 && (
            <button type="button" onClick={() => setShowFullParticipants(!showFullParticipants)}
              className="w-full py-3 text-[#00C300] text-sm font-medium hover:bg-[#F5F5F5] transition-colors"
            >
              {showFullParticipants ? 'Show Less' : `Show All (${filteredParticipants.length})`}
            </button>
          )}
        </motion.div>

        {/* Shared Media */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden"
        >
          {/* Tabs */}
          <div className="flex border-b border-[#EBEBEB]">
            {([
              { key: 'media' as const, label: 'Media', icon: ImageIcon, count: mediaMessages.length },
              { key: 'files' as const, label: 'Files', icon: FileText, count: fileMessages.length },
              { key: 'links' as const, label: 'Links', icon: Link, count: linkMessages.length },
            ]).map(t => (
              <button type="button" key={t.key}
                onClick={() => setActiveMediaTab(t.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors ${activeMediaTab === t.key ? 'text-[#00C300] border-b-2 border-[#00C300]' : 'text-[#8D8D8D]'
                  }`}
              >
                <t.icon size={14} /> {t.label} ({t.count})
              </button>
            ))}
          </div>

          <div className="p-3 min-h-[120px]">
            {loadingMessages ? (
              <div className="flex items-center justify-center py-8">
                <Loader size={20} className="animate-spin text-[#00C300]" />
              </div>
            ) : activeMediaTab === 'media' ? (
              mediaMessages.length === 0 ? (
                <p className="text-[#8D8D8D] text-sm text-center py-6">No shared media</p>
              ) : (
                <div className="grid grid-cols-3 gap-1">
                  {mediaMessages.map(m => (
                    <a key={m.id} href={m.mediaUrl} target="_blank" rel="noopener noreferrer" className="aspect-square bg-[#F5F5F5] rounded-lg overflow-hidden hover:opacity-90 transition-opacity">
                      {m.type === 'image' ? (
                        <img src={m.mediaUrl} className="w-full h-full object-cover" alt="Shared image" />
                      ) : (
                        <video src={m.mediaUrl} className="w-full h-full object-cover" />
                      )}
                    </a>
                  ))}
                </div>
              )
            ) : activeMediaTab === 'files' ? (
              fileMessages.length === 0 ? (
                <p className="text-[#8D8D8D] text-sm text-center py-6">No shared files</p>
              ) : (
                <div className="space-y-1">
                  {fileMessages.map(m => (
                    <a
                      key={m.id}
                      href={m.mediaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#F5F5F5] transition-colors"
                    >
                      <FileText size={18} className="text-[#8B5CF6] shrink-0" />
                      <span className="text-[#111111] text-sm truncate">{m.content.replace('📁 ', '')}</span>
                    </a>
                  ))}
                </div>
              )
            ) : (
              linkMessages.length === 0 ? (
                <p className="text-[#8D8D8D] text-sm text-center py-6">No shared links</p>
              ) : (
                <div className="space-y-1">
                  {linkMessages.map(m => {
                    const url = m.content.match(/https?:\/\/\S+/)?.[0] ?? m.content;
                    return (
                      <a
                        key={m.id}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#F5F5F5] transition-colors"
                      >
                        <Link size={18} className="text-[#2196F3] shrink-0" />
                        <span className="text-[#111111] text-sm truncate">{url}</span>
                      </a>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </motion.div>

        {/* Chat Settings */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden"
        >
          <div className="p-4 border-b border-[#EBEBEB]">
            <h3 className="text-[#111111] font-semibold text-sm">Chat Settings</h3>
          </div>
          <div className="divide-y divide-[#EBEBEB]">
            <button type="button" onClick={() => setShowDisappearingPicker(true)} className="w-full flex items-center gap-3 p-4 hover:bg-[#F5F5F5] transition-colors text-left">
              <Clock size={18} className="text-[#FF9800]" />
              <div className="flex-1">
                <p className="text-[#111111] text-sm font-medium">Disappearing Messages</p>
                <p className="text-[#8D8D8D] text-xs">
                  {disappearingTimer === 0 ? 'Off' : disappearingTimer === 86400 ? '24 hours' : disappearingTimer === 604800 ? '7 days' : '90 days'}
                </p>
              </div>
            </button>
            <button type="button" onClick={handleToggleChatLock} className="w-full flex items-center gap-3 p-4 hover:bg-[#F5F5F5] transition-colors text-left">
              {isChatLocked ? <Lock size={18} className="text-[#FF3B30]" /> : <Unlock size={18} className="text-[#8D8D8D]" />}
              <div className="flex-1">
                <p className="text-[#111111] text-sm font-medium">{isChatLocked ? 'Chat Locked' : 'Lock Chat'}</p>
                <p className="text-[#8D8D8D] text-xs">{isChatLocked ? 'Requires PIN to open' : 'Protect with a PIN'}</p>
              </div>
            </button>
            <button type="button" onClick={handleToggleMute}
              className="w-full flex items-center gap-3 p-4 hover:bg-[#F5F5F5] transition-colors text-left"
            >
              {isMuted ? <VolumeX size={18} className="text-[#FF3B30]" /> : <Volume2 size={18} className="text-[#00C300]" />}
              <div className="flex-1">
                <p className="text-[#111111] text-sm font-medium">{isMuted ? 'Unmute Notifications' : 'Mute Notifications'}</p>
                <p className="text-[#8D8D8D] text-xs">{isMuted ? 'Notifications are muted' : 'Tap to mute this chat'}</p>
              </div>
            </button>
            <button type="button" onClick={handleExportChat}
              className="w-full flex items-center gap-3 p-4 hover:bg-[#F5F5F5] transition-colors text-left"
            >
              <Download size={18} className="text-[#2196F3]" />
              <div className="flex-1">
                <p className="text-[#111111] text-sm font-medium">Export Chat</p>
                <p className="text-[#8D8D8D] text-xs">Download chat history as JSON</p>
              </div>
            </button>
            <button type="button" onClick={() => {
              if (chat?.archived) {
                unarchiveChat(chatId!);
                toast.success('Chat unarchived');
              } else {
                archiveChat(chatId!);
                toast.success('Chat archived');
              }
            }}
              className="w-full flex items-center gap-3 p-4 hover:bg-[#F5F5F5] transition-colors text-left"
            >
              {chat?.archived ? <RotateCcw size={18} className="text-[#00C300]" /> : <Archive size={18} className="text-[#8D8D8D]" />}
              <div className="flex-1">
                <p className="text-[#111111] text-sm font-medium">{chat?.archived ? 'Unarchive Chat' : 'Archive Chat'}</p>
                <p className="text-[#8D8D8D] text-xs">{chat?.archived ? 'Restore this chat to your main list' : 'Hide this chat from your main list'}</p>
              </div>
            </button>
            <button type="button" onClick={() => setShowClearConfirm(true)}
              className="w-full flex items-center gap-3 p-4 hover:bg-[#F5F5F5] transition-colors text-left"
            >
              <Trash2 size={18} className="text-[#FF3B30]" />
              <div className="flex-1">
                <p className="text-[#111111] text-sm font-medium">Clear Chat</p>
                <p className="text-[#8D8D8D] text-xs">Delete all messages in this chat</p>
              </div>
            </button>
          </div>
        </motion.div>
      </div>

      {/* Clear Chat Confirm */}
      <AnimatePresence>
        {showClearConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowClearConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-[#111111] mb-2">Clear Chat?</h3>
              <p className="text-[#8D8D8D] text-sm mb-4">This will permanently delete all messages in this chat. This action cannot be undone.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowClearConfirm(false)}
                  className="flex-1 py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold"
                >
                  Cancel
                </button>
                <button type="button" onClick={handleClearChat}
                  className="flex-1 py-3 bg-[#FF3B30] text-white rounded-xl text-sm font-bold"
                >
                  Clear
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Disappearing Messages Picker */}
      <AnimatePresence>
        {showDisappearingPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowDisappearingPicker(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-[#111111] mb-4">Disappearing Messages</h3>
              <div className="space-y-2 mb-4">
                {([
                  { label: 'Off', value: 0, desc: 'Messages never disappear' },
                  { label: '24 Hours', value: 86400, desc: 'Messages disappear after 24 hours' },
                  { label: '7 Days', value: 604800, desc: 'Messages disappear after 7 days' },
                  { label: '90 Days', value: 7776000, desc: 'Messages disappear after 90 days' },
                ]).map(opt => (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => handleSetDisappearing(opt.value)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${disappearingTimer === opt.value ? 'bg-[#00C300]/10 border border-[#00C300]/30' : 'hover:bg-[#F5F5F5]'
                      }`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${disappearingTimer === opt.value ? 'border-[#00C300]' : 'border-[#C7C7CC]'}`}>
                      {disappearingTimer === opt.value && <div className="w-2.5 h-2.5 rounded-full bg-[#00C300]" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-[#111111] text-sm font-medium">{opt.label}</p>
                      <p className="text-[#8D8D8D] text-xs">{opt.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setShowDisappearingPicker(false)}
                className="w-full py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Lock PIN Dialog */}
      <AnimatePresence>
        {showLockConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowLockConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-[#111111] mb-2">Lock Chat</h3>
              <p className="text-[#8D8D8D] text-sm mb-4">Set a 4-digit PIN to protect this chat.</p>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={lockPinInput}
                onChange={(e) => setLockPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Enter 4-digit PIN"
                className="w-full bg-[#F5F5F5] rounded-xl px-4 py-3 text-center text-lg font-bold tracking-[0.5em] text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#8D8D8D] placeholder:tracking-normal placeholder:text-sm mb-4"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowLockConfirm(false)}
                  className="flex-1 py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold"
                >
                  Cancel
                </button>
                <button type="button"
                  onClick={() => {
                    if (lockPinInput.length === 4) {
                      handleLockChat('pin', lockPinInput);
                      setLockPinInput('');
                    } else {
                      toast.error('Please enter a 4-digit PIN');
                    }
                  }}
                  className="flex-1 py-3 bg-[#00C300] text-white rounded-xl text-sm font-bold"
                >
                  Lock
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Unlock Chat PIN Dialog */}
      <AnimatePresence>
        {showUnlockConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowUnlockConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-[#111111] mb-2">Unlock Chat</h3>
              <p className="text-[#8D8D8D] text-sm mb-4">Enter your 4-digit PIN to unlock this chat.</p>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={unlockPinInput}
                onChange={(e) => { setUnlockPinInput(e.target.value.replace(/\D/g, '').slice(0, 4)); setUnlockPinError(''); }}
                placeholder="Enter 4-digit PIN"
                className="w-full bg-[#F5F5F5] rounded-xl px-4 py-3 text-center text-lg font-bold tracking-[0.5em] text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#8D8D8D] placeholder:tracking-normal placeholder:text-sm mb-2"
              />
              {unlockPinError && <p className="text-[#FF3B30] text-xs mb-3">{unlockPinError}</p>}
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={() => setShowUnlockConfirm(false)}
                  className="flex-1 py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold"
                >
                  Cancel
                </button>
                <button type="button"
                  onClick={handleUnlockFromInfo}
                  disabled={unlockPinInput.length !== 4}
                  className="flex-1 py-3 bg-[#00C300] text-white rounded-xl text-sm font-bold disabled:opacity-50"
                >
                  Unlock
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
