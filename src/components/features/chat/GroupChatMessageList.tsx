import { useRef, useEffect } from 'react';
import { getDefaultAvatar } from '@/lib/utils';
import type { Message, User } from '@/types';

interface GroupChatMessageListProps {
    group: any;
    filteredMsgs: Message[];
    currentUser: User | null;
    searchQuery: string;
    dateSeparatorMap: Map<string, boolean>;
messagesContainerRef: React.RefObject<HTMLDivElement | null>;
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
getSenderName: (senderId: string) => string;
    getSenderAvatar: (senderId: string) => string | undefined;
    handleContextMenu: (e: React.MouseEvent, msg: Message) => void;
}

function formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDateSeparator(date: Date) {
    const now = new Date();
    const d = new Date(date);
    if (d.toDateString() === now.toDateString()) return 'Today';
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

export function GroupChatMessageList({
    group,
    filteredMsgs,
    currentUser,
    searchQuery,
    dateSeparatorMap,
    messagesContainerRef,
    messagesEndRef,
    getSenderName,
    getSenderAvatar,
    handleContextMenu
}: GroupChatMessageListProps) {
    const shouldAutoScrollRef = useRef(true);
    const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});

    // Look up the message being replied to (by id) so we can render a quote.
    const getReplyTarget = (replyToId: string): Message | undefined =>
        filteredMsgs.find((m) => m.id === replyToId);

    // Scroll the quoted message into view and briefly highlight it so the user
    // can see where the reply is pointing. Disables auto-scroll so the jump
    // isn't immediately undone on the next re-render.
    const scrollToMessage = (id: string) => {
        shouldAutoScrollRef.current = false;
        const el = messageRefs.current[id];
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('ring-2', 'ring-[#00C300]');
            setTimeout(() => el.classList.remove('ring-2', 'ring-[#00C300]'), 1200);
        }
    };

useEffect(() => {
        if (shouldAutoScrollRef.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [filteredMsgs.length, messagesEndRef]);

    // Reset the auto-scroll flag once the scroll effect runs so a manual
    // scroll (e.g. jumping to a reply) isn't immediately overridden.
    useEffect(() => {
        const timer = setTimeout(() => {
            shouldAutoScrollRef.current = true;
        }, 600);
        return () => clearTimeout(timer);
    }, [filteredMsgs.length]);

    useEffect(() => {
        const container = messagesContainerRef.current;
        if (!container) return;
        const handleScroll = () => {
            const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
            shouldAutoScrollRef.current = atBottom;
        };
        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => container.removeEventListener('scroll', handleScroll);
    }, [messagesContainerRef]);

    return (
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 scrollbar-hide">
            <div className="space-y-4">
                <div className="flex justify-center my-4">
                    <div className="bg-black/20 text-white text-center text-[11px] px-4 py-2 rounded-2xl backdrop-blur-sm max-w-[80%]">
                        <p className="font-medium text-xs mb-0.5">{group.name}</p>
                        <p className="opacity-80">{group.description || `${group.participants.length} members`}</p>
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

                    const replyTarget = msg.replyTo ? getReplyTarget(msg.replyTo) : undefined;

                    return (
                        <div key={msg.id}>
                            {showDate && (
                                <div className="flex justify-center my-4">
                                    <span className="bg-black/20 text-white text-[11px] px-3 py-1 rounded-full backdrop-blur-sm">{msgDate}</span>
                                </div>
                            )}
                            <div
                                ref={(el) => { messageRefs.current[msg.id] = el; }}
                                onContextMenu={(e) => handleContextMenu(e, msg)}
                                className={`flex items-end gap-2 transition-colors ${isMe ? 'justify-end' : 'justify-start'} ${isSearchMatch ? 'bg-yellow-200/50 rounded-lg' : ''}`}>
                                {!isMe && (
                                    <img src={getSenderAvatar(msg.senderId) || getDefaultAvatar(msg.senderId)} alt="avatar" className="w-6 h-6 rounded-full shrink-0" />
                                )}
                                <div className={`max-w-[70%] p-0 relative`}>
                                    {!isMe && <p className="text-[11px] text-white/80 mb-0.5 ml-1">{getSenderName(msg.senderId)}</p>}
                                    <div className={`px-3 py-2 rounded-xl text-sm leading-tight relative overflow-hidden ${isMe ? 'bg-white text-[#111111] rounded-br-none' : 'bg-[#25D366] text-white rounded-bl-none'}`}>
                                        {replyTarget && (
                                            <button type="button"
                                                onClick={(e) => { e.stopPropagation(); scrollToMessage(replyTarget.id); }}
                                                className={`block w-full text-left mb-1 px-2 py-1 rounded-lg text-xs border-l-4 border-[#00000033] cursor-pointer hover:opacity-90 transition-opacity ${
                                                    isMe ? 'bg-[#F0FFF0] text-[#111111]' : 'bg-black/10 text-white'
                                                }`}
                                            >
                                                <span className="block font-semibold">{getSenderName(replyTarget.senderId)}</span>
                                                <span className="block truncate opacity-90">{replyTarget.content}</span>
                                            </button>
                                        )}
                                        {msg.content}
                                        <span className="text-[10px] ml-2 float-right mt-1.5 opacity-70">{formatTime(msg.timestamp)}</span>
                                        {hasReactions && (
                                            <div className="absolute -bottom-3 right-0 flex items-center gap-0.5 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full px-1 py-0.5">
                                                {Object.entries(reactions).map(([reaction, users]) => users.length > 0 ? (
                                                    <span key={reaction} className="text-xs">{reaction}</span>
                                                ) : null)}
                                                <span className="text-[10px] text-gray-500 dark:text-gray-400 ml-1">{Object.values(reactions).flat().length}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>
        </div>
    );
}