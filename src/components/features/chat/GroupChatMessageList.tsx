import { useRef, useEffect } from 'react';
import { getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
import type { Message, User, Chat } from '@/types';

interface GroupChatMessageListProps {
    group: Chat;
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

function toDate(d: unknown): Date {
    if (d instanceof Date) return d;
    if (d) return new Date(String(d));
    return new Date();
}

function formatTime(date: unknown): string {
    return toDate(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDateSeparator(date: unknown) {
    const now = new Date();
    const d = toDate(date);
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

    useEffect(() => {
        if (shouldAutoScrollRef.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [filteredMsgs.length, messagesEndRef]);

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
                    const isSearchMatch = searchQuery && msg.content && msg.content.toLowerCase().includes(searchQuery.toLowerCase());
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
                            <div
                                onContextMenu={(e) => handleContextMenu(e, msg)}
                                className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'} ${isSearchMatch ? 'bg-yellow-200/50 rounded-lg' : ''}`}>
                                {!isMe && (
                                    <img src={sanitizeMediaUrl(getSenderAvatar(msg.senderId)) || getDefaultAvatar(msg.senderId)} alt="" className="w-6 h-6 rounded-full shrink-0" />
                                )}
                                <div className={`max-w-[70%] p-0 relative`}>
                                    {!isMe && <p className="text-[11px] text-white/80 mb-0.5 ml-1">{getSenderName(msg.senderId)}</p>}
                                    <div className={`px-3 py-2 rounded-xl text-sm leading-tight relative ${isMe ? 'bg-[#00C300] text-white rounded-br-none' : 'bg-white text-[#111111] rounded-bl-none'}`}>
                                        {(() => {
                                            const mediaUrl = sanitizeMediaUrl(msg.mediaUrl);
                                            if (mediaUrl && msg.type === 'image') {
                                                return <img src={mediaUrl} alt={msg.content || 'Shared image'} loading="lazy" className="max-w-full max-h-64 rounded-lg object-cover mb-1" />;
                                            }
                                            if (mediaUrl && msg.type === 'video') {
                                                return <video src={mediaUrl} controls playsInline preload="metadata" className="max-w-full max-h-64 rounded-lg mb-1" aria-label="Video message" />;
                                            }
                                            if (mediaUrl && msg.type === 'voice') {
                                                return <audio src={mediaUrl} controls preload="metadata" className="max-w-full mb-1" aria-label="Voice message" />;
                                            }
                                            if (mediaUrl && msg.type === 'file') {
                                                return <a href={mediaUrl} target="_blank" rel="noopener noreferrer" download className="underline font-medium break-all">{msg.content || 'Download file'}</a>;
                                            }
                                            if (mediaUrl && msg.type === 'location') {
                                                return <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="underline">{msg.content || 'Open location'}</a>;
                                            }
                                            return <span className="whitespace-pre-wrap break-words">{msg.content}</span>;
                                        })()}
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

