import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Search, UserPlus, Star, StarOff, Trash2, Phone, Video,
  MessageCircle, Ban, X, Share2, Globe, QrCode, MapPin, User as UserIcon, MoreVertical
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useFilteredOnline } from '@/hooks/usePresence';
import { useChatStore } from '@/store/useChatStore';
import EmptyState from '@/components/EmptyState';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import ContactPreviewSheet from '@/components/features/contacts/ContactPreviewSheet';
import { getDefaultAvatar, sanitizeMediaUrl, formatTime } from '@/lib/utils';
import { toast } from 'sonner';
import { copyToClipboard, nativeShare } from '@/lib/share';
import { usePageTitle } from '@/hooks/useDocumentTitle';
import type { User } from '@/types';

const INVITE_LINK = 'https://gagachat.app';
const INVITE_TEXT = 'Join me on GaGa Chat - the free messaging app for everyone!';

export default function ContactsPage() {
  usePageTitle('Contacts');

  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    friends, requests, sentRequests, blockedUsers,
    loadingFriends, loadingSentRequests, loadingBlocked,
    subscribeFriends, subscribeSentRequests, subscribeBlockedUsers,
    toggleFavorite, removeFriend, acceptRequest, rejectRequest,
    cancelRequest, blockUser, unblockUser, sendRequest, getRecentContacts
  } = useFriendStore();
  const { createDirectChat } = useChatStore();
  const { filtered: visibleOnline } = useFilteredOnline(user?.id || '', friends);

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'favorites' | 'requests' | 'sent' | 'blocked'>('all');
  const [showOnlineOnly, setShowOnlineOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userIdRef = useRef(user?.id);
  useEffect(() => { userIdRef.current = user?.id; }, [user?.id]);

  const [previewUser, setPreviewUser] = useState<User | null>(null);
  const [recentContacts, setRecentContacts] = useState<User[]>([]);

  // Subscribe to friends, sent requests, and blocked users (all real-time)
  useEffect(() => {
    if (!user?.id) return;
    const unsubFriends = subscribeFriends(user.id);
    const unsubSent = subscribeSentRequests(user.id);
    const unsubBlocked = subscribeBlockedUsers(user.id);
    return () => { unsubFriends(); unsubSent(); unsubBlocked(); };
  }, [user?.id, subscribeFriends, subscribeSentRequests, subscribeBlockedUsers]);

  // Cleanup refresh timeout on unmount
  useEffect(() => () => {
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
  }, []);

  // Load recent contacts (most recently chatted direct contacts)
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    getRecentContacts(user.id)
      .then((list) => { if (!cancelled) setRecentContacts(list || []); })
      .catch(() => { if (!cancelled) setRecentContacts([]); });
    return () => { cancelled = true; };
  }, [user?.id, getRecentContacts]);

  const handleRefresh = useCallback(() => {
    if (!userIdRef.current || refreshing) return;
    setRefreshing(true);
    refreshTimeoutRef.current = setTimeout(() => setRefreshing(false), 1200);
  }, [refreshing]);

  const handleMessage = async (friendId: string) => {
    if (!user?.id) return;
    await createDirectChat(friendId, user.id);
    navigate(`/chat/${friendId}`);
  };

  const handleInvite = async (contactName?: string) => {
    const text = contactName ? `${INVITE_TEXT} — Hey ${contactName}, let's chat!` : INVITE_TEXT;
    try {
      const usedNative = await nativeShare({ title: 'GaGa Chat', text, url: INVITE_LINK });
      if (!usedNative) {
        const ok = await copyToClipboard(`${text} ${INVITE_LINK}`);
        if (ok) toast.success('Invite link copied to clipboard');
      }
    } catch { /* user cancelled */ }
  };

  // ─── Filtering ───

  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    const blockedIds = new Set(blockedUsers.map((b) => b.blockedId));
    const results = friends.filter(f => {
      // Gracefully hide accounts the user has blocked
      if (blockedIds.has(f.id)) return false;
      const match = f.name?.toLowerCase().includes(query) || f.username?.toLowerCase().includes(query);
      if (tab === 'favorites') return match && user?.favorites?.includes(f.id);
      return match;
    });

    return [...results].sort((a, b) => {
      const aFav = user?.favorites?.includes(a.id) ? 1 : 0;
      const bFav = user?.favorites?.includes(b.id) ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;
      if (visibleOnline[a.id] !== visibleOnline[b.id]) return Number(visibleOnline[b.id]) - Number(visibleOnline[a.id]);
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [friends, search, tab, user?.favorites, visibleOnline, blockedUsers]);

  const onlineFriends = filtered.filter(f => visibleOnline[f.id]);
  const displayFriends = showOnlineOnly ? onlineFriends : filtered;

  const handleBlock = async (friendId: string) => {
    if (!user?.id) return;
    try {
      await blockUser(friendId, user.id);
      toast.success('User blocked');
      setActionMenu(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to block user');
    }
  };

  const handleUnblock = async (blockedId: string) => {
    if (!user?.id) return;
    try {
      await unblockUser(blockedId, user.id);
      toast.success('User unblocked');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to unblock user');
    }
  };

  // ─── Contact preview sheet handlers ───
  const openPreview = useCallback((u: User) => setPreviewUser(u), []);

  const previewIsFriend = useMemo(
    () => (previewUser ? friends.some((f) => f.id === previewUser.id) : false),
    [previewUser, friends],
  );
  const previewIsFavorite = useMemo(
    () => (previewUser ? !!user?.favorites?.includes(previewUser.id) : false),
    [previewUser, user?.favorites],
  );
  const previewIsBlocked = useMemo(
    () => (previewUser ? blockedUsers.some((b) => b.blockedId === previewUser.id) : false),
    [previewUser, blockedUsers],
  );
  const previewRequestSent = useMemo(
    () => (previewUser ? sentRequests.some((r) => r.toUserId === previewUser.id) : false),
    [previewUser, sentRequests],
  );
  const previewRequestReceived = useMemo(
    () => (previewUser ? requests.some((r) => r.from === previewUser.id) : false),
    [previewUser, requests],
  );

  const handlePreviewMessage = useCallback(async (id: string) => {
    setPreviewUser(null);
    await handleMessage(id);
  }, [handleMessage]);

  const handlePreviewVoice = useCallback((id: string) => {
    setPreviewUser(null);
    navigate('/call', { state: { userId: id, mode: 'voice' } });
  }, [navigate]);

  const handlePreviewVideo = useCallback((id: string) => {
    setPreviewUser(null);
    navigate('/call', { state: { userId: id, mode: 'video' } });
  }, [navigate]);

  const handlePreviewToggleFavorite = useCallback(async (id: string) => {
    if (!user?.id) return;
    await toggleFavorite(id, user.id, user.favorites || []);
  }, [user, toggleFavorite]);

  const handlePreviewBlock = useCallback(async (id: string) => {
    setPreviewUser(null);
    await handleBlock(id);
  }, [handleBlock]);

  const handlePreviewUnblock = useCallback(async (id: string) => {
    setPreviewUser(null);
    await handleUnblock(id);
  }, [handleUnblock]);

  const handlePreviewAddFriend = useCallback(async (id: string) => {
    if (!user?.id) return;
    try {
      await sendRequest(id, user.id);
      toast.success('Friend request sent');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send request');
    }
  }, [user, sendRequest]);

  const handlePreviewViewProfile = useCallback((id: string) => {
    setPreviewUser(null);
    navigate(`/profile/${id}`);
  }, [navigate]);

  const handleCancel = async (requestId: string) => {
    try {
      await cancelRequest(requestId);
      toast.success('Request cancelled');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel request');
    }
  };


  const sortedRequests = useMemo(
    () => [...requests].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [requests],
  );

  const tabLabels = {
    all: `Friends (${friends.length})`,
    favorites: 'Favorites',
    requests: `Requests (${sortedRequests.length})`,
    sent: `Sent (${sentRequests.length})`,
    blocked: `Blocked (${blockedUsers.length})`,
  };

  // Group friends alphabetically for A-Z sidebar
  const groupedFriends = useMemo(() => {
    const groups: Record<string, User[]> = {};
    displayFriends.forEach((f: User) => {
      const letter = (f.name || 'U').charAt(0).toUpperCase();
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(f);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)) as [string, User[]][];
  }, [displayFriends]);

  const alphabetLetters = useMemo(() => groupedFriends.map(([letter]) => letter), [groupedFriends]);

  return (
    <div className="h-[100dvh] bg-background flex flex-col page-enter">
      {/* Header */}
      <div className="shrink-0 px-5 pt-5 pb-3 flex justify-between items-center">
        <h1 className="text-[26px] font-bold text-foreground tracking-tight">Contacts</h1>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate('/qr-scanner?tab=scan')}
            className="w-9 h-9 flex items-center justify-center bg-muted text-foreground rounded-full active:bg-muted transition-colors tap-scale"
            title="Scan QR"
          >
            <QrCode size={16} />
          </button>
          <button type="button" onClick={() => navigate('/add-friends', { state: { tab: 'nearby' } })}
            className="w-9 h-9 flex items-center justify-center bg-muted text-foreground rounded-full active:bg-muted transition-colors tap-scale"
            title="Find Nearby"
          >
            <MapPin size={16} />
          </button>
          <button type="button" onClick={() => navigate('/add-friends')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#00C300] text-white text-xs font-bold rounded-full active:bg-[#00A300] transition-colors tap-scale shadow-sm"
          >
            <UserPlus size={14} strokeWidth={2} />
            Add
          </button>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-nav"
        onTouchStart={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop <= 0) {
            const startY = e.touches[0].clientY;
            const handleMove = (me: TouchEvent) => {
              const diff = me.touches[0].clientY - startY;
              if (diff > 80) {
                handleRefresh();
                el.removeEventListener('touchmove', handleMove);
              }
            };
            el.addEventListener('touchmove', handleMove, { once: true });
          }
        }}
      >
        {/* Pull to refresh indicator */}
        {refreshing && (
          <div className="flex justify-center py-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-5 h-5 border-2 border-[#00C300] border-t-transparent rounded-full"
            />
          </div>
        )}

        {/* Search */}
        <div className="bg-muted rounded-2xl px-3 py-2.5 flex items-center gap-2 mb-4">
          <Search size={16} className="text-muted-foreground ml-0.5 shrink-0" />
          <input
            type="text"
            placeholder="Search contacts…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent border-none focus:outline-none text-[15px] w-full text-foreground placeholder:text-muted-foreground"
            aria-label="Search contacts"
          />
        </div>

        {/* === RECENT CONTACTS ROW === */}
        {!search && recentContacts.length > 0 && (
          <div className="mb-4">
            <h3 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-0.5">Recent</h3>
            <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
              {recentContacts
                .filter((rc) => !blockedUsers.some((b) => b.blockedId === rc.id))
                .slice(0, 12)
                .map((rc) => (
                  <button
                    key={rc.id}
                    type="button"
                    onClick={() => openPreview(rc)}
                    className="flex flex-col items-center gap-1.5 shrink-0 w-[64px] active:opacity-70 transition-opacity"
                    aria-label={`Open ${rc.name || rc.username || 'contact'}`}
                  >
                    <div className="relative">
                      <img
                        src={sanitizeMediaUrl(rc.avatar) || getDefaultAvatar(rc.name || rc.username || rc.id)}
                        alt=""
                        className="w-14 h-14 rounded-full object-cover bg-muted"
                        loading="lazy"
                      />
                      {visibleOnline[rc.id] && (
                        <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-[#00C300] border-2 border-white" />
                      )}
                    </div>
                    <span className="text-[11px] text-foreground truncate w-full text-center">
                      {(rc.name || rc.username || 'User').split(' ')[0]}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        )}

        <div className="border-t border-border my-2" />

        {/* Tabs */}
        <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide">
          {(['all', 'favorites', 'requests', 'sent', 'blocked'] as const).map(t => (
            <button type="button" key={t}
              onClick={() => setTab(t)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap tap-scale ${tab === t
                ? 'bg-[#111111] text-white shadow-sm'
                : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
            >
              {tabLabels[t]}
            </button>
          ))}
        </div>

        {/* Online filter (only for friends tabs) */}
        {(tab === 'all' || tab === 'favorites') && (
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowOnlineOnly(!showOnlineOnly)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${showOnlineOnly
                  ? 'bg-[#00C300]/10 text-[#00C300]'
                  : 'bg-muted text-muted-foreground'
                  }`}
              >
                <Globe size={12} />
                {showOnlineOnly ? `Online (${onlineFriends.length})` : 'All Friends'}
              </button>
              {showOnlineOnly && (
                <button type="button" onClick={() => setShowOnlineOnly(false)}
                  className="text-muted-foreground text-xs hover:text-foreground transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button type="button" onClick={() => handleInvite()}
              className="flex items-center gap-1 px-3 py-1.5 bg-muted text-muted-foreground text-xs rounded-full font-medium hover:text-foreground transition-colors"
            >
              <Share2 size={12} /> Invite
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* Requests Tab */}
          {tab === 'requests' && (
            <motion.div
              key="requests"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              {sortedRequests.length === 0 ? (
                <EmptyState
                  icon={UserPlus}
                  title="No pending requests"
                  description="Friend requests will appear here"
                  compact
                />
              ) : (
                sortedRequests.map((req, i) => (
                  <motion.div
                    key={req.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-3 p-3 bg-muted rounded-xl"
                  >
                    <img
                      src={
                        sanitizeMediaUrl((req as { fromUser?: { avatar?: string } }).fromUser?.avatar) ||
                        getDefaultAvatar(
                          (req as { fromUserId?: string }).fromUserId ||
                          (req as { from?: string }).from ||
                          req.id
                        )
                      }
                      alt="User avatar"
                      className="w-11 h-11 rounded-full object-cover shrink-0 bg-background"
                      onError={(e) => {
                        const targetId =
                          (req as { fromUserId?: string }).fromUserId ||
                          (req as { from?: string }).from ||
                          req.id;
                        (e.target as HTMLImageElement).src = getDefaultAvatar(targetId);
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground text-sm font-medium truncate">
                        {(req as { fromUser?: { name?: string } }).fromUser?.name || 'Loading...'}
                      </p>
                      <p className="text-muted-foreground text-xs truncate">
                        @{(req as { fromUser?: { username?: string } }).fromUser?.username || 'user'}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={async () => {
                        try { await acceptRequest(req.id); toast.success('Friend request accepted'); }
                        catch { toast.error('Failed to accept request'); }
                      }}
                        className="px-3 py-1.5 bg-[#00C300] text-white text-xs rounded-full font-medium active:bg-[#00A300] transition-colors"
                      >
                        Accept
                      </button>
                      <button type="button" onClick={async () => {
                        try { await rejectRequest(req.id); toast.success('Friend request declined'); }
                        catch { toast.error('Failed to decline request'); }
                      }}
                        className="px-3 py-1.5 bg-background text-muted-foreground text-xs rounded-full active:bg-muted transition-colors"
                      >
                        Decline
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </motion.div>
          )}

          {/* Sent Requests Tab */}
          {tab === 'sent' && (
            <motion.div
              key="sent"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              {loadingSentRequests ? (
                <LoadingSkeleton count={3} variant="list" />
              ) : sentRequests.length === 0 ? (
                <EmptyState
                  icon={UserPlus}
                  title="No sent requests"
                  description="Requests you send will appear here"
                  compact
                />
              ) : (
                sentRequests.map((req, i) => (
                  <motion.div
                    key={req.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-3 p-3 bg-muted rounded-xl"
                  >
                    <div className="w-11 h-11 rounded-full bg-background flex items-center justify-center shrink-0 overflow-hidden">
                      {sanitizeMediaUrl(req.toUser?.avatar) ? (
                        <img src={sanitizeMediaUrl(req.toUser?.avatar)} className="w-full h-full object-cover" alt="User avatar" />
                      ) : (
                        <img src={getDefaultAvatar(req.toUser?.id || req.toUser?.name || 'U')} className="w-full h-full object-cover" alt="User avatar" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground text-sm font-medium">{req.toUser?.name || 'User'}</p>
                      <p className="text-muted-foreground text-xs">@{req.toUser?.username || req.toUserId.slice(0, 8)}</p>
                      <p className="text-muted-foreground text-[10px] mt-0.5">Sent {formatTime(req.timestamp)}</p>
                    </div>
                    <button type="button" onClick={() => handleCancel(req.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-background text-[#FF3B30] text-xs rounded-full font-medium active:bg-muted transition-colors"
                    >
                      <X size={12} /> Cancel
                    </button>
                  </motion.div>
                ))
              )}
            </motion.div>
          )}

          {/* Blocked Users Tab */}
          {tab === 'blocked' && (
            <motion.div
              key="blocked"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              {loadingBlocked ? (
                <LoadingSkeleton count={3} variant="list" />
              ) : blockedUsers.length === 0 ? (
                <EmptyState
                  icon={Ban}
                  title="No blocked users"
                  description="Blocked users will appear here"
                  compact
                />
              ) : (
                blockedUsers.map((record, i) => (
                  <motion.div
                    key={record.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-3 p-3 bg-muted rounded-xl"
                  >
                    <div className="w-11 h-11 rounded-full bg-background flex items-center justify-center shrink-0 overflow-hidden">
                      {sanitizeMediaUrl(record.blockedUser?.avatar) ? (
                        <img src={sanitizeMediaUrl(record.blockedUser?.avatar)} className="w-full h-full object-cover" alt="User avatar" />
                      ) : (
                        <img src={getDefaultAvatar(record.blockedUser?.id || record.blockedUser?.name || 'U')} className="w-full h-full object-cover" alt="User avatar" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground text-sm font-medium">{record.blockedUser?.name || 'User'}</p>
                      <p className="text-muted-foreground text-xs">@{record.blockedUser?.username || record.blockedId.slice(0, 8)}</p>
                      {record.reason && (
                        <p className="text-muted-foreground text-[10px] mt-0.5 truncate">Reason: {record.reason}</p>
                      )}
                    </div>
                    <button type="button" onClick={() => handleUnblock(record.blockedId)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-background text-[#00C300] text-xs rounded-full font-medium active:bg-muted transition-colors"
                    >
                      <UserPlus size={12} /> Unblock
                    </button>
                  </motion.div>
                ))
              )}
            </motion.div>
          )}

          {/* All / Favorites Tab */}
          {(tab === 'all' || tab === 'favorites') && (
            <motion.div
              key="friends"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-0.5"
            >
              {loadingFriends ? (
                <LoadingSkeleton count={4} variant="list" />
              ) : displayFriends.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title={tab === 'favorites' ? 'No favorites yet' : showOnlineOnly ? 'No friends online' : 'No friends yet'}
                  description={tab === 'favorites' ? 'Star friends to add them here' : showOnlineOnly ? 'Check back later when friends are online' : 'Tap Add Friends to discover people'}
                  action={
                    <button type="button" onClick={() => navigate('/add-friends')}
                      className="text-[#00C300] text-sm font-medium hover:underline"
                    >
                      Add Friends
                    </button>
                  }
                  compact
                />
              ) : (
                groupedFriends.map(([letter, friendsInGroup]) => (
                  <div key={letter} id={`contact-section-${letter.replace(/[^A-Z]/g, '')}`}>
                    <div className="sticky top-0 bg-white/95 backdrop-blur-sm z-10 py-1 px-1">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{letter}</span>
                    </div>
                    {friendsInGroup.map((friend, i) => {
                      const isFav = user?.favorites?.includes(friend.id);
                      const isOnline = visibleOnline[friend.id];
                      const showMenu = actionMenu === friend.id;
                      const isDeleted = !friend.name || friend.name === 'User' || friend.name === 'Deleted User' || friend.name === 'Deleted account';

                      return (
                        <motion.div
                          key={friend.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.03 }}
                          className="relative"
                        >
                          <button type="button" onClick={() => openPreview(friend)}
                            className="w-full flex items-center py-2.5 active:bg-muted rounded-xl transition-colors text-left"
                          >
                            <div className="relative mr-4">
                              <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                                {sanitizeMediaUrl(friend.avatar) ? (
                                  <img src={sanitizeMediaUrl(friend.avatar)} className="w-full h-full object-cover" alt="User avatar" />
                                ) : (
                                  <img src={getDefaultAvatar(friend.id || friend.name || 'U')} className="w-full h-full object-cover" alt="User avatar" />
                                )}
                              </div>
                              {isOnline && (
                                <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#00C300] rounded-full border-2 border-white" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <h3 className="text-[16px] font-medium text-foreground">{friend.name || 'User'}</h3>
                                {isFav && <Star size={12} className="text-[#00C300] fill-current" />}
                                {isDeleted && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">Deleted</span>
                                )}
                              </div>
                              <p className="text-[12px] text-muted-foreground truncate">
                                {isDeleted ? 'This account is no longer available' : (friend.statusMessage || (isOnline ? 'Online' : 'Offline'))}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setActionMenu(showMenu ? null : friend.id); }}
                              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted shrink-0"
                              aria-label={`More actions for ${friend.name}`}
                            >
                              <MoreVertical size={18} className="text-muted-foreground" />
                            </button>
                          </button>

                          {/* Action Menu */}
                          <AnimatePresence>
                            {showMenu && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="flex flex-wrap gap-2 px-14 pb-2">
                                  <button type="button" onClick={(e) => { e.stopPropagation(); navigate(`/profile/${friend.id}`); setActionMenu(null); }}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-[#2196F3]/10 text-[#2196F3] text-xs rounded-full font-medium active:bg-[#2196F3]/20 transition-colors"
                                  >
                                    <UserIcon size={12} /> Profile
                                  </button>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); handleMessage(friend.id); }}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-[#00C300]/10 text-[#00C300] text-xs rounded-full font-medium active:bg-[#00C300]/20 transition-colors"
                                  >
                                    <MessageCircle size={12} /> Message
                                  </button>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); navigate('/call', { state: { userId: friend.id, mode: 'voice' } }); }}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-[#2196F3]/10 text-[#2196F3] text-xs rounded-full font-medium active:bg-[#2196F3]/20 transition-colors"
                                  >
                                    <Phone size={12} /> Voice
                                  </button>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); navigate('/call', { state: { userId: friend.id, mode: 'video' } }); }}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-[#9C27B0]/10 text-[#9C27B0] text-xs rounded-full font-medium active:bg-[#9C27B0]/20 transition-colors"
                                  >
                                    <Video size={12} /> Video
                                  </button>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); toggleFavorite(friend.id, user?.id || '', user?.favorites || []); }}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-[#FF9800]/10 text-[#FF9800] text-xs rounded-full font-medium active:bg-[#FF9800]/20 transition-colors"
                                  >
                                    {isFav ? <><StarOff size={12} /> Unstar</> : <><Star size={12} /> Star</>}
                                  </button>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); handleBlock(friend.id); }}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-[#FF3B30]/10 text-[#FF3B30] text-xs rounded-full font-medium active:bg-[#FF3B30]/20 transition-colors"
                                  >
                                    <Ban size={12} /> Block
                                  </button>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); removeFriend(friend.id, user?.id || ''); setActionMenu(null); }}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-[#FF3B30]/10 text-[#FF3B30] text-xs rounded-full font-medium active:bg-[#FF3B30]/20 transition-colors"
                                  >
                                    <Trash2 size={12} /> Remove
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}
                  </div>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
        {tab === 'all' && alphabetLetters.length > 5 && (
          <div className="fixed right-1 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-0.5 py-2">
            {alphabetLetters.map(letter => (
              <button
                key={letter}
                type="button"
                onClick={() => {
                  const safeId = letter.replace(/[^A-Z]/g, '');
                  const el = document.getElementById('contact-section-' + safeId);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="w-5 h-5 flex items-center justify-center text-[9px] font-bold text-muted-foreground hover:text-[#00C300] hover:bg-muted rounded transition-colors"
              >
                {letter}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Contact preview sheet (shown before starting a chat) */}
      <ContactPreviewSheet
        user={previewUser}
        isFriend={previewIsFriend}
        isFavorite={previewIsFavorite}
        isBlocked={previewIsBlocked}
        requestSent={previewRequestSent}
        requestReceived={previewRequestReceived}
        onClose={() => setPreviewUser(null)}
        onMessage={handlePreviewMessage}
        onVoiceCall={handlePreviewVoice}
        onVideoCall={handlePreviewVideo}
        onToggleFavorite={handlePreviewToggleFavorite}
        onBlock={handlePreviewBlock}
        onUnblock={handlePreviewUnblock}
        onAddFriend={handlePreviewAddFriend}
        onViewProfile={handlePreviewViewProfile}
      />

    </div>
  );
}