import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/useAuthStore';
import { useGroupStore } from '@/store/useGroupStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { useTyping } from '@/hooks/useTyping';
import { useOfflineQueue, isOnline } from '@/hooks/useOfflineQueue';
import { useScheduledMessages } from '@/hooks/useScheduledMessages';
import type { Message } from '@/types';
import { toast } from 'sonner';
import { GroupChatHeader } from '@/components/features/chat/GroupChatHeader';
import { GroupChatMessageList } from '@/components/features/chat/GroupChatMessageList';
import { GroupChatInput } from '@/components/features/chat/GroupChatInput';

function formatDateSeparator(date: Date) {
    const now = new Date();
    const d = new Date(date);
    if (d.toDateString() === now.toDateString()) return 'Today';
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function GroupChatPage() {
    const navigate = useNavigate();
    const { groupId } = useParams<{ groupId: string }>();
    const { user: currentUser } = useAuthStore();
const {
        groups, groupMessages, subscribeGroupMessages, sendGroupMessage, leaveGroup
    } = useGroupStore();

    const subscribeGroupMessagesRef = useRef(subscribeGroupMessages);
    useEffect(() => { subscribeGroupMessagesRef.current = subscribeGroupMessages; });
    const { friends } = useFriendStore();
    const { isRecording, duration, startRecording, stopRecording, cancelRecording } = useVoiceRecorder();

    const [input, setInput] = useState('');
    const [showMenu, setShowMenu] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [replyingTo, setReplyingTo] = useState<Message | null>(null);
    const [contextMenu, setContextMenu] = useState<{ msg: Message; x: number; y: number } | null>(null);
    const [_showMembersModal, setShowMembersModal] = useState(false);
    const { sendTyping, stopTyping } = useTyping(groupId);
    const { queueMessage } = useOfflineQueue();

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);

    const sendGroupMessageForScheduler = useCallback(
        async (chatId: string, senderId: string, content: string, type?: string, mediaUrl?: string, replyTo?: Message | string) => {
            const replyId = (typeof replyTo === 'string' ? replyTo : replyTo?.id) || '';
            await sendGroupMessage(chatId, senderId, content, type || 'text', mediaUrl, replyId);
        },
        [sendGroupMessage]
    );

    const { schedule: _schedule, getPending: _getPending } = useScheduledMessages(groupId || '', sendGroupMessageForScheduler);

    const group = useMemo(() => groups.find(g => g.id === groupId), [groups, groupId]);
    const msgs = useMemo(() => groupId ? (groupMessages[groupId] || []) : [], [groupMessages, groupId]);
    const memberCount = useMemo(() => group?.participants.length || 0, [group]);

    const filteredMsgs = useMemo(() =>
        searchQuery ? msgs.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase())) : msgs,
        [msgs, searchQuery]
    );

    useEffect(() => {
        if (!groupId) return;
        const unsub = subscribeGroupMessagesRef.current(groupId);
        return () => unsub();
    }, [groupId]);

    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

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

    const handleSend = useCallback(async () => {
        if (!input.trim() || !currentUser || !groupId) return;
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
        } catch {
            toast.error('Failed to send message');
        }
    }, [input, currentUser, groupId, stopTyping, queueMessage, replyingTo?.id, sendGroupMessage]);

    const handleMediaUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, mediaType: string) => {
        const file = e.target.files?.[0];
        if (!file || !currentUser || !groupId) return;
        try {
            const { uploadMediaBlob } = await import('@/lib/storage');
            const url = await uploadMediaBlob({ kind: 'chats', chatId: groupId, file, mimeType: file.type });
            await sendGroupMessage(groupId, currentUser.id, mediaType === 'image' ? 'Photo' : 'Video', mediaType, url);
        } catch {
            toast.error('Failed to upload media');
        }
    }, [currentUser, groupId, sendGroupMessage]);

    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !currentUser || !groupId) return;
        try {
            const { uploadMediaBlob } = await import('@/lib/storage');
            const url = await uploadMediaBlob({ kind: 'chats', chatId: groupId, file, mimeType: file.type });
            await sendGroupMessage(groupId, currentUser.id, file.name, 'file', url);
        } catch {
            toast.error('Failed to upload file');
        }
    }, [currentUser, groupId, sendGroupMessage]);

    const handleVoiceSend = useCallback(async () => {
        if (!currentUser || !groupId) return;
        const blob = await stopRecording();
        if (!blob) return;
        try {
            const { uploadMediaBlob } = await import('@/lib/storage');
            const file = new File([blob], 'voice-message.webm', { type: 'audio/webm' });
            const url = await uploadMediaBlob({ kind: 'voice', chatId: groupId, file, mimeType: 'audio/webm' });
            await sendGroupMessage(groupId, currentUser.id, 'Voice message', 'voice', url);
        } catch {
            toast.error('Failed to send voice message');
        }
    }, [currentUser, groupId, stopRecording, sendGroupMessage]);

    const handleLocationShare = useCallback(() => {
        if (!navigator.geolocation) {
            toast.error('Geolocation not supported');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                if (!currentUser || !groupId) return;
                const { latitude, longitude } = pos.coords;
                const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
                await sendGroupMessage(groupId, currentUser.id, `Location: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, 'location', url);
                toast.success('Location shared');
            },
            () => { toast.error('Location access denied'); }
        );
    }, [currentUser, groupId, sendGroupMessage]);

    const handleContactShare = useCallback(async () => {
        if (!currentUser || !groupId) return;
        try {
            await sendGroupMessage(groupId, currentUser.id, `Contact: ${currentUser.name}`, 'contact');
            toast.success('Contact shared');
        } catch {
            toast.error('Failed to share contact');
        }
    }, [currentUser, groupId, sendGroupMessage]);

    const handleContextMenu = (e: React.MouseEvent, msg: Message) => {
        e.preventDefault();
        setContextMenu({ msg, x: e.clientX, y: e.clientY });
    };

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
            <GroupChatHeader
                group={group}
                currentUser={currentUser}
                memberCount={memberCount}
                showMenu={showMenu}
                setShowMenu={setShowMenu}
                showSearch={showSearch}
                setShowSearch={setShowSearch}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                filteredMsgsLength={filteredMsgs.length}
                leaveGroup={leaveGroup}
                setShowMembersModal={setShowMembersModal}
            />
            <GroupChatMessageList
                group={group}
                filteredMsgs={filteredMsgs}
                currentUser={currentUser}
                searchQuery={searchQuery}
                dateSeparatorMap={dateSeparatorMap}
                messagesContainerRef={messagesContainerRef}
                messagesEndRef={messagesEndRef}
                getSenderName={getSenderName}
                getSenderAvatar={getSenderAvatar}
                handleContextMenu={handleContextMenu}
            />
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
            />

            {/* Context Menu */}
            <AnimatePresence>
              {contextMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="fixed bg-white rounded-xl shadow-xl border border-gray-100 z-50 py-1 min-w-[160px]"
                  style={{ top: Math.min(contextMenu.y, window.innerHeight - 200), left: Math.min(contextMenu.x, window.innerWidth - 180) }}
                  onClick={e => e.stopPropagation()}
                >
                  {[
                    { label: 'Reply', action: () => { setReplyingTo(contextMenu.msg); setContextMenu(null); } },
                    { label: 'Copy', action: () => { navigator.clipboard.writeText(contextMenu.msg.content); toast.success('Copied'); setContextMenu(null); } },
                    { label: 'Delete', action: () => { toast.info('Delete not available in groups yet'); setContextMenu(null); } },
                  ].map(({ label, action }) => (
                    <button key={label} type="button" onClick={action}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
                        label === 'Delete' ? 'text-red-500' : 'text-gray-800'
                      }`}
                    >{label}</button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
        </div>
    );
}