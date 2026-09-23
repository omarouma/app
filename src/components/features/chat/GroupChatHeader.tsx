import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronLeft, MoreHorizontal, Users, Phone, UserPlus, Settings, LogOut,
    Search, X, Video, Volume2, VolumeX, Copy, Forward, Trash2, Palette
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Chat, User } from '@/types';

export interface GroupMemberInfo {
    name: string;
    avatar?: string;
}

interface GroupChatHeaderProps {
    group: Chat;
    currentUser: User | null;
    memberCount: number;
    showMenu: boolean;
    setShowMenu: (show: boolean) => void;
    showSearch: boolean;
    setShowSearch: (show: boolean) => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    filteredMsgsLength: number;
    leaveGroup: (groupId: string, userId: string) => void;
    setShowMembersModal: (show: boolean) => void;
    onToggleMute?: () => void;
    // Lookup map for resolving real member names/avatars in the call picker.
    memberInfo?: Record<string, GroupMemberInfo>;
    /** Names of members currently typing (group chat). */
    activeTypingUsers?: string[];
    /** Multi-select mode state + actions. */
    selectionMode?: boolean;
    selectedCount?: number;
    onCopySelected?: () => void;
    onForwardSelected?: () => void;
    onDeleteSelected?: () => void;
    onExitSelection?: () => void;
    /** Toggle the chat background picker. */
    onToggleBgPicker?: () => void;
}

export function GroupChatHeader({
    group,
    currentUser,
    memberCount,
    showMenu,
    setShowMenu,
    showSearch,
    setShowSearch,
    searchQuery,
    setSearchQuery,
    filteredMsgsLength,
    leaveGroup,
    setShowMembersModal,
    onToggleMute,
    memberInfo,
    activeTypingUsers = [],
    selectionMode = false,
    selectedCount = 0,
    onCopySelected,
    onForwardSelected,
    onDeleteSelected,
    onExitSelection,
    onToggleBgPicker,
}: GroupChatHeaderProps) {
    const navigate = useNavigate();
    const menuRef = useRef<HTMLDivElement>(null);
    const [showCallPicker, setShowCallPicker] = useState(false);

    // Close menu on outside click
    useEffect(() => {
        if (!showMenu) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowMenu(false);
            }
        };
        window.addEventListener('mousedown', handler);
        return () => window.removeEventListener('mousedown', handler);
    }, [showMenu, setShowMenu]);

    const menuItems = [
        { icon: UserPlus, label: 'Add Member', action: () => { navigate(`/add-friends`); setShowMenu(false); } },
        { icon: Users, label: 'View Members', action: () => { setShowMembersModal(true); setShowMenu(false); } },
        { icon: Palette, label: 'Chat Background', action: () => { onToggleBgPicker?.(); setShowMenu(false); } },
        { icon: group.isMuted ? Volume2 : VolumeX, label: group.isMuted ? 'Unmute' : 'Mute', action: () => { onToggleMute?.(); setShowMenu(false); } },
        { icon: Settings, label: 'Group Info', action: () => { if (group.id) { navigate(`/group-info/${group.id}`); setShowMenu(false); } } },
        { icon: LogOut, label: 'Leave Group', action: () => { if (group.id && currentUser) { leaveGroup(group.id, currentUser.id); navigate('/chats'); setShowMenu(false); } } },
    ];

    return (
        <>
            {selectionMode ? (
                <div className="shrink-0 flex items-center justify-between px-2 py-3 bg-background border-b border-border z-10">
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={() => onExitSelection?.()} className="p-2 -ml-2 active:bg-muted rounded-full text-foreground" aria-label="Exit selection">
                            <X size={24} strokeWidth={1.5} />
                        </button>
                        <span className="text-base font-bold text-foreground">{selectedCount} selected</span>
                    </div>
                    <div className="flex items-center gap-1 pr-2 text-foreground">
                        <button type="button" onClick={() => onCopySelected?.()} className="p-2.5 active:bg-muted rounded-full" aria-label="Copy selected"><Copy size={20} strokeWidth={1.5} /></button>
                        <button type="button" onClick={() => onForwardSelected?.()} className="p-2.5 active:bg-muted rounded-full" aria-label="Forward selected"><Forward size={20} strokeWidth={1.5} /></button>
                        <button type="button" onClick={() => onDeleteSelected?.()} className="p-2.5 active:bg-muted rounded-full text-[#FF3B30]" aria-label="Delete selected"><Trash2 size={20} strokeWidth={1.5} /></button>
                    </div>
                </div>
            ) : (
            <div className="shrink-0 relative flex justify-between items-center px-2 py-3 bg-background border-b border-border z-10">
                <div className="flex items-center gap-2">
                    <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 active:bg-muted rounded-full text-foreground">
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
                        <h3 className="text-base font-bold text-foreground leading-tight">{group.name || 'Group'}</h3>
                        {activeTypingUsers.length > 0 ? (
                            <p className="text-[11px] text-[#00C300] font-medium truncate max-w-[160px]">
                                {activeTypingUsers.length === 1
                                    ? `${activeTypingUsers[0]} is typing…`
                                    : `${activeTypingUsers.slice(0, 2).join(', ')}${activeTypingUsers.length > 2 ? ` +${activeTypingUsers.length - 2}` : ''} are typing…`}
                            </p>
                        ) : (
                            <p className="text-[11px] text-muted-foreground">{memberCount} members</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-4 pr-3 text-foreground">
                    <button type="button" onClick={() => setShowSearch(!showSearch)} className="active:opacity-60" title="Search messages">
                        <Search size={22} strokeWidth={1.5} className={showSearch ? 'text-[#00C300]' : ''} />
                    </button>
                    <button type="button" className="active:opacity-60" onClick={() => setShowCallPicker(true)} title="Call a member"><Phone size={22} strokeWidth={1.5} /></button>
                    <div className="relative" ref={menuRef}>
                        <button type="button" onClick={() => setShowMenu(!showMenu)} className="active:opacity-60">
                            <MoreHorizontal size={22} strokeWidth={1.5} />
                        </button>
                        <AnimatePresence>
                            {showMenu && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="absolute top-full right-0 mt-1 bg-background rounded-xl shadow-lg border border-border z-30 overflow-hidden w-48"
                                >
                                    {menuItems.map((item, i) => (
                                        <button type="button" key={i}
                                            onClick={() => item.action()}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted active:bg-muted transition-colors"
                                        >
                                            <item.icon size={18} className={item.label === 'Leave Group' ? 'text-[#FF3B30]' : 'text-muted-foreground'} />
                                            <span className={`text-sm ${item.label === 'Leave Group' ? 'text-[#FF3B30]' : 'text-foreground'}`}>{item.label}</span>
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
            )}

            <AnimatePresence>
                {showSearch && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="shrink-0 bg-background border-b border-border overflow-hidden"
                    >
                        <div className="flex items-center gap-2 px-4 py-2">
                            <Search size={16} className="text-muted-foreground" />
                            <input
                                autoFocus
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search messages..."
                                className="flex-1 bg-muted rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-muted-foreground"
                            />
                            <button type="button" onClick={() => { setShowSearch(false); setSearchQuery(''); }} className="text-muted-foreground">
                                <X size={18} />
                            </button>
                        </div>
                        {searchQuery && (
                            <p className="px-4 pb-2 text-muted-foreground text-xs">
                                {filteredMsgsLength} result{filteredMsgsLength !== 1 ? 's' : ''}
                            </p>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Call member picker — choose a group member to call (voice or video) */}
            <AnimatePresence>
                {showCallPicker && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed top-0 right-0 bottom-0 left-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
                        onClick={() => setShowCallPicker(false)}
                    >
                        <motion.div
                            initial={{ y: 40, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 40, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            className="w-full sm:max-w-sm bg-background rounded-t-2xl sm:rounded-2xl overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                                <h3 className="text-base font-bold text-foreground">Call a member</h3>
                                <button type="button" onClick={() => setShowCallPicker(false)} className="p-1 rounded-full hover:bg-muted text-muted-foreground">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="max-h-[60vh] overflow-y-auto">
                                {(group.participants || [])
                                    .filter((id: string) => id !== currentUser?.id)
                                    .map((memberId: string) => {
                                        const info = memberInfo?.[memberId];
                                        const name = info?.name || 'Member';
                                        const avatar = info?.avatar;
                                        return (
                                            <div key={memberId} className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors">
                                                <div className="w-10 h-10 rounded-full bg-[#00C300]/10 flex items-center justify-center shrink-0 overflow-hidden">
                                                    {avatar ? (
                                                        <img src={avatar} loading="lazy" decoding="async" className="w-full h-full object-cover" alt={name} />
                                                    ) : (
                                                        <Users size={18} className="text-[#00C300]" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-foreground truncate">{name}</p>
                                                    <p className="text-[11px] text-muted-foreground truncate">{info?.name ? memberId : 'Group member'}</p>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => { setShowCallPicker(false); navigate('/call', { state: { userId: memberId, mode: 'voice' } }); }}
                                                        className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#00C300]/10 text-[#00C300] active:scale-95 transition-transform"
                                                        aria-label={`Voice call member ${memberId}`}
                                                        title="Voice call"
                                                    >
                                                        <Phone size={18} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setShowCallPicker(false); navigate('/call', { state: { userId: memberId, mode: 'video' } }); }}
                                                        className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#00C300]/10 text-[#00C300] active:scale-95 transition-transform"
                                                        aria-label={`Video call member ${memberId}`}
                                                        title="Video call"
                                                    >
                                                        <Video size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                {(!group.participants || group.participants.filter((id: string) => id !== currentUser?.id).length === 0) && (
                                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">No other members to call.</div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
