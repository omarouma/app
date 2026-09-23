import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Users, ChevronDown, X, Pin, PinOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Virtuoso } from 'react-virtuoso';
import { toast } from 'sonner';

import { useAuthStore } from '@/store/useAuthStore';
import { useGroupStore } from '@/store/useGroupStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useChatStore } from '@/store/useChatStore';
import { useUserSettings } from '@/store/useSettingsStore';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { useTyping } from '@/hooks/useTyping';
import { useOfflineQueue, isOnline } from '@/hooks/useOfflineQueue';
import { useScheduledMessages } from '@/hooks/useScheduledMessages';
import { useSavedMessages } from '@/hooks/useSavedMessages';
import { useChatScrollBehavior } from '@/hooks/useChatScrollBehavior';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import { uploadMediaBlob } from '@/lib/storage';
import { SWIPE_THRESHOLD, formatDateSeparator } from '@/lib/chatConstants';
import { sanitizeMediaUrl } from '@/lib/utils';
import { setActiveChatId } from '@/lib/activeChat';
import { copyToClipboard } from '@/lib/share';
import type { Message, User } from '@/types';

import { GroupChatHeader } from '@/components/features/chat/GroupChatHeader';
import { MessageItem } from '@/components/features/chat/MessageItem';
import { GroupChatInput } from '@/components/features/chat/GroupChatInput';
import { ImageLightbox } from '@/components/features/chat/ImageLightbox';
import { StickerPicker } from '@/components/features/chat/StickerPicker';

function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function hasDayBoundary(a: Message, b: Message): boolean {
    return !isSameDay(new Date(a.timestamp), new Date(b.timestamp));
}

const CHAT_BACKGROUNDS = [
    { label: 'Default', value: '' },
    { label: 'Mint', value: 'linear-gradient(180deg, #E7F9E7 0%, #D0F0D0 100%)' },
    { label: 'Sky', value: 'linear-gradient(180deg, #E0F2FE 0%, #C7E8FB 100%)' },
    { label: 'Peach', value: 'linear-gradient(180deg, #FFEEDB 0%, #FFDFC2 100%)' },
    { label: 'Lavender', value: 'linear-gradient(180deg, #EFEBFF 0%, #DDD4FF 100%)' },
];

export default function GroupChatPage() {
    const navigate = useNavigate();
    // Keyboard-safe composer (§47): keeps the input above the soft keyboard.
    useKeyboardInset();
    const { groupId } = useParams<{ groupId: string }>();
    const { user: currentUser } = useAuthStore();
    const { settings } = useUserSettings();
    const {
        groups, groupMessages, subscribeGroupMessages, sendGroupMessage, leaveGroup,
        deleteGroupMessage, deleteGroupMessageForEveryone, editGroupMessage, addGroupReaction,
        pinGroupMessage, unpinGroupMessage, sendGroupPoll, voteGroupPoll, forwardGroupMessage,
        toggleGroupMute,
    } = useGroupStore();
    const { friends } = useFriendStore();
    const { chats } = useChatStore();
    const { isRecording, duration, startRecording, stopRecording, cancelRecording } = useVoiceRecorder();
    const isDarkChat = settings.theme === 'dark' || settings.theme === 'midnight' || settings.theme === 'oled';
    const chatBgClass = isDarkChat ? 'bg-[#0d0d0d]' : 'bg-muted';

    // ---- Local UI state -------------------------------------------------
    const [input, setInput] = useState('');
    const [showMenu, setShowMenu] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchIndex, setSearchIndex] = useState(0);
    const [replyingTo, setReplyingTo] = useState<Message | null>(null);
    const [contextMenu, setContextMenu] = useState<{ msg: Message; x: number; y: number } | null>(null);
    const [selectedReactionMsg, setSelectedReactionMsg] = useState<string | null>(null);
    const [lightboxImage, setLightboxImage] = useState<string | null>(null);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editInput, setEditInput] = useState('');
    const [translations, setTranslations] = useState<Record<string, string>>({});
    const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());
    const [chatBg, setChatBg] = useState('');
    const [showBgPicker, setShowBgPicker] = useState(false);
    const [showStickerPicker, setShowStickerPicker] = useState(false);
    const [showForwardModal, setShowForwardModal] = useState(false);
    const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
    const [forwardBatch, setForwardBatch] = useState<Message[]>([]);
    const [showSchedulePicker, setShowSchedulePicker] = useState(false);
    const [scheduleDate, setScheduleDate] = useState('');
    const [showPollModal, setShowPollModal] = useState(false);
    const [pollQuestion, setPollQuestion] = useState('');
    const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
    const [showDeleteSelectedConfirm, setShowDeleteSelectedConfirm] = useState(false);
    const [_showMembersModal, setShowMembersModal] = useState(false);
    const [hasNewMessages, setHasNewMessages] = useState(false);

    const { typingUsers, sendTyping, stopTyping } = useTyping(groupId);
    const { queueMessage } = useOfflineQueue();
    const { isSaved, saveMessage, unsaveMessage } = useSavedMessages(currentUser?.id);

    const virtuoso = useRef<any>(null);
    const initialLatestTimestampRef = useRef<number | null>(null);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const touchStartXRef = useRef(0);
    const touchCurrentXRef = useRef(0);

    const sendGroupMessageForScheduler = useCallback(
        async (chatId: string, senderId: string, content: string, type?: string, mediaUrl?: string, replyTo?: Message | string) => {
            const replyId = (typeof replyTo === 'string' ? replyTo : replyTo?.id) || '';
            await sendGroupMessage(chatId, senderId, content, type || 'text', mediaUrl, replyId);
        },
        [sendGroupMessage]
    );

    const { schedule } = useScheduledMessages(groupId || '', sendGroupMessageForScheduler);

    const group = useMemo(() => groups.find(g => g.id === groupId), [groups, groupId]);
    const msgs = useMemo(() => groupId ? (groupMessages[groupId] || []) : [], [groupMessages, groupId]);
    const memberCount = useMemo(() => group?.participants.length || 0, [group]);
    const isAdmin = !!currentUser && !!group?.admins?.includes(currentUser.id);
    const canPost = !group?.settings?.onlyAdminsCanPost || isAdmin;

    const { scrollToBottom, isAtBottom, handleAtBottomStateChange } = useChatScrollBehavior({
        chatId: groupId || '',
        messages: groupMessages,
        virtuoso,
        hasNewMessages,
        setHasNewMessages,
        initialLatestTimestampRef,
    });

    // Mark this conversation as active so global notification hooks stay silent.
    useEffect(() => {
        if (!groupId) return;
        setActiveChatId(groupId);
        return () => setActiveChatId(null);
    }, [groupId]);

    // Lookup map for resolving real member names/avatars.
    const memberInfo = useMemo<Record<string, { name: string; avatar?: string }>>(() => {
        const entries: Array<[string, { name: string; avatar?: string }]> = [];
        if (currentUser) entries.push([currentUser.id, { name: currentUser.name, avatar: currentUser.avatar }]);
        for (const f of friends) entries.push([f.id, { name: f.name, avatar: (f as unknown as Partial<User>).avatar }]);
        return Object.fromEntries(entries);
    }, [currentUser, friends]);

    useEffect(() => {
        if (!groupId) return;
        const unsub = subscribeGroupMessages(groupId);
        return () => unsub();
    }, [groupId, subscribeGroupMessages]);

    // Capture the latest timestamp on first load so the unread separator only
    // appears for messages that arrive afterwards.
    useEffect(() => {
        if (initialLatestTimestampRef.current === null && msgs.length > 0) {
            initialLatestTimestampRef.current = new Date(msgs[msgs.length - 1].timestamp).getTime();
        }
    }, [msgs]);

    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    useEffect(() => {
        return () => { stopTyping(); };
    }, [stopTyping]);

    useEffect(() => () => {
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    }, []);

    const getSenderName = useCallback((senderId: string) => {
        if (senderId === 'system') return 'System';
        if (senderId === currentUser?.id) return 'You';
        const f = friends.find(f => f.id === senderId);
        return f?.name || memberInfo[senderId]?.name || 'Member';
    }, [currentUser?.id, friends, memberInfo]);

    const getSenderAvatar = useCallback((senderId: string) => {
        if (senderId === currentUser?.id) return currentUser?.avatar;
        const f = friends.find(f => f.id === senderId);
        return f?.avatar || memberInfo[senderId]?.avatar;
    }, [currentUser?.id, currentUser?.avatar, friends, memberInfo]);

    // ---- Sending --------------------------------------------------------
    const handleSend = useCallback(async () => {
        if (!input.trim() || !currentUser || !groupId) return;
        if (!canPost) { toast.error('Only admins can send messages in this group'); return; }
        stopTyping();
        if (!isOnline()) {
            queueMessage({ type: 'group', chatId: groupId, senderId: currentUser.id, content: input.trim(), replyTo: replyingTo?.id });
            setInput('');
            setReplyingTo(null);
            return;
        }
        try {
            await sendGroupMessage(groupId, currentUser.id, input.trim(), 'text', undefined, replyingTo?.id);
            setInput('');
            setReplyingTo(null);
            scrollToBottom();
        } catch {
            toast.error('Failed to send message');
        }
    }, [input, currentUser, groupId, stopTyping, queueMessage, replyingTo?.id, sendGroupMessage, canPost, scrollToBottom]);

    const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>, mediaType: string) => {
        const inputElement = e.currentTarget;
        const file = e.target.files?.[0];
        if (!file || !currentUser || !groupId) return;
        try {
            const url = await uploadMediaBlob(file, { kind: 'chats', userId: currentUser.id, fileName: file.name, contentType: file.type });
            if (!url) throw new Error('Upload failed');
            await sendGroupMessage(groupId, currentUser.id, mediaType === 'image' ? 'Photo' : 'Video', mediaType, url);
            scrollToBottom();
        } catch {
            toast.error('Failed to upload media');
        } finally {
            inputElement.value = '';
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputElement = e.currentTarget;
        const file = e.target.files?.[0];
        if (!file || !currentUser || !groupId) return;
        try {
            const url = await uploadMediaBlob(file, { kind: 'chats', userId: currentUser.id, fileName: file.name, contentType: file.type });
            if (!url) throw new Error('Upload failed');
            await sendGroupMessage(groupId, currentUser.id, file.name, 'file', url);
            scrollToBottom();
        } catch {
            toast.error('Failed to upload file');
        } finally {
            inputElement.value = '';
        }
    };

    const handleVoiceSend = async () => {
        if (!currentUser || !groupId) return;
        const blob = await stopRecording();
        if (!blob) return;
        try {
            const url = await uploadMediaBlob(blob, { kind: 'voice', userId: currentUser.id, contentType: 'audio/webm' });
            if (!url) throw new Error('Upload failed');
            await sendGroupMessage(groupId, currentUser.id, 'Voice message', 'voice', url);
            scrollToBottom();
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
                const { latitude, longitude } = pos.coords;
                const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
                await sendGroupMessage(groupId, currentUser.id, `📍 ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, 'location', url);
                toast.success('Location shared');
                scrollToBottom();
            },
            () => { toast.error('Location access denied'); }
        );
    };

    const handleContactShare = async () => {
        if (!currentUser || !groupId) return;
        try {
            await sendGroupMessage(groupId, currentUser.id, `Contact: ${currentUser.name}`, 'contact');
            toast.success('Contact shared');
            scrollToBottom();
        } catch {
            toast.error('Failed to share contact');
        }
    };

    const handleStickerSelect = async (sticker: { type: 'emoji' | 'gif'; content: string }) => {
        if (!currentUser || !groupId) return;
        try {
            if (sticker.type === 'gif') {
                await sendGroupMessage(groupId, currentUser.id, 'GIF', 'image', sticker.content);
            } else {
                await sendGroupMessage(groupId, currentUser.id, sticker.content, 'text');
            }
            setShowStickerPicker(false);
            scrollToBottom();
        } catch {
            toast.error('Failed to send sticker');
        }
    };

    // ---- Editing / deleting --------------------------------------------
    const handleEditStart = useCallback((msg: Message) => {
        setEditingMessageId(msg.id);
        setEditInput(msg.content);
        setContextMenu(null);
    }, []);

    const handleEditSave = useCallback(async (msgId: string) => {
        if (!groupId || !editInput.trim()) return;
        try {
            await editGroupMessage(groupId, msgId, editInput.trim());
            setEditingMessageId(null);
            setEditInput('');
        } catch {
            toast.error('Failed to edit message');
        }
    }, [groupId, editInput, editGroupMessage]);

    const handleDeleteMessage = async (msg: Message) => {
        if (!currentUser || !groupId) return;
        setContextMenu(null);
        try {
            if (msg.senderId === currentUser.id) {
                await deleteGroupMessageForEveryone(groupId, msg.id);
                toast.success('Message deleted');
            } else {
                await deleteGroupMessage(groupId, msg.id);
                toast.success('Message deleted');
            }
        } catch {
            toast.error('Failed to delete message');
        }
    };

    // ---- Pin / save / translate ----------------------------------------
    const isPinned = useCallback((msgId: string) => {
        return (group?.pinnedMessages || []).some(p => (p.messageId || p.message_id) === msgId);
    }, [group?.pinnedMessages]);

    const handlePin = useCallback(async (msg: Message) => {
        if (!groupId || !currentUser) return;
        setContextMenu(null);
        try {
            if (isPinned(msg.id)) {
                await unpinGroupMessage(groupId, msg.id);
                toast.success('Unpinned');
            } else {
                await pinGroupMessage(groupId, msg.id, msg.content, currentUser.id);
                toast.success('Pinned');
            }
        } catch {
            toast.error('Failed to update pin');
        }
    }, [groupId, currentUser, isPinned, pinGroupMessage, unpinGroupMessage]);

    const handleSaveMessage = useCallback((msg: Message) => {
        setContextMenu(null);
        if (isSaved(msg.id)) {
            unsaveMessage(msg.id);
            toast.success('Removed from saved');
        } else {
            saveMessage(msg, getSenderName(msg.senderId));
            toast.success('Saved');
        }
    }, [isSaved, saveMessage, unsaveMessage, getSenderName]);

    const handleTranslate = useCallback(async (msg: Message) => {
        setContextMenu(null);
        const { id: msgId, content: text } = msg;
        if (translations[msgId]) {
            setTranslations(prev => { const n = { ...prev }; delete n[msgId]; return n; });
            return;
        }
        if (!text?.trim()) return;
        setTranslatingIds(prev => new Set(prev).add(msgId));
        try {
            const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|en`);
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
    }, [translations]);

    // ---- Forward --------------------------------------------------------
    const resetForwardModal = useCallback(() => {
        setShowForwardModal(false);
        setForwardMsg(null);
        setForwardBatch([]);
    }, []);

    const handleForward = useCallback(async (targetChatId: string) => {
        if (!currentUser) return;
        const targets = forwardBatch.length ? forwardBatch : (forwardMsg ? [forwardMsg] : []);
        const target = chats.find(c => c.id === targetChatId);
        try {
            for (const m of targets) {
                if (target?.type === 'group') {
                    await forwardGroupMessage(targetChatId, currentUser.id, m);
                } else {
                    await useChatStore.getState().sendMessage(targetChatId, currentUser.id, m.content, m.type, m.mediaUrl, m.replyTo);
                }
            }
            toast.success('Forwarded');
        } catch {
            toast.error('Failed to forward');
        }
        resetForwardModal();
    }, [currentUser, forwardBatch, forwardMsg, chats, forwardGroupMessage, resetForwardModal]);

    // ---- Polls ----------------------------------------------------------
    const handleSendPoll = useCallback(async () => {
        if (!currentUser || !groupId) return;
        await sendGroupPoll(groupId, currentUser.id, pollQuestion, pollOptions);
        setShowPollModal(false);
        setPollQuestion('');
        setPollOptions(['', '']);
        scrollToBottom();
    }, [currentUser, groupId, sendGroupPoll, pollQuestion, pollOptions, scrollToBottom]);

    // ---- Schedule -------------------------------------------------------
    const handleScheduleSend = useCallback(() => {
        if (!scheduleDate || !input.trim() || !currentUser) return;
        schedule({
            senderId: currentUser.id,
            content: input.trim(),
            type: 'text',
            replyTo: replyingTo?.id,
            scheduledAt: new Date(scheduleDate).getTime(),
        });
        setInput('');
        setReplyingTo(null);
        setShowSchedulePicker(false);
        setScheduleDate('');
        toast.success('Message scheduled.');
    }, [scheduleDate, input, currentUser, schedule, replyingTo?.id]);

    // ---- Selection ------------------------------------------------------
    const handleToggleSelect = useCallback((msgId: string) => {
        setSelectedMessages(prev => {
            const next = new Set(prev);
            if (next.has(msgId)) next.delete(msgId); else next.add(msgId);
            if (next.size === 0) setSelectionMode(false);
            return next;
        });
    }, []);

    const handleClickMsg = useCallback((msg: Message) => {
        if (selectionMode) handleToggleSelect(msg.id);
    }, [selectionMode, handleToggleSelect]);

    const handleDoubleClickMsg = useCallback((msg: Message) => {
        setReplyingTo(msg);
    }, []);

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
        if (!text) { handleClearSelection(); return; }
        const ok = await copyToClipboard(text);
        if (ok) toast.success(`Copied ${selected.length} message(s).`);
        else toast.error('Unable to copy messages.');
        handleClearSelection();
    }, [msgs, selectedMessages, handleClearSelection]);

    const handleForwardSelected = useCallback(() => {
        const selected = msgs.filter(m => selectedMessages.has(m.id));
        if (selected.length === 0) return;
        setForwardBatch(selected);
        setShowForwardModal(true);
        handleClearSelection();
    }, [msgs, selectedMessages, handleClearSelection]);

    const handleDeleteSelected = useCallback(() => {
        if (selectedMessages.size === 0) return;
        setShowDeleteSelectedConfirm(true);
    }, [selectedMessages]);

    const confirmDeleteSelected = useCallback(async () => {
        setShowDeleteSelectedConfirm(false);
        const selected = msgs.filter(m => selectedMessages.has(m.id));
        try {
            for (const m of selected) {
                if (currentUser && m.senderId === currentUser.id && groupId) {
                    await deleteGroupMessageForEveryone(groupId, m.id);
                } else if (groupId) {
                    await deleteGroupMessage(groupId, m.id);
                }
            }
            toast.success('Message(s) deleted.');
        } catch {
            toast.error('Failed to delete messages.');
        }
        handleClearSelection();
    }, [msgs, selectedMessages, currentUser, groupId, deleteGroupMessage, deleteGroupMessageForEveryone, handleClearSelection]);

    // ---- Touch / swipe --------------------------------------------------
    const handleTouchStart = useCallback((e: React.TouchEvent, msg: Message) => {
        if (selectionMode) return;
        handleLongPress(msg);
        touchStartXRef.current = e.touches[0].clientX;
        touchCurrentXRef.current = e.touches[0].clientX;
    }, [selectionMode, handleLongPress]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (selectionMode) return;
        touchCurrentXRef.current = e.touches[0].clientX;
        const diff = touchCurrentXRef.current - touchStartXRef.current;
        if (diff < -5 && longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    }, [selectionMode]);

    const handleTouchEnd = useCallback((msg: Message) => {
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        const diff = touchCurrentXRef.current - touchStartXRef.current;
        if (!selectionMode && diff > SWIPE_THRESHOLD) setReplyingTo(msg);
        touchStartXRef.current = 0;
        touchCurrentXRef.current = 0;
    }, [selectionMode]);

    // ---- Derived --------------------------------------------------------
    const searchResults = useMemo(() => {
        if (!searchQuery) return [];
        return msgs.reduce((acc, msg, index) => {
            if ((msg.content || '').toLowerCase().includes(searchQuery.toLowerCase())) acc.push(index);
            return acc;
        }, [] as number[]);
    }, [msgs, searchQuery]);

    const msgIdMap = useMemo(() => {
        const map = new Map<string, Message>();
        for (const m of msgs) map.set(m.id, m);
        return map;
    }, [msgs]);

    const handleSearchNavigate = useCallback((direction: 'up' | 'down') => {
        if (searchResults.length === 0) return;
        const nextIndex = direction === 'up'
            ? (searchIndex - 1 + searchResults.length) % searchResults.length
            : (searchIndex + 1) % searchResults.length;
        setSearchIndex(nextIndex);
        virtuoso.current?.scrollToIndex({ index: searchResults[nextIndex], align: 'center', behavior: 'smooth' });
    }, [searchResults, searchIndex]);

    const shouldShowAvatar = useCallback((msg: Message, index: number) => {
        const prev = msgs[index - 1];
        return !prev || prev.senderId !== msg.senderId || hasDayBoundary(prev, msg);
    }, [msgs]);

    const shouldShowDate = useCallback((msg: Message, index: number) => {
        const prev = msgs[index - 1];
        return !prev || !isSameDay(new Date(prev.timestamp), new Date(msg.timestamp));
    }, [msgs]);

    const shouldShowUnreadSeparator = useCallback((msg: Message) => {
        return hasNewMessages && new Date(msg.timestamp).getTime() >= (initialLatestTimestampRef.current ?? 0) && msg.senderId !== currentUser?.id;
    }, [hasNewMessages, currentUser?.id]);

    const activeTypingUsers = useMemo(() => Object.values(typingUsers || {}), [typingUsers]);

    const pinnedList = group?.pinnedMessages || [];
    const latestPinned = pinnedList.length > 0 ? pinnedList[pinnedList.length - 1] : null;

    const contextMenuItems = useMemo(() => {
        if (!contextMenu) return [] as Array<{ label: string; action: () => void; danger?: boolean }>;
        const msg = contextMenu.msg;
        const items: Array<{ label: string; action: () => void; danger?: boolean }> = [
            { label: 'Reply', action: () => { setReplyingTo(msg); setContextMenu(null); } },
            { label: 'React', action: () => { setSelectedReactionMsg(msg.id); setContextMenu(null); } },
            { label: 'Copy', action: async () => { const ok = await copyToClipboard(msg.content); if (ok) toast.success('Copied'); else toast.error('Unable to copy'); setContextMenu(null); } },
            { label: 'Select', action: () => { setSelectionMode(true); setSelectedMessages(new Set([msg.id])); setContextMenu(null); } },
        ];
        if (msg.senderId === currentUser?.id) {
            items.push({ label: 'Edit', action: () => handleEditStart(msg) });
        }
        items.push({ label: 'Forward', action: () => { setForwardMsg(msg); setShowForwardModal(true); setContextMenu(null); } });
        items.push({ label: isPinned(msg.id) ? 'Unpin' : 'Pin', action: () => handlePin(msg) });
        items.push({ label: isSaved(msg.id) ? 'Unsave' : 'Save', action: () => handleSaveMessage(msg) });
        items.push({ label: 'Translate', action: () => handleTranslate(msg) });
        items.push({ label: 'Info', action: () => { setContextMenu(null); if (groupId) navigate(`/group-info/${groupId}`); } });
        items.push({ label: msg.senderId === currentUser?.id ? 'Delete for everyone' : 'Delete for me', action: () => handleDeleteMessage(msg), danger: true });
        return items;
    }, [contextMenu, currentUser?.id, isPinned, isSaved, handleEditStart, handlePin, handleSaveMessage, handleTranslate, navigate, groupId]);

    if (!group) {
        return (
            <div className={`h-[100vh] ${chatBgClass} flex items-center justify-center`}>
                <div className={isDarkChat ? 'text-center text-white' : 'text-center text-foreground'}>
                    <Users size={48} className="mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">Group not found</p>
                    <button type="button" onClick={() => navigate('/chats')} className="mt-4 text-sm underline">Go back</button>
                </div>
            </div>
        );
    }

    return (
        <div
            className="chat-surface flex flex-col h-full"
            data-bg={chatBg || undefined}
            style={{ '--chat-bg': chatBg } as CSSProperties}
        >
            <GroupChatHeader
                group={group}
                currentUser={currentUser}
                memberCount={memberCount}
                showMenu={showMenu}
                setShowMenu={setShowMenu}
                showSearch={showSearch}
                setShowSearch={setShowSearch}
                searchQuery={searchQuery}
                setSearchQuery={(q) => { setSearchQuery(q); setSearchIndex(0); }}
                filteredMsgsLength={searchResults.length}
                leaveGroup={leaveGroup}
                setShowMembersModal={setShowMembersModal}
                onToggleMute={() => { if (group) toggleGroupMute(group.id, !group.isMuted); }}
                memberInfo={memberInfo}
                activeTypingUsers={activeTypingUsers}
                selectionMode={selectionMode}
                selectedCount={selectedMessages.size}
                onCopySelected={handleCopySelected}
                onForwardSelected={handleForwardSelected}
                onDeleteSelected={handleDeleteSelected}
                onExitSelection={handleClearSelection}
                onToggleBgPicker={() => setShowBgPicker(p => !p)}
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
                        <div className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto">
                            <span className="text-xs font-semibold text-muted-foreground mr-1 shrink-0">Background:</span>
                            {CHAT_BACKGROUNDS.map(opt => (
                                <button
                                    key={opt.label}
                                    type="button"
                                    onClick={() => setChatBg(opt.value)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 ${chatBg === opt.value ? 'bg-[#00C300] text-white' : 'bg-muted text-foreground'}`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Search bar */}
            <AnimatePresence>
                {showSearch && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="shrink-0 bg-background border-b border-border overflow-hidden"
                    >
                        <div className="flex items-center gap-2 px-4 py-2">
                            <input
                                autoFocus
                                value={searchQuery}
                                onChange={e => { setSearchQuery(e.target.value); setSearchIndex(0); }}
                                placeholder="Search messages..."
                                className="flex-1 bg-muted rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-muted-foreground"
                            />
                            <span className="text-xs text-muted-foreground shrink-0">
                                {searchResults.length > 0 ? `${searchIndex + 1}/${searchResults.length}` : '0'}
                            </span>
                            <button type="button" onClick={() => handleSearchNavigate('up')} className="p-1.5 rounded-full hover:bg-muted text-foreground" aria-label="Previous match"><ChevronDown size={18} className="rotate-180" /></button>
                            <button type="button" onClick={() => handleSearchNavigate('down')} className="p-1.5 rounded-full hover:bg-muted text-foreground" aria-label="Next match"><ChevronDown size={18} /></button>
                            <button type="button" onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchIndex(0); }} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground" aria-label="Close search"><X size={18} /></button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Pinned message banner */}
            <AnimatePresence>
                {latestPinned && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="shrink-0 bg-[#00C300]/5 border-b border-[#00C300]/20 overflow-hidden"
                    >
                        <div className="flex items-center gap-2 px-4 py-2">
                            <Pin size={16} className="text-[#00C300] shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-semibold text-[#00C300]">Pinned message</p>
                                <p className="text-xs text-foreground truncate">{latestPinned.content}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => { if (groupId) unpinGroupMessage(groupId, latestPinned.messageId || latestPinned.message_id || ''); }}
                                className="p-1.5 rounded-full hover:bg-muted text-muted-foreground shrink-0"
                                aria-label="Unpin message"
                            >
                                <PinOff size={16} />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main chat area */}
            <div className="flex-1 overflow-hidden relative">
                <Virtuoso
                    ref={virtuoso}
                    data={msgs}
                    initialTopMostItemIndex={msgs.length > 0 ? msgs.length - 1 : 0}
                    atBottomStateChange={handleAtBottomStateChange}
                    followOutput={'auto'}
                    itemContent={(index, msg) => {
                        if (msg.senderId === 'system') {
                            return (
                                <div className="flex justify-center my-2 px-4">
                                    <span className="bg-muted text-muted-foreground text-[11px] px-3 py-1 rounded-full text-center">{msg.content}</span>
                                </div>
                            );
                        }
                        const senderInfo = {
                            id: msg.senderId,
                            name: getSenderName(msg.senderId),
                            avatar: getSenderAvatar(msg.senderId),
                        };
                        return (
                            <MessageItem
                                key={msg.id}
                                msg={msg}
                                isMe={msg.senderId === currentUser?.id}
                                showAvatar={shouldShowAvatar(msg, index)}
                                showDate={shouldShowDate(msg, index)}
                                msgDate={formatDateSeparator(new Date(msg.timestamp))}
                                showUnreadSeparator={shouldShowUnreadSeparator(msg)}
                                isSelected={selectedMessages.has(msg.id)}
                                isSearchMatch={searchQuery ? (msg.content || '').toLowerCase().includes(searchQuery.toLowerCase()) : false}
                                editingMessageId={editingMessageId}
                                editInput={editInput}
                                selectionMode={selectionMode}
                                selectedReactionMsg={selectedReactionMsg}
                                displayUser={{ id: '', name: '', avatar: '' }}
                                otherUserName={group.name || 'Group'}
                                userId=""
                                currentUserId={currentUser?.id || ''}
                                msgIdMap={msgIdMap}
                                translatedText={translations[msg.id]}
                                isTranslating={translatingIds.has(msg.id)}
                                senderInfo={senderInfo}
                                showSenderName
                                resolveSenderName={getSenderName}
                                onContextMenu={(e, message) => {
                                    e.preventDefault();
                                    setContextMenu({ msg: message, x: e.clientX, y: e.clientY });
                                }}
                                onTouchStart={(e) => handleTouchStart(e, msg)}
                                onTouchMove={(e) => handleTouchMove(e)}
                                onTouchEnd={() => handleTouchEnd(msg)}
                                onMouseDown={() => { /* reserved */ }}
                                onMouseUp={() => { /* reserved */ }}
                                onMouseLeave={() => { /* reserved */ }}
                                onClick={handleClickMsg}
                                onDoubleClick={handleDoubleClickMsg}
                                onReact={(msgId, reaction) => { if (groupId && currentUser) addGroupReaction(groupId, msgId, reaction, currentUser.id); }}
                                onSetReactionMsg={setSelectedReactionMsg}
                                onEditInputChange={setEditInput}
                                onEditSave={handleEditSave}
                                onEditCancel={() => { setEditingMessageId(null); setEditInput(''); }}
                                onSetReplyingTo={setReplyingTo}
                                onSetLightbox={setLightboxImage}
                                onVotePoll={(chatId, msgId, idx, userId) => voteGroupPoll(chatId, msgId, idx, userId)}
                                onNavigate={navigate}
                                chatId={groupId || ''}
                            />
                        );
                    }}
                    components={{
                        Header: () => (
                            <div className="p-4">
                                <div className="flex justify-center mb-4">
                                    <div className="bg-muted text-muted-foreground text-center text-[11px] px-4 py-2 rounded-2xl max-w-[80%]">
                                        <p className="font-medium text-xs mb-0.5">{group.name}</p>
                                        <p className="opacity-80">{group.description || `${group.participants.length} members`}</p>
                                    </div>
                                </div>
                            </div>
                        ),
                    }}
                />

                {!isAtBottom && (
                    <button
                        onClick={scrollToBottom}
                        className="absolute bottom-4 right-4 bg-background rounded-full p-2.5 shadow-lg border border-border z-10 active:scale-95 transition-transform"
                        aria-label="Scroll to latest"
                    >
                        <ChevronDown size={22} className="text-foreground" />
                    </button>
                )}
            </div>

            {/* Sticker picker */}
            <AnimatePresence>
                {showStickerPicker && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="shrink-0 overflow-hidden border-t border-border"
                    >
                        <StickerPicker onSelect={handleStickerSelect} onClose={() => setShowStickerPicker(false)} />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Input bar */}
            <div className="shrink-0" style={{ paddingBottom: 'var(--kb-inset, 0px)' }}>
            {canPost ? (
                <GroupChatInput
                    input={input}
                    setInput={setInput}
                    handleSend={handleSend}
                    isRecording={isRecording}
                    startRecording={startRecording}
                    cancelRecording={cancelRecording}
                    handleVoiceSend={handleVoiceSend}
                    duration={duration}
                    replyingTo={replyingTo}
                    setReplyingTo={setReplyingTo}
                    handleMediaUpload={handleMediaUpload}
                    handleFileUpload={handleFileUpload}
                    handleLocationShare={handleLocationShare}
                    handleContactShare={handleContactShare}
                    onTyping={sendTyping}
                    onPollOpen={() => setShowPollModal(true)}
                    onSchedule={() => setShowSchedulePicker(true)}
                    onStickerToggle={() => setShowStickerPicker(p => !p)}
                    showStickerPicker={showStickerPicker}
                    members={group.participants
                        .filter((id: string) => id !== currentUser?.id)
                        .map((id: string) => ({ id, name: memberInfo[id]?.name || 'Member' }))}
                />
            ) : (
                <div className="shrink-0 bg-[#FFF8E1] border-t border-[#FFE082] px-4 py-3 text-center text-xs text-[#8D6E00]">
                    Only admins can send messages in this group.
                </div>
            )}
            </div>

            {/* Context Menu */}
            <AnimatePresence>
                {contextMenu && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="fixed bg-background rounded-xl shadow-xl border border-border z-50 py-1 min-w-[170px] max-w-[220px]"
                        style={{
                            top: Math.min(contextMenu.y, window.innerHeight - 360),
                            left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 228)),
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {contextMenuItems.map(({ label, action, danger }) => (
                            <button
                                key={label}
                                type="button"
                                onClick={action}
                                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors ${danger ? 'text-red-500' : 'text-foreground'}`}
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
                                {chats.filter(c => c.id !== groupId).map(target => {
                                    const otherId = target.participants?.find(p => p !== currentUser?.id);
                                    const otherUser = otherId ? friends.find(f => f.id === otherId) : undefined;
                                    const name = target.type === 'group' ? (target.name || 'Group') : (otherUser?.name || '');
                                    const avatar = target.type === 'group' ? (target.avatar || '') : (otherUser?.avatar || '');
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
                                {chats.filter(c => c.id !== groupId).length === 0 && (
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
                                Delete {selectedMessages.size} selected message{selectedMessages.size !== 1 ? 's' : ''}?
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
        </div>
    );
}
