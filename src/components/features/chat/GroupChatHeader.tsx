import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronLeft, MoreHorizontal, Users, Phone, UserPlus, Settings, LogOut,
    Search, X, Video
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
    // Lookup map for resolving real member names/avatars in the call picker.
    memberInfo?: Record<string, GroupMemberInfo>;
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
    memberInfo
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
        { icon: Settings, label: 'Group Settings', action: () => { if (group.id) { navigate(`/group-info/${group.id}`); setShowMenu(false); } } },
        { icon: LogOut, label: 'Leave Group', action: () => { if (group.id && currentUser) { leaveGroup(group.id, currentUser.id); navigate('/chats'); setShowMenu(false); } } },
    ];

    return (
        <>
            <div
                className="shrink-0 relative flex justify-between items-center gap-1 px-2 pb-2 bg-card border-b border-border z-10"
                style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
            >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <button type="button" onClick={() => navigate(-1)} className="icon-btn w-10 h-10 -ml-1 shrink-0 text-foreground" aria-label="Go back">
                        <ChevronLeft size={26} strokeWidth={1.75} />
                    </button>
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                        {group.avatar ? (
                            <img src={group.avatar} className="w-full h-full object-cover rounded-full" alt="Group avatar" />
                        ) : (
                            <Users size={18} className="text-primary" />
                        )}
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-[15px] font-bold text-foreground leading-tight truncate">{group.name || 'Group'}</h3>
                        <p className="text-[11px] text-muted-foreground leading-tight truncate">{memberCount} members</p>
                    </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0 text-foreground">
                    <button type="button" onClick={() => setShowSearch(!showSearch)} className="icon-btn w-10 h-10" aria-label="Search messages">
                        <Search size={21} strokeWidth={1.75} className={showSearch ? 'text-primary' : ''} />
                    </button>
                    <button type="button" className="icon-btn w-10 h-10" onClick={() => setShowCallPicker(true)} aria-label="Call a member"><Phone size={21} strokeWidth={1.75} /></button>
                    <div className="relative" ref={menuRef}>
                        <button type="button" onClick={() => setShowMenu(!showMenu)} className="icon-btn w-10 h-10" aria-label="Group options" aria-expanded={showMenu}>
                            <MoreHorizontal size={21} strokeWidth={1.75} />
                        </button>
                        <AnimatePresence>
                            {showMenu && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="absolute top-full right-0 mt-1 bg-card rounded-xl shadow-lg border border-border z-30 overflow-hidden w-48"
                                >
                                    {menuItems.map((item, i) => (
                                        <button type="button" key={i}
                                            onClick={() => item.action()}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary active:bg-accent transition-colors"
                                        >
                                            <item.icon size={18} className={item.label === 'Leave Group' ? 'text-destructive' : 'text-muted-foreground'} />
                                            <span className={`text-sm ${item.label === 'Leave Group' ? 'text-destructive' : 'text-foreground'}`}>{item.label}</span>
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {showSearch && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="shrink-0 bg-card border-b border-border overflow-hidden"
                    >
                        <div className="flex items-center gap-2 px-4 py-2">
                            <Search size={16} className="text-muted-foreground" />
                            <input
                                autoFocus
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search messages..."
                                className="flex-1 bg-secondary rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
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
                        className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
                        onClick={() => setShowCallPicker(false)}
                    >
                        <motion.div
                            initial={{ y: 40, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 40, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            className="w-full sm:max-w-sm bg-card rounded-t-2xl sm:rounded-2xl overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                                <h3 className="text-base font-bold text-foreground">Call a member</h3>
                                <button type="button" onClick={() => setShowCallPicker(false)} className="p-1 rounded-full hover:bg-accent text-muted-foreground">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="max-h-[60dvh] overflow-y-auto">
                                {(group.participants || [])
                                    .filter((id: string) => id !== currentUser?.id)
                                    .map((memberId: string) => {
                                        const info = memberInfo?.[memberId];
                                        const name = info?.name || 'Member';
                                        const avatar = info?.avatar;
                                        return (
                                            <div key={memberId} className="flex items-center gap-3 px-4 py-3 hover:bg-secondary transition-colors">
                                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                                                    {avatar ? (
                                                        <img src={avatar} className="w-full h-full object-cover" alt={name} />
                                                    ) : (
                                                        <Users size={18} className="text-primary" />
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
                                                        className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-primary/10 text-primary active:scale-95 transition-transform"
                                                        aria-label={`Voice call member ${memberId}`}
                                                        title="Voice call"
                                                    >
                                                        <Phone size={18} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setShowCallPicker(false); navigate('/call', { state: { userId: memberId, mode: 'video' } }); }}
                                                        className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-primary/10 text-primary active:scale-95 transition-transform"
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
