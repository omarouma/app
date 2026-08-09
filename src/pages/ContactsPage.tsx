import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Search, UserPlus, Star, StarOff, Trash2, Phone, Video,
  MessageCircle, Ban, X, Share2, Globe, QrCode, MapPin, User as UserIcon, Smartphone,
  Contact2, RefreshCw, ChevronDown, ChevronUp, Loader, Download
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useFilteredOnline } from '@/hooks/usePresence';
import { useChatStore } from '@/store/useChatStore';
import { useContacts } from '@/hooks/useContacts';
import EmptyState from '@/components/EmptyState';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import { getDefaultAvatar, sanitizeMediaUrl, formatTime } from '@/lib/utils';
import { toast } from 'sonner';
import type { User } from '@/types';

interface PhoneContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  avatar?: string;
}

interface MatchedContact {
  contact: PhoneContact;
  user: User;
}

const INVITE_LINK = 'https://gagachat.app';
const INVITE_TEXT = 'Join me on GaGa Chat - the free messaging app for everyone!';

const STORAGE_KEY = 'gaga_phone_contacts';
const STORAGE_TIMESTAMP_KEY = 'gaga_contacts_synced_at';

function loadStoredContacts(): PhoneContact[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredContacts(contacts: PhoneContact[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
    localStorage.setItem(STORAGE_TIMESTAMP_KEY, Date.now().toString());
  } catch { /* ignore storage full */ }
}

function getStoredSyncTime(): string | null {
  try {
    const ts = localStorage.getItem(STORAGE_TIMESTAMP_KEY);
    if (!ts) return null;
    const date = new Date(Number(ts));
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  } catch {
    return null;
  }
}

export default function ContactsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    friends, requests, sentRequests, blockedUsers,
    loadingFriends, loadingSentRequests, loadingBlocked,
    subscribeFriends, subscribeSentRequests, subscribeBlockedUsers,
    toggleFavorite, removeFriend, acceptRequest, rejectRequest,
    cancelRequest, blockUser, unblockUser, sendRequest
  } = useFriendStore();
  const { createDirectChat } = useChatStore();
  const { filtered: visibleOnline } = useFilteredOnline(user?.id || '', friends);
  const { contacts: rawContacts, loading: contactsLoading, selectContacts, isSupported: contactsSupported } = useContacts();

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'favorites' | 'requests' | 'sent' | 'blocked' | 'contacts'>('all');
  const [showOnlineOnly, setShowOnlineOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userIdRef = useRef(user?.id);
  useEffect(() => { userIdRef.current = user?.id; }, [user?.id]);

  // Phone contacts state
  const [phoneContacts, setPhoneContacts] = useState<PhoneContact[]>(loadStoredContacts);
  const [matchedContacts, setMatchedContacts] = useState<MatchedContact[]>([]);
  const [unmatchedContacts, setUnmatchedContacts] = useState<PhoneContact[]>([]);
  const [loadingContactMatch, setLoadingContactMatch] = useState(false);
  const [showContactSection, setShowContactSection] = useState(true);
  const [syncTime, setSyncTime] = useState<string | null>(getStoredSyncTime());

  // Subscribe to friends, sent requests, and blocked users (all real-time)
  useEffect(() => {
    if (!user?.id) return;
    const unsubFriends = subscribeFriends(user.id);
    const unsubSent = subscribeSentRequests(user.id);
    const unsubBlocked = subscribeBlockedUsers(user.id);
    return () => { unsubFriends(); unsubSent(); unsubBlocked(); };
  }, [user?.id, subscribeFriends, subscribeSentRequests, subscribeBlockedUsers]);

  // Sync time updater
  useEffect(() => {
    const interval = setInterval(() => setSyncTime(getStoredSyncTime()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Cleanup refresh timeout on unmount
  useEffect(() => () => {
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
  }, []);

  const userId = user?.id;

  const findContactsOnGaga = useCallback(async () => {
    if (!phoneContacts.length || !userId) return;
    setLoadingContactMatch(true);

    try {
      const { queryCollection, where, limit: qLimit } = await import('@/lib/firestore');
      const emails = phoneContacts.map(c => c.email).filter(Boolean) as string[];
      const phones = phoneContacts.map(c => c.phone?.replace(/[^\d]/g, '')).filter(Boolean) as string[];

      const foundUsers: User[] = [];
      await Promise.all([
        ...emails.slice(0, 10).map(async (email) => {
          const data = await queryCollection('users', [where('email', '==', email), qLimit(1)]);
          foundUsers.push(...(data as unknown as User[]));
        }),
        ...phones.slice(0, 10).map(async (phone) => {
          const data = await queryCollection('users', [where('phone', '>=', phone), where('phone', '<=', phone + '\uf8ff'), qLimit(5)]);
          foundUsers.push(...(data as unknown as User[]));
        }),
      ]);

      const unique = Array.from(new Map(foundUsers.map(u => [u.id, u])).values()).filter(u => u.id !== userId);
      const matched: MatchedContact[] = [];
      const matchedContactIds = new Set<string>();

      unique.forEach((u) => {
        const userEmail = u.email || '';
        const userPhone = (u.phone || '').replace(/[^\d]/g, '');
        const matchingContact = phoneContacts.find((c) =>
          (c.email && c.email === userEmail) ||
          (c.phone && c.phone.replace(/[^\d]/g, '') === userPhone)
        );
        if (matchingContact) {
          matched.push({ contact: matchingContact, user: u });
          matchedContactIds.add(matchingContact.id);
        }
      });

      setMatchedContacts(matched);
      setUnmatchedContacts(phoneContacts.filter((c) => !matchedContactIds.has(c.id)));

      if (matched.length > 0) {
        toast.success(`Found ${matched.length} contact${matched.length > 1 ? 's' : ''} on GaGa Chat!`);
      }
    } catch {
      toast.error('Could not match contacts.');
    }

    setLoadingContactMatch(false);
  }, [phoneContacts, userId]);

  const handleRefresh = useCallback(() => {
    if (!userIdRef.current || refreshing) return;
    setRefreshing(true);
    setMatchedContacts([]);
    setUnmatchedContacts([]);
    refreshTimeoutRef.current = setTimeout(() => setRefreshing(false), 1200);
    queueMicrotask(() => { void findContactsOnGaga(); });
  }, [refreshing, findContactsOnGaga]);

  const handleMessage = async (friendId: string) => {
    if (!user?.id) return;
    await createDirectChat(friendId, user.id);
    navigate(`/chat/${friendId}`);
  };

  const handleInvite = async (contactName?: string) => {
    const text = contactName ? `${INVITE_TEXT} — Hey ${contactName}, let's chat!` : INVITE_TEXT;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'GaGa Chat', text, url: INVITE_LINK });
      } else {
        await navigator.clipboard.writeText(`${text} ${INVITE_LINK}`);
        toast.success('Invite link copied to clipboard');
      }
    } catch { /* user cancelled */ }
  };

  // ─── Phone Contacts Import & Matching ───

  const parseImportedContacts = useCallback(() => {
    if (!rawContacts.length) return;
    const parsed: PhoneContact[] = rawContacts.map((c, i) => ({
      id: `contact_${i}_${Date.now()}`,
      name: c.name?.[0] || 'Unknown',
      email: c.email?.[0] || undefined,
      phone: c.tel?.[0] || undefined,
    }));
    setPhoneContacts(parsed);
    saveStoredContacts(parsed);
    setSyncTime('Just now');
  }, [rawContacts]);

  useEffect(() => {
    if (rawContacts.length === 0) return;
    const t = setTimeout(() => { parseImportedContacts(); }, 0);
    return () => clearTimeout(t);
  }, [rawContacts, parseImportedContacts]);
  const prevFriendKeyRef = useRef('');
  useEffect(() => {
    const key = friends.map((f) => f.id).sort().join(',');
    if (key !== prevFriendKeyRef.current && phoneContacts.length > 0) {
      prevFriendKeyRef.current = key;
      queueMicrotask(() => { void findContactsOnGaga(); });
    }
  }, [friends, phoneContacts.length, findContactsOnGaga]);




  // Run contact matching when phone contacts are loaded
  // (queueMicrotask avoids react-hooks/set-state-in-effect lint error)
  useEffect(() => {
    if (phoneContacts.length > 0 && userId) {
      queueMicrotask(() => {
        void findContactsOnGaga();
      });
    }
  }, [phoneContacts, userId, findContactsOnGaga]);


  const handleSyncContacts = async () => {
    if (!contactsSupported) {
      toast.error('Contact access not supported on this device. Try Chrome on Android.');
      return;
    }
    setMatchedContacts([]);
    setUnmatchedContacts([]);
    await selectContacts();
  };

  const handleClearContacts = () => {
    setPhoneContacts([]);
    setMatchedContacts([]);
    setUnmatchedContacts([]);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_TIMESTAMP_KEY);
    setSyncTime(null);
    toast.success('Contacts cleared');
  };

  const handleAddFromContact = async (matchedUserId: string) => {
    if (!user?.id) return;
    try {
      await sendRequest(matchedUserId, user.id);
      toast.success('Friend request sent');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send request');
    }
  };


  const handleMessageFromContact = async (matchedUserId: string) => {
    if (!user?.id) return;
    await createDirectChat(matchedUserId, user.id);
    navigate(`/chat/${matchedUserId}`);
  };

  // ─── Filtering ───

  const filtered = useMemo(() => friends.filter(f => {
    const query = search.toLowerCase();
    const match = f.name?.toLowerCase().includes(query) || f.username?.toLowerCase().includes(query);
    if (tab === 'favorites') return match && user?.favorites?.includes(f.id);
    return match;
  }), [friends, search, tab, user?.favorites]);

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

  const handleCancel = async (requestId: string) => {
    try {
      await cancelRequest(requestId);
      toast.success('Request cancelled');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel request');
    }
  };


  const tabLabels = {
    all: `Friends (${friends.length})`,
    favorites: 'Favorites',
    requests: `Requests (${requests.length})`,
    sent: `Sent (${sentRequests.length})`,
    blocked: `Blocked (${blockedUsers.length})`,
    contacts: `Contacts (${phoneContacts.length})`,
  };

  const hasContactData = phoneContacts.length > 0;

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
    <div className="h-[100dvh] bg-white flex flex-col page-enter">
      {/* Header */}
      <div className="shrink-0 px-5 pt-5 pb-3 flex justify-between items-center">
        <h1 className="text-[26px] font-bold text-[#111111] tracking-tight">Contacts</h1>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate('/qr-scanner?tab=scan')}
            className="w-9 h-9 flex items-center justify-center bg-[#F5F5F5] text-[#111111] rounded-full active:bg-[#EBEBEB] transition-colors tap-scale"
            title="Scan QR"
          >
            <QrCode size={16} />
          </button>
          <button type="button" onClick={() => navigate('/add-friends', { state: { tab: 'nearby' } })}
            className="w-9 h-9 flex items-center justify-center bg-[#F5F5F5] text-[#111111] rounded-full active:bg-[#EBEBEB] transition-colors tap-scale"
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
        <div className="bg-[#F5F5F5] rounded-2xl px-3 py-2.5 flex items-center gap-2 mb-4">
          <Search size={16} className="text-[#ADADAD] ml-0.5 shrink-0" />
          <input
            type="text"
            placeholder="Search contacts…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent border-none focus:outline-none text-[15px] w-full text-[#111111] placeholder-[#ADADAD]"
          />
        </div>

        {/* === PHONE CONTACTS SECTION === */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setShowContactSection(!showContactSection)}
            className="w-full flex items-center justify-between py-2 mb-2"
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#00C300]/10 flex items-center justify-center">
                <Contact2 size={16} className="text-[#00C300]" />
              </div>
              <div className="text-left">
                <h3 className="text-[15px] font-semibold text-[#111111]">Phone Contacts</h3>
                {syncTime && (
                  <p className="text-[11px] text-[#8D8D8D]">Synced {syncTime}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasContactData && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleClearContacts(); }}
                  className="text-[#8D8D8D] text-xs hover:text-[#FF3B30] transition-colors px-2 py-1"
                >
                  Clear
                </button>
              )}
              {showContactSection ? <ChevronUp size={18} className="text-[#8D8D8D]" /> : <ChevronDown size={18} className="text-[#8D8D8D]" />}
            </div>
          </button>

          <AnimatePresence>
            {showContactSection && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                {/* Import Button */}
                {!hasContactData && !contactsLoading && (
                  <div className="bg-[#F5F5F5] rounded-xl p-4 mb-3 text-center">
                    <div className="w-12 h-12 rounded-full bg-[#00C300]/10 flex items-center justify-center mx-auto mb-2">
                      <Smartphone size={24} className="text-[#00C300]" />
                    </div>
                    <p className="text-[#111111] font-medium text-sm mb-1">Find friends from your phone</p>
                    <p className="text-[#8D8D8D] text-xs mb-3">Sync your contacts to see who's already on GaGa Chat</p>
                    <button
                      type="button"
                      onClick={handleSyncContacts}
                      className="flex items-center gap-2 mx-auto px-4 py-2 bg-[#00C300] text-white text-sm font-medium rounded-full active:bg-[#00A300] transition-colors"
                    >
                      <Download size={16} />
                      Import Contacts
                    </button>
                    {!contactsSupported && (
                      <p className="text-[#FF9800] text-[10px] mt-2">Contact import not supported on this browser. Try Chrome on Android.</p>
                    )}
                  </div>
                )}

                {/* Loading */}
                {contactsLoading && (
                  <div className="flex flex-col items-center py-4 mb-3">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-6 h-6 border-2 border-[#00C300] border-t-transparent rounded-full mb-2"
                    />
                    <p className="text-[#8D8D8D] text-xs">Importing contacts...</p>
                  </div>
                )}

                {/* Loading contact match */}
                {loadingContactMatch && (
                  <div className="flex items-center justify-center py-3 mb-2">
                    <Loader size={16} className="animate-spin text-[#00C300] mr-2" />
                    <p className="text-[#8D8D8D] text-xs">Finding friends on GaGa Chat...</p>
                  </div>
                )}

                {/* On GaGa Chat */}
                {matchedContacts.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-[#00C300] uppercase tracking-wider">On GaGa Chat</p>
                      <span className="text-[#8D8D8D] text-xs">{matchedContacts.length}</span>
                    </div>
                    <div className="space-y-1">
                      {matchedContacts.map(({ contact, user: matchedUser }) => {
                        const isOnline = visibleOnline[matchedUser.id];
                        const friendStatus = friends.find((f: User) => f.id === matchedUser.id);
                        const isFriend = !!friendStatus;
                        return (
                          <motion.div
                            key={matchedUser.id}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-3 p-2.5 bg-[#00C300]/5 rounded-xl"
                          >
                            <div className="relative">
                              <div className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center overflow-hidden">
                                {sanitizeMediaUrl(matchedUser.avatar) ? (
                                  <img src={sanitizeMediaUrl(matchedUser.avatar)} className="w-full h-full object-cover" alt="User avatar" />
                                ) : (
                                  <img src={getDefaultAvatar(matchedUser.id || matchedUser.name || contact.name)} className="w-full h-full object-cover" alt="User avatar" />
                                )}
                              </div>
                              {isOnline && (
                                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#00C300] rounded-full border-2 border-white" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[#111111] text-sm font-medium truncate">{contact.name}</p>
                              <p className="text-[#8D8D8D] text-xs truncate">{matchedUser.phone || matchedUser.email || matchedUser.username || '@user'}</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {isFriend ? (
                                <button
                                  type="button"
                                  onClick={() => handleMessageFromContact(matchedUser.id)}
                                  className="px-3 py-1.5 bg-[#00C300] text-white text-xs rounded-full font-medium active:bg-[#00A300] transition-colors"
                                >
                                  Message
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleAddFromContact(matchedUser.id)}
                                  className="px-3 py-1.5 bg-[#00C300] text-white text-xs rounded-full font-medium active:bg-[#00A300] transition-colors"
                                >
                                  Add
                                </button>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Invite Friends */}
                {unmatchedContacts.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-[#8D8D8D] uppercase tracking-wider">Invite to GaGa Chat</p>
                      <span className="text-[#8D8D8D] text-xs">{unmatchedContacts.length}</span>
                    </div>
                    <div className="space-y-1">
                      {unmatchedContacts.slice(0, 10).map((contact) => (
                        <motion.div
                          key={contact.id}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-center gap-3 p-2.5 bg-[#F5F5F5] rounded-xl"
                        >
                          <div className="w-10 h-10 rounded-full bg-[#E8F5E9] flex items-center justify-center">
                            <UserIcon size={18} className="text-[#00C300]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[#111111] text-sm font-medium truncate">{contact.name}</p>
                            <p className="text-[#8D8D8D] text-xs truncate">{contact.phone || contact.email || 'No contact info'}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleInvite(contact.name)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-white text-[#00C300] text-xs rounded-full font-medium active:bg-gray-100 transition-colors border border-[#00C300]/20"
                          >
                            <Share2 size={12} /> Invite
                          </button>
                        </motion.div>
                      ))}
                      {unmatchedContacts.length > 10 && (
                        <p className="text-center text-[#8D8D8D] text-xs py-1">
                          +{unmatchedContacts.length - 10} more contacts
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Re-sync button when contacts exist */}
                {hasContactData && !contactsLoading && !loadingContactMatch && (
                  <button
                    type="button"
                    onClick={handleSyncContacts}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#F5F5F5] rounded-xl text-[#8D8D8D] text-xs font-medium hover:text-[#111111] transition-colors mb-2"
                  >
                    <RefreshCw size={14} /> Re-sync contacts
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="border-t border-[#EBEBEB] my-2" />

        {/* Tabs */}
        <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide">
          {(['all', 'favorites', 'requests', 'sent', 'blocked'] as const).map(t => (
            <button type="button" key={t}
              onClick={() => setTab(t)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap tap-scale ${
                tab === t
                  ? 'bg-[#111111] text-white shadow-sm'
                  : 'bg-[#F5F5F5] text-[#8D8D8D] hover:text-[#111111]'
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  showOnlineOnly
                    ? 'bg-[#00C300]/10 text-[#00C300]'
                    : 'bg-[#F5F5F5] text-[#8D8D8D]'
                }`}
              >
                <Globe size={12} />
                {showOnlineOnly ? `Online (${onlineFriends.length})` : 'All Friends'}
              </button>
              {showOnlineOnly && (
                <button type="button" onClick={() => setShowOnlineOnly(false)}
                  className="text-[#8D8D8D] text-xs hover:text-[#111111] transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button type="button" onClick={() => handleInvite()}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#F5F5F5] text-[#8D8D8D] text-xs rounded-full font-medium hover:text-[#111111] transition-colors"
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
              {requests.length === 0 ? (
                <EmptyState
                  icon={UserPlus}
                  title="No pending requests"
                  description="Friend requests will appear here"
                  compact
                />
              ) : (
                requests.map((req, i) => (
                  <motion.div
                    key={req.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-3 p-3 bg-[#F5F5F5] rounded-xl"
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
                      className="w-11 h-11 rounded-full object-cover shrink-0 bg-white"
                      onError={(e) => {
                        const targetId =
                          (req as { fromUserId?: string }).fromUserId ||
                          (req as { from?: string }).from ||
                          req.id;
                        (e.target as HTMLImageElement).src = getDefaultAvatar(targetId);
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[#111111] text-sm font-medium truncate">
                        {(req as { fromUser?: { name?: string } }).fromUser?.name || 'Loading...'}
                      </p>
                      <p className="text-[#8D8D8D] text-xs truncate">
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
                        className="px-3 py-1.5 bg-white text-[#8D8D8D] text-xs rounded-full active:bg-gray-100 transition-colors"
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
                    className="flex items-center gap-3 p-3 bg-[#F5F5F5] rounded-xl"
                  >
                    <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center shrink-0 overflow-hidden">
                      {sanitizeMediaUrl(req.toUser?.avatar) ? (
                        <img src={sanitizeMediaUrl(req.toUser?.avatar)} className="w-full h-full object-cover" alt="User avatar" />
                      ) : (
                        <img src={getDefaultAvatar(req.toUser?.id || req.toUser?.name || 'U')} className="w-full h-full object-cover" alt="User avatar" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#111111] text-sm font-medium">{req.toUser?.name || 'User'}</p>
                      <p className="text-[#8D8D8D] text-xs">@{req.toUser?.username || req.toUserId.slice(0, 8)}</p>
                      <p className="text-[#8D8D8D] text-[10px] mt-0.5">Sent {formatTime(req.timestamp)}</p>
                    </div>
                    <button type="button" onClick={() => handleCancel(req.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-white text-[#FF3B30] text-xs rounded-full font-medium active:bg-gray-100 transition-colors"
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
                    className="flex items-center gap-3 p-3 bg-[#F5F5F5] rounded-xl"
                  >
                    <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center shrink-0 overflow-hidden">
                      {sanitizeMediaUrl(record.blockedUser?.avatar) ? (
                        <img src={sanitizeMediaUrl(record.blockedUser?.avatar)} className="w-full h-full object-cover" alt="User avatar" />
                      ) : (
                        <img src={getDefaultAvatar(record.blockedUser?.id || record.blockedUser?.name || 'U')} className="w-full h-full object-cover" alt="User avatar" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#111111] text-sm font-medium">{record.blockedUser?.name || 'User'}</p>
                      <p className="text-[#8D8D8D] text-xs">@{record.blockedUser?.username || record.blockedId.slice(0, 8)}</p>
                      {record.reason && (
                        <p className="text-[#8D8D8D] text-[10px] mt-0.5 truncate">Reason: {record.reason}</p>
                      )}
                    </div>
                    <button type="button" onClick={() => handleUnblock(record.blockedId)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-white text-[#00C300] text-xs rounded-full font-medium active:bg-gray-100 transition-colors"
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
                        <span className="text-xs font-bold text-[#8D8D8D] uppercase tracking-wider">{letter}</span>
                      </div>
                      {friendsInGroup.map((friend, i) => {
                        const isFav = user?.favorites?.includes(friend.id);
                        const isOnline = visibleOnline[friend.id];
                        const showMenu = actionMenu === friend.id;

                        return (
                          <motion.div
                            key={friend.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.03 }}
                            className="relative"
                          >
                      <button type="button" onClick={() => setActionMenu(showMenu ? null : friend.id)}
                        className="w-full flex items-center py-2.5 active:bg-gray-50 rounded-xl transition-colors text-left"
                      >
                        <div className="relative mr-4">
                          <div className="w-11 h-11 rounded-full bg-[#F5F5F5] flex items-center justify-center overflow-hidden">
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
                            <h3 className="text-[16px] font-medium text-[#111111]">{friend.name || 'User'}</h3>
                            {isFav && <Star size={12} className="text-[#00C300] fill-current" />}
                          </div>
                          <p className="text-[12px] text-[#8D8D8D] truncate">
                            {friend.statusMessage || (isOnline ? 'Online' : 'Offline')}
                          </p>
                        </div>
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
                className="w-5 h-5 flex items-center justify-center text-[9px] font-bold text-[#8D8D8D] hover:text-[#00C300] hover:bg-[#F5F5F5] rounded transition-colors"
              >
                {letter}
              </button>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}