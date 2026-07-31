/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Search, UserPlus, QrCode, Link2, Check, Loader, Share2, Copy,
  Users, Sparkles, UserCheck, Ban, RefreshCw, Send, ScanLine, BookUser, MapPin, Navigation,
  MessageCircle, BadgeCheck, X, Phone, ChevronRight
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendStore } from '@/store/useFriendStore';
import { searchUsers, fetchUserProfile } from '@/lib/supabaseAuth';

import { buildGagaChatUri, buildGagaChatWebUrl, parseGagaChatUri } from '@/lib/utils';
import { useContacts } from '@/hooks/useContacts';
import { useGeolocation, getDistanceKm, formatDistance } from '@/hooks/useGeolocation';
import { toast } from 'sonner';
import type { User } from '@/types';
import { where, limit, isFirestoreAvailable, updateDocById, queryCollection } from '@/lib/firestore';

type FriendStatus = 'not_friends' | 'request_sent' | 'request_received' | 'friends' | 'blocked' | 'self';

// ─── Helpers ───

function mapUser(u: any): User {
  return {
    id: u.id,
    name: u.name || 'User',
    displayName: u.displayName || u.name || 'User',
    username: u.username || '',
    email: u.email || '',
    phone: u.phone || '',
    avatar: u.avatar || '',
    statusMessage: u.statusMessage || '',
    status: u.status || 'offline',
    lastSeen: u.lastSeen || u.lastSeen || undefined,
    coins: u.coins || 0,
    bdtBalance: u.bdtBalance || u.bdtBalance || 0,
    savedPosts: u.savedPosts || [],
    blockedUsers: u.blockedUsers || [],
    favorites: u.favorites || [],
    friends: u.friends || [],
    bio: u.bio || '',
    location: u.location || '',
    website: u.website || '',
    coverImage: u.coverImage || u.coverImage || '',
    latitude: u.latitude ?? undefined,
    longitude: u.longitude ?? undefined,
    verified: u.verified || false,
    isAdmin: u.isAdmin || u.isAdmin || false,
    friendRequestPrivacy: u.friendRequestPrivacy || u.friendRequestPrivacy || 'everyone',
    hideFriendList: u.hideFriendList || u.hideFriendList || false,
    hideOnlineStatus: u.hideOnlineStatus || u.hideOnlineStatus || false,
    interests: u.interests || [],
    friendCount: u.friendCount || u.friendCount || 0,
  };
}

async function fetchUserById(userId: string): Promise<User | null> {
  try {
    const data = await fetchUserProfile(userId);
    if (!data) return null;
    return data;
  } catch {
    return null;
  }
}

// ─── UserCard ───

interface UserCardProps {
  user: User;
  status?: FriendStatus;
  mutualCount?: number;
  distance?: number;
  suggestionReason?: string;
  onNavigate?: () => void;
  disableNavigation?: boolean;
}

function UserCard({ user, status = 'not_friends', mutualCount = 0, distance, suggestionReason, onNavigate, disableNavigation }: UserCardProps) {
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();
  const { sendRequest, cancelRequest, acceptRequest, rejectRequest, unblockUser } = useFriendStore();
  const [loading, setLoading] = useState(false);

  const handleClick = () => {
    if (!disableNavigation) {
      if (onNavigate) onNavigate();
      else navigate(`/profile/${user.id}`);
    }
  };

  const handleAction = async (actionType: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!currentUser) return;
    setLoading(true);
    try {
      switch (actionType) {
        case 'add': {
          await sendRequest(user.id, currentUser.id);
          toast.success('Friend request sent');
          break;
        }
        case 'cancel': {
          const { sentRequests: sr } = useFriendStore.getState();
          const req = sr.find((s: any) => s.toUserId === user.id);
          if (req) {
            await cancelRequest(req.id);
            toast.success('Request cancelled');
          }
          break;
        }
        case 'accept': {
          const { requests: reqList } = useFriendStore.getState();
          const req = reqList.find((r: any) => r.from === user.id && r.status === 'pending');
          if (req) {
            await acceptRequest(req.id);
            toast.success('Friend request accepted');
            navigate(`/chat/${user.id}`);
          }
          break;
        }
        case 'reject': {
          const { requests: reqList } = useFriendStore.getState();
          const req = reqList.find((r: any) => r.from === user.id && r.status === 'pending');
          if (req) {
            await rejectRequest(req.id);
            toast.success('Request declined');
          }
          break;
        }
        case 'message': {
          navigate(`/chat/${user.id}`);
          break;
        }
        case 'unblock': {
          await unblockUser(user.id, currentUser.id);
          toast.success('User unblocked');
          break;
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Action failed');
    }
    setLoading(false);
  };

  const renderAction = () => {
    if (loading) {
      return <Loader size={16} className="animate-spin text-[#8D8D8D]" />;
    }

    switch (status) {
      case 'self':
        return <span className="text-[#8D8D8D] text-xs font-medium">You</span>;

      case 'friends':
        return (
          <button type="button" onClick={(e) => handleAction('message', e)}
            className="flex items-center gap-1 px-3 py-1.5 bg-[#00C300]/10 text-[#00C300] text-xs rounded-full font-medium active:bg-[#00C300]/20 transition-colors"
          >
            <MessageCircle size={18} /> Message
          </button>
        );

      case 'request_sent':
        return (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 px-3 py-1.5 bg-[#F5F5F5] text-[#8D8D8D] text-xs rounded-full font-medium">
              <UserCheck size={18} /> Sent
            </span>
            <button type="button" onClick={(e) => handleAction('cancel', e)}
              className="flex items-center gap-1 text-[#8D8D8D] text-xs font-medium hover:text-red-500 transition-colors"
            >
              <X size={18} /> Cancel
            </button>
          </div>
        );

      case 'request_received':
        return (
          <div className="flex items-center gap-1">
            <button type="button" onClick={(e) => handleAction('accept', e)}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#00C300] text-white text-xs rounded-full font-bold active:bg-[#00A300] transition-colors"
            >
              <Check size={18} /> Accept
            </button>
            <button type="button" onClick={(e) => handleAction('reject', e)}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#F5F5F5] text-[#8D8D8D] text-xs rounded-full font-medium"
            >
              <X size={18} /> Decline
            </button>
          </div>
        );

      case 'blocked':
        return (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-500 text-xs rounded-full font-medium">
              <Ban size={18} /> Blocked
            </span>
            <button type="button" onClick={(e) => handleAction('unblock', e)}
              className="text-[#00C300] text-xs font-medium"
            >
              Unblock
            </button>
          </div>
        );

      case 'not_friends':
      default:
        return (
          <button type="button" onClick={(e) => handleAction('add', e)}
            className="flex items-center gap-1 px-4 py-2 bg-[#00C300] text-white text-xs rounded-full font-bold active:bg-[#00A300] transition-colors"
          >
            <UserPlus size={18} /> Add Friend
          </button>
        );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={handleClick}
      className={`flex items-center gap-3 p-4 bg-white rounded-xl border border-[#EBEBEB] ${!disableNavigation ? 'cursor-pointer active:bg-gray-50' : ''} transition-colors`}
    >
      <div className="w-12 h-12 rounded-full bg-[#F5F5F5] flex items-center justify-center overflow-hidden shrink-0">
        {user.avatar ? (
          <img src={user.avatar} className="w-full h-full object-cover" alt="User avatar" />
        ) : (
          <span className="text-[#8D8D8D] font-bold text-sm">{(user.name || 'U')[0]}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <p className="text-[#111111] text-sm font-medium truncate">{user.name || 'User'}</p>
          {(user as any).verified && <BadgeCheck size={14} className="text-[#00C300] shrink-0" />}
        </div>
        <p className="text-[#8D8D8D] text-xs truncate">@{user.username || 'user'}</p>
        {user.bio && (
          <p className="text-[#8D8D8D] text-[10px] truncate mt-0.5">{user.bio}</p>
        )}
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {mutualCount > 0 && (
            <p className="text-[#00C300] text-[10px] flex items-center gap-0.5">
              <Users size={8} /> {mutualCount} mutual
            </p>
          )}
          {distance !== undefined && (
            <p className="text-[#00C300] text-[10px] flex items-center gap-0.5">
              <MapPin size={8} /> {formatDistance(distance)} away
            </p>
          )}
          {suggestionReason && (
            <p className="text-[#FF9800] text-[10px] flex items-center gap-0.5">
              <Sparkles size={8} /> {suggestionReason}
            </p>
          )}
        </div>
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        {renderAction()}
      </div>
    </motion.div>
  );
}

// ─── Main Page ───

export default function AddFriendsPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();
  const {
    sendRequest,
    cancelRequest,
    acceptRequest,
    rejectRequest,
    getFriendStatus,
    getMutualFriendsCount,
    getSuggestedFriends,
    subscribeFriends,
    subscribeSentRequests,
    friends,
    requests,
    sentRequests,
  } = useFriendStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [suggestions, setSuggestions] = useState<(User & { mutualCount: number; score: number; distance?: number })[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [activeTab, setActiveTab] = useState<'search' | 'suggestions' | 'requests' | 'nearby' | 'contacts'>('search');
  const [nearbyUsers, setNearbyUsers] = useState<(User & { distance?: number })[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [contactMatches, setContactMatches] = useState<User[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [requestSenders, setRequestSenders] = useState<Record<string, User>>({});
  const [sentRequestReceivers, setSentRequestReceivers] = useState<Record<string, User>>({});
  const [userStatuses, setUserStatuses] = useState<Record<string, FriendStatus>>({});
  const [mutualCounts, setMutualCounts] = useState<Record<string, number>>({});

  const { contacts, loading: contactsLoading, selectContacts, isSupported: contactsSupported } = useContacts();
  const { location, loading: geoLoading, getLocation, isSupported: geoSupported } = useGeolocation();

  const myLink = currentUser ? buildGagaChatUri(currentUser.id) : '';
  const myWebLink = currentUser ? buildGagaChatWebUrl(currentUser.id) : '';

  // Subscribe to friends and sent requests on mount
  useEffect(() => {
    if (!currentUser?.id) return;
    const unsubFriends = subscribeFriends(currentUser.id);
    const unsubSentRequests = subscribeSentRequests(currentUser.id);
    return () => {
      unsubFriends();
      unsubSentRequests();
    };
  }, [currentUser?.id, subscribeFriends, subscribeSentRequests]);

  // ─── Search ───

  const handleSearch = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query || !currentUser) return;
    setSearching(true);
    try {
      const results = await searchUsers(query, currentUser.id);
      setSearchResults(results);
    } catch (err: any) {
      console.error('Search error:', err);
      toast.error('Search failed');
    }
    setSearching(false);
  }, [searchQuery, currentUser]);

  // Auto-search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        handleSearch();
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, handleSearch, currentUser]);

  // Fetch statuses and mutual counts for search results
  useEffect(() => {
    if (!searchResults.length || !currentUser) return;
    let cancelled = false;
    const load = async () => {
      const statuses: Record<string, FriendStatus> = {};
      const counts: Record<string, number> = {};
      await Promise.all(
        searchResults.map(async (u) => {
          try {
            const [status, count] = await Promise.all([
              getFriendStatus(currentUser.id, u.id),
              getMutualFriendsCount(currentUser.id, u.id),
            ]);
            if (!cancelled) {
              statuses[u.id] = status;
              counts[u.id] = count;
            }
          } catch {
            // ignore individual failures
          }
        })
      );
      if (!cancelled) {
        setUserStatuses(prev => ({ ...prev, ...statuses }));
        setMutualCounts(prev => ({ ...prev, ...counts }));
      }
    };
    load();
    return () => { cancelled = true; };
  }, [searchResults, currentUser, getFriendStatus, getMutualFriendsCount]);

  // ─── Suggestions ───

  const loadSuggestions = useCallback(async () => {
    if (!currentUser) return;
    setLoadingSuggestions(true);
    try {
      const recs = await getSuggestedFriends(currentUser.id);
      setSuggestions(recs as any);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load suggestions');
    }
    setLoadingSuggestions(false);
  }, [currentUser, getSuggestedFriends]);

  useEffect(() => {
    if (activeTab === 'suggestions') {
      queueMicrotask(() => loadSuggestions());
    }
  }, [activeTab, loadSuggestions]);

  // ─── Requests ───

  // Fetch sender profiles for received requests
  useEffect(() => {
    if (activeTab !== 'requests' || !currentUser) return;
    const pending = requests.filter((r: any) => r.status === 'pending');
    if (!pending.length) return;

    let cancelled = false;
    const load = async () => {
      const profiles: Record<string, User> = {};
      await Promise.all(
        pending.map(async (req: any) => {
          if (requestSenders[req.from]) return;
          const sender = await fetchUserById(req.from);
          if (sender && !cancelled) profiles[req.from] = sender;
        })
      );
      if (!cancelled) setRequestSenders(prev => ({ ...prev, ...profiles }));
    };
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, activeTab, currentUser]);

  // Fetch receiver profiles for sent requests
  useEffect(() => {
    if (activeTab !== 'requests' || !currentUser) return;
    if (!sentRequests.length) return;

    let cancelled = false;
    const load = async () => {
      const profiles: Record<string, User> = {};
      await Promise.all(
        sentRequests.map(async (req: any) => {
          const toId = req.toUserId || req.to;
          if (sentRequestReceivers[toId]) return;
          const receiver = await fetchUserById(toId);
          if (receiver && !cancelled) profiles[toId] = receiver;
        })
      );
      if (!cancelled) setSentRequestReceivers(prev => ({ ...prev, ...profiles }));
    };
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentRequests, activeTab, currentUser]);

  // ─── Nearby ───

  const findNearbyUsers = async () => {
    if (!currentUser || !location) return;
    setLoadingNearby(true);
    try {
      if (isFirestoreAvailable()) {
        // Update current user location
        await updateDocById('users', currentUser.id, {
          latitude: location.latitude,
          longitude: location.longitude,
          locationUpdatedAt: new Date().toISOString(),
        }).catch(() => {});

        // Query all users with location data (no latitude filter — we filter client-side)
        let data: any[] = [];
        try {
          data = await queryCollection('users', [limit(200)]);
        } catch (err: any) {
          console.error('[Nearby] Query failed:', err);
          toast.error('Failed to load nearby users');
          setLoadingNearby(false);
          return;
        }

        const nearby: User[] = (data || [])
          .map(mapUser)
          .filter((u: any) => u.id !== currentUser.id && u.latitude != null && u.longitude != null);

        const withDist = nearby
          .map((u: any) => {
            const dist = getDistanceKm(location.latitude, location.longitude, u.latitude, u.longitude);
            return { ...u, distance: dist };
          })
          .filter((u: any) => u.distance < 50)
          .sort((a: any, b: any) => a.distance - b.distance);

        const friendIds = new Set(friends.map((f: any) => f.id));
        setNearbyUsers(withDist.filter((u: any) => !friendIds.has(u.id)));

        if (withDist.length === 0) {
          toast.info('No users found nearby. Invite friends to join!');
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to find nearby users');
    }
    setLoadingNearby(false);
  };

  useEffect(() => {
    if (location && activeTab === 'nearby') {
      queueMicrotask(() => findNearbyUsers());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, activeTab]);

  // ─── Contacts ───

  const findContactsOnGaga = async () => {
    if (!contacts.length || !currentUser) return;
    setLoadingContacts(true);
    const phoneSet = new Set<string>();
    contacts.forEach((c: any) => {
      (c.tel || []).forEach((p: string) => phoneSet.add(p.replace(/[^\d]/g, '')));
    });
    const emails = contacts.flatMap((c: any) => c.email || []);

    try {
      if (isFirestoreAvailable() && (phoneSet.size > 0 || emails.length > 0)) {
        // Firestore doesn't support OR or ilike queries; query by email and phone separately
        const foundUsers: User[] = [];
        const emailQueries = emails.slice(0, 10).map(async (e: string) => {
          const data = await queryCollection('users', [where('email', '==', e), limit(1)]);
          return data.map(mapUser);
        });
        const phoneQueries = Array.from(phoneSet).slice(0, 10).map(async (p: string) => {
          const data = await queryCollection('users', [
            where('phone', '>=', p),
            where('phone', '<=', p + '\uf8ff'),
            limit(10),
          ]);
          return data.map(mapUser);
        });
        const results = await Promise.all([...emailQueries, ...phoneQueries]);
        results.forEach((arr: User[]) => foundUsers.push(...arr));
        const friendIds = new Set(friends.map((f: any) => f.id));
        const matches = foundUsers.filter((u: any) => u.id !== currentUser.id && !friendIds.has(u.id));
        const uniqueMatches = Array.from(new Map(matches.map((u: any) => [u.id, u])).values());
        setContactMatches(uniqueMatches);
        if (uniqueMatches.length > 0) {
          toast.success(`Found ${uniqueMatches.length} contacts on GaGa Chat!`);
        } else {
          toast.info('No matching contacts found on GaGa Chat');
        }
      }
    } catch (err) {
      console.error(err);
    }
    setLoadingContacts(false);
  };

  useEffect(() => {
    if (contacts.length > 0) {
      queueMicrotask(() => findContactsOnGaga());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts]);

  // ─── Handlers ───

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(myWebLink);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Add ${currentUser?.name || 'me'} on GaGa Chat`,
          text: `Connect with me on GaGa Chat!`,
          url: myWebLink,
        });
      } else {
        handleCopyLink();
      }
    } catch {
      /* user cancelled */
    }
  };

  const handleInvite = async () => {
    const link = 'https://gagachat.app';
    const text = 'Join me on GaGa Chat - the free messaging app for everyone! 🌍';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'GaGa Chat', text, url: link });
      } else {
        await navigator.clipboard.writeText(`${text} ${link}`);
        toast.success('Invite link copied to clipboard');
      }
    } catch { /* user cancelled */ }
  };

  const handleQrAdd = async (qrInput: string) => {
    const userId = parseGagaChatUri(qrInput) || qrInput;
    if (!userId || !currentUser) return;
    try {
      await sendRequest(userId, currentUser.id);
      toast.success('Friend request sent via QR');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send request');
    }
  };

  const pendingRequests = requests.filter((r: any) => r.status === 'pending');

  // ─── Render ───

  return (
    <div className="min-h-[100dvh] bg-[#F5F5F5]">
      {/* Header */}
      <div className="bg-white border-b border-[#EBEBEB] flex items-center gap-3 p-4">
        <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 active:bg-gray-100 rounded-full text-[#111111]">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-bold text-[#111111]">Add Friends</h1>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b border-[#EBEBEB] overflow-x-auto">
        {(['search', 'suggestions', 'requests', 'nearby', 'contacts'] as const).map(tab => (
          <button type="button" key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab ? 'text-[#00C300] border-b-2 border-[#00C300]' : 'text-[#8D8D8D]'
            }`}
          >
            {tab === 'search' ? 'Search' :
             tab === 'suggestions' ? 'Suggestions' :
             tab === 'requests' ? `Requests (${pendingRequests.length})` :
             tab === 'nearby' ? 'Nearby' : 'Contacts'}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ═══ Search Tab ═══ */}
        {activeTab === 'search' && (
          <motion.div
            key="search"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-4 space-y-4"
          >
            {/* Quick Actions */}
            <div className="grid grid-cols-3 gap-3">
              <button type="button" onClick={() => setShowQrModal(true)}
                className="flex items-center gap-2 justify-center p-3 bg-white border border-[#EBEBEB] rounded-xl text-sm font-medium text-[#111111] active:bg-[#F5F5F5] transition-colors"
              >
                <QrCode size={18} className="text-[#00C300]" /> My QR
              </button>
              <button type="button" onClick={() => navigate('/qr-scanner?tab=scan')}
                className="flex items-center gap-2 justify-center p-3 bg-white border border-[#EBEBEB] rounded-xl text-sm font-medium text-[#111111] active:bg-[#F5F5F5] transition-colors"
              >
                <ScanLine size={18} className="text-[#FF9800]" /> Scan QR
              </button>
              <button type="button" onClick={handleShare}
                className="flex items-center gap-2 justify-center p-3 bg-white border border-[#EBEBEB] rounded-xl text-sm font-medium text-[#111111] active:bg-[#F5F5F5] transition-colors"
              >
                <Share2 size={18} className="text-[#2196F3]" /> Share
              </button>
            </div>

            {/* My Link */}
            <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4">
              <p className="text-[#8D8D8D] text-xs mb-2">Your Profile Link</p>
              <div className="flex items-center gap-2 bg-[#F5F5F5] rounded-xl p-3">
                <Link2 size={14} className="text-[#00C300] shrink-0" />
                <a
                  href={myWebLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#00C300] text-xs flex-1 truncate hover:underline"
                >
                  {myWebLink}
                </a>
                <button type="button" onClick={handleCopyLink}
                  className="text-[#8D8D8D] hover:text-[#111111] text-xs shrink-0 font-medium transition-colors"
                >
                  {copied ? <Check size={14} className="text-[#00C300]" /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4">
              <div className="relative mb-3">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="Search by username, email, phone, or ID..."
                  className="w-full bg-[#F5F5F5] rounded-xl pl-10 pr-10 py-3 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#8D8D8D]"
                />
                {searchQuery && (
                  <button type="button" onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]">
                    <Ban size={14} />
                  </button>
                )}
              </div>
              {searching && (
                <div className="flex items-center justify-center py-4">
                  <Loader size={18} className="animate-spin text-[#00C300]" />
                </div>
              )}
              {!searching && searchQuery.trim() && (
                <button type="button" onClick={handleSearch}
                  className="w-full py-2.5 bg-[#00C300] text-white rounded-xl text-sm font-bold active:bg-[#00A300] transition-colors"
                >
                  Search
                </button>
              )}
            </div>

            {/* Results */}
            <div className="space-y-2">
              {searchResults.length > 0 ? (
                <>
                  <p className="text-[#8D8D8D] text-xs font-medium px-1">Search Results ({searchResults.length})</p>
                  {searchResults.map(u => (
                    <UserCard
                      key={u.id}
                      user={u}
                      status={userStatuses[u.id] || 'not_friends'}
                      mutualCount={mutualCounts[u.id] || 0}
                    />
                  ))}
                </>
              ) : searchQuery && !searching ? (
                <div className="text-center py-8">
                  <Users size={32} className="text-[#EBEBEB] mx-auto mb-2" />
                  <p className="text-[#8D8D8D] text-sm">No users found. Try a different name or username.</p>
                </div>
              ) : null}
            </div>

            {/* QR Add */}
            <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4">
              <p className="text-[#8D8D8D] text-xs font-medium mb-2">Add by QR or Link</p>
              <QRManualAdd onAdd={handleQrAdd} />
            </div>
          </motion.div>
        )}

        {/* ═══ Suggestions Tab ═══ */}
        {activeTab === 'suggestions' && (
          <motion.div
            key="suggestions"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-4 space-y-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={16} className="text-[#FF9800]" />
              <p className="text-[#8D8D8D] text-xs font-medium">People you may know</p>
              <button type="button" onClick={loadSuggestions} className="ml-auto text-[#00C300] text-xs flex items-center gap-1">
                <RefreshCw size={12} className={loadingSuggestions ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
            {loadingSuggestions ? (
              <div className="flex items-center justify-center py-8">
                <Loader size={18} className="animate-spin text-[#00C300]" />
              </div>
            ) : suggestions.length > 0 ? (
              suggestions.map((u: any) => (
                <UserCard
                  key={u.id}
                  user={u}
                  status={userStatuses[u.id] || 'not_friends'}
                  mutualCount={u.mutualCount || 0}
                  distance={u.distance}
                  suggestionReason={u.mutualCount > 0 ? `${u.mutualCount} mutual friends` : u.distance ? 'Nearby' : 'Suggested for you'}
                />
              ))
            ) : (
              <div className="text-center py-8">
                <Users size={32} className="text-[#EBEBEB] mx-auto mb-2" />
                <p className="text-[#8D8D8D] text-sm">No suggestions yet</p>
                <p className="text-[#C7C7CC] text-xs mt-1">More users will appear as the app grows</p>
              </div>
            )}
          </motion.div>
        )}

        {/* ═══ Requests Tab ═══ */}
        {activeTab === 'requests' && (
          <motion.div
            key="requests"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-4 space-y-6"
          >
            {/* Received Requests */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[#8D8D8D] text-xs font-medium">Received Requests</p>
                <span className="text-[#00C300] text-xs font-medium">{pendingRequests.length}</span>
              </div>
              {pendingRequests.length > 0 ? (
                <div className="space-y-2">
                  {pendingRequests.map((req: any) => {
                    const sender = requestSenders[req.from];
                    return (
                      <motion.div
                        key={req.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-3 p-4 bg-white rounded-xl border border-[#EBEBEB]"
                      >
                        <div
                          className="w-12 h-12 rounded-full bg-[#F5F5F5] flex items-center justify-center overflow-hidden shrink-0 cursor-pointer"
                          onClick={() => sender && navigate(`/profile/${sender.id}`)}
                        >
                          {sender?.avatar ? (
                            <img src={sender.avatar} className="w-full h-full object-cover" alt="User avatar" />
                          ) : (
                            <UserPlus size={20} className="text-[#8D8D8D]" />
                          )}
                        </div>
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => sender && navigate(`/profile/${sender.id}`)}
                        >
                          <p className="text-[#111111] text-sm font-medium">{sender?.name || 'Loading...'}</p>
                          <p className="text-[#8D8D8D] text-xs truncate">@{sender?.username || req.from.slice(0, 8) + '...'}</p>
                          {sender?.bio && (
                            <p className="text-[#8D8D8D] text-[10px] truncate mt-0.5">{sender.bio}</p>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button type="button" onClick={async () => {
                              try {
                                await acceptRequest(req.id);
                                toast.success('Friend added!');
                                navigate(`/chat/${req.from}`);
                              } catch (err: any) {
                                toast.error(err?.message || 'Failed to accept');
                              }
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 bg-[#00C300] text-white text-xs rounded-full font-bold active:bg-[#00A300] transition-colors"
                          >
                            <Check size={18} /> Accept
                          </button>
                          <button type="button" onClick={async () => {
                              try {
                                await rejectRequest(req.id);
                                toast.success('Request declined');
                              } catch (err: any) {
                                toast.error(err?.message || 'Failed to decline');
                              }
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 bg-[#F5F5F5] text-[#8D8D8D] text-xs rounded-full font-medium"
                          >
                            <X size={18} /> Decline
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6">
                  <UserCheck size={28} className="text-[#EBEBEB] mx-auto mb-2" />
                  <p className="text-[#8D8D8D] text-sm">No pending requests</p>
                  <p className="text-[#C7C7CC] text-xs mt-1">Friend requests will appear here</p>
                </div>
              )}
            </div>

            {/* Sent Requests */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[#8D8D8D] text-xs font-medium">Sent Requests</p>
                <span className="text-[#8D8D8D] text-xs font-medium">{sentRequests.length}</span>
              </div>
              {sentRequests.length > 0 ? (
                <div className="space-y-2">
                  {sentRequests.map((req: any) => {
                    const receiver = sentRequestReceivers[req.toUserId];
                    return (
                      <motion.div
                        key={req.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-3 p-4 bg-white rounded-xl border border-[#EBEBEB]"
                      >
                        <div
                          className="w-12 h-12 rounded-full bg-[#F5F5F5] flex items-center justify-center overflow-hidden shrink-0 cursor-pointer"
                          onClick={() => receiver && navigate(`/profile/${receiver.id}`)}
                        >
                          {receiver?.avatar ? (
                            <img src={receiver.avatar} className="w-full h-full object-cover" alt="User avatar" />
                          ) : (
                            <Send size={18} className="text-[#8D8D8D]" />
                          )}
                        </div>
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => receiver && navigate(`/profile/${receiver.id}`)}
                        >
                          <p className="text-[#111111] text-sm font-medium">{receiver?.name || 'Loading...'}</p>
                          <p className="text-[#8D8D8D] text-xs truncate">@{receiver?.username || req.toUserId.slice(0, 8) + '...'}</p>
                          {receiver?.bio && (
                            <p className="text-[#8D8D8D] text-[10px] truncate mt-0.5">{receiver.bio}</p>
                          )}
                        </div>
                        <button type="button" onClick={async () => {
                            try {
                              await cancelRequest(req.id);
                              toast.success('Request cancelled');
                            } catch (err: any) {
                              toast.error(err?.message || 'Failed to cancel');
                            }
                          }}
                          className="text-[#8D8D8D] text-xs font-medium hover:text-red-500 transition-colors shrink-0"
                        >
                          Cancel
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6">
                  <Send size={28} className="text-[#EBEBEB] mx-auto mb-2" />
                  <p className="text-[#8D8D8D] text-sm">No sent requests</p>
                  <p className="text-[#C7C7CC] text-xs mt-1">Requests you send will appear here</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ═══ Nearby Tab ═══ */}
        {activeTab === 'nearby' && (
          <motion.div
            key="nearby"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-4 space-y-4"
          >
            {!geoSupported ? (
              <div className="text-center py-8">
                <MapPin size={32} className="text-[#EBEBEB] mx-auto mb-2" />
                <p className="text-[#8D8D8D] text-sm">Location not supported</p>
                <p className="text-[#C7C7CC] text-xs mt-1">Your browser does not support geolocation</p>
              </div>
            ) : !location ? (
              <div className="text-center py-8">
                <Navigation size={32} className="text-[#00C300] mx-auto mb-2" />
                <p className="text-[#8D8D8D] text-sm mb-3">Find friends nearby</p>
                <p className="text-[#C7C7CC] text-xs mb-4">Enable location to discover GaGa Chat users around you</p>
                <button type="button" onClick={getLocation}
                  disabled={geoLoading}
                  className="px-6 py-3 bg-[#00C300] text-white rounded-full text-sm font-bold active:bg-[#00A300] transition-colors disabled:opacity-50"
                >
                  {geoLoading ? <Loader size={16} className="animate-spin" /> : <MapPin size={16} />}
                  {geoLoading ? 'Getting location...' : 'Enable Location'}
                </button>
              </div>
            ) : loadingNearby ? (
              <div className="flex justify-center py-8">
                <Loader size={24} className="text-[#00C300] animate-spin" />
              </div>
            ) : nearbyUsers.length === 0 ? (
              <div className="text-center py-8">
                <Users size={32} className="text-[#EBEBEB] mx-auto mb-2" />
                <p className="text-[#8D8D8D] text-sm">No nearby users found</p>
                <p className="text-[#C7C7CC] text-xs mt-1">Try again later or expand your search</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[#8D8D8D] text-xs mb-2">Found {nearbyUsers.length} users nearby</p>
                {nearbyUsers.map(u => (
                  <UserCard
                    key={u.id}
                    user={u}
                    status={userStatuses[u.id] || 'not_friends'}
                    mutualCount={mutualCounts[u.id] || 0}
                    distance={u.distance}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ═══ Contacts Tab ═══ */}
        {activeTab === 'contacts' && (
          <motion.div
            key="contacts"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-4 space-y-4"
          >
            {!contactsSupported ? (
              <div className="space-y-6">
                {/* Manual phone search fallback */}
                <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Phone size={18} className="text-[#00C300]" />
                    <h3 className="text-sm font-bold text-[#111111]">Find by Phone</h3>
                  </div>
                  <p className="text-xs text-[#8D8D8D] mb-3">
                    Your browser doesn't support contact import. You can search by phone number instead.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      placeholder="Enter phone number..."
                      className="flex-1 bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-sm text-[#111111] placeholder:text-[#8D8D8D] focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = (e.target as HTMLInputElement).value.trim();
                          if (val) { setSearchQuery(val); setActiveTab('search'); }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        const input = (e.target as HTMLElement).closest('div')?.querySelector('input') as HTMLInputElement;
                        if (input?.value.trim()) { setSearchQuery(input.value.trim()); setActiveTab('search'); }
                      }}
                      className="px-4 py-2.5 bg-[#00C300] text-white rounded-xl text-sm font-bold"
                    >
                      <Search size={16} />
                    </button>
                  </div>
                </div>

                {/* Invite friends */}
                <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Share2 size={18} className="text-[#2196F3]" />
                    <h3 className="text-sm font-bold text-[#111111]">Invite Friends</h3>
                  </div>
                  <p className="text-xs text-[#8D8D8D] mb-3">
                    Share your invite link with friends so they can join GaGa Chat.
                  </p>
                  <button
                    type="button"
                    onClick={handleInvite}
                    className="w-full py-3 bg-[#2196F3] text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                  >
                    <Share2 size={16} /> Share Invite Link
                  </button>
                </div>

                {/* Alternative methods */}
                <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <QrCode size={18} className="text-[#FF9800]" />
                    <h3 className="text-sm font-bold text-[#111111]">Other Ways to Connect</h3>
                  </div>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('search')}
                      className="w-full flex items-center justify-between p-3 bg-[#F5F5F5] rounded-xl text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Search size={16} className="text-[#8D8D8D]" />
                        <span className="text-sm text-[#111111]">Search by username</span>
                      </div>
                      <ChevronRight size={16} className="text-[#C7C7CC]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('nearby')}
                      className="w-full flex items-center justify-between p-3 bg-[#F5F5F5] rounded-xl text-left"
                    >
                      <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-[#8D8D8D]" />
                        <span className="text-sm text-[#111111]">Find nearby users</span>
                      </div>
                      <ChevronRight size={16} className="text-[#C7C7CC]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowQrModal(true)}
                      className="w-full flex items-center justify-between p-3 bg-[#F5F5F5] rounded-xl text-left"
                    >
                      <div className="flex items-center gap-2">
                        <QrCode size={16} className="text-[#8D8D8D]" />
                        <span className="text-sm text-[#111111]">Scan QR code</span>
                      </div>
                      <ChevronRight size={16} className="text-[#C7C7CC]" />
                    </button>
                  </div>
                </div>
              </div>
            ) : contacts.length === 0 ? (
              <div className="text-center py-8">
                <BookUser size={32} className="text-[#00C300] mx-auto mb-2" />
                <p className="text-[#8D8D8D] text-sm mb-3">Import your phone contacts</p>
                <p className="text-[#C7C7CC] text-xs mb-4">Find friends who are already on GaGa Chat</p>
                <button type="button" onClick={selectContacts}
                  disabled={contactsLoading}
                  className="px-6 py-3 bg-[#00C300] text-white rounded-full text-sm font-bold active:bg-[#00A300] transition-colors disabled:opacity-50"
                >
                  {contactsLoading ? <Loader size={16} className="animate-spin" /> : <BookUser size={16} />}
                  {contactsLoading ? 'Importing...' : 'Import Contacts'}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[#8D8D8D] text-xs mb-2">
                  {contacts.length} contacts imported {contactMatches.length > 0 && `· ${contactMatches.length} on GaGa Chat`}
                </p>
                {loadingContacts && (
                  <div className="flex justify-center py-4">
                    <Loader size={20} className="text-[#00C300] animate-spin" />
                  </div>
                )}
                {contactMatches.length > 0 ? (
                  contactMatches.map(u => (
                    <UserCard
                      key={u.id}
                      user={u}
                      status={userStatuses[u.id] || 'not_friends'}
                      mutualCount={mutualCounts[u.id] || 0}
                    />
                  ))
                ) : !loadingContacts && (
                  <div className="text-center py-4">
                    <p className="text-[#8D8D8D] text-sm">No contacts found on GaGa Chat yet</p>
                    <p className="text-[#C7C7CC] text-xs mt-1">Invite them to join!</p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* QR Modal */}
      <AnimatePresence>
        {showQrModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowQrModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[#111111]">My QR Code</h2>
                <button type="button" onClick={() => setShowQrModal(false)} className="p-1 text-[#8D8D8D]">
                  <Ban size={18} />
                </button>
              </div>
              <div className="bg-[#F5F5F5] rounded-2xl p-6 mb-4">
                <div className="w-48 h-48 mx-auto bg-white rounded-xl p-4 flex flex-col items-center justify-center gap-3">
                  <QrCode size={48} className="text-[#00C300]" />
                  <p className="text-center text-[#111111] text-xs font-medium break-all px-1">{myLink}</p>
                  <button type="button" onClick={() => { handleCopyLink(); }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[#00C300] text-white text-xs rounded-full font-medium"
                  >
                    <Copy size={14} /> Copy Link
                  </button>
                </div>
                <p className="text-center text-[#8D8D8D] text-xs mt-3">Scan to add me on GaGa Chat</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { handleCopyLink(); setShowQrModal(false); }}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold"
                >
                  <Copy size={16} /> Copy Link
                </button>
                <button type="button" onClick={() => { handleShare(); setShowQrModal(false); }}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#00C300] text-white rounded-xl text-sm font-bold"
                >
                  <Share2 size={16} /> Share
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── QR Manual Add ───

function QRManualAdd({ onAdd }: { onAdd: (data: string) => void }) {
  const [input, setInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    try {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise((res) => { img.onload = res; });
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      toast.info('QR image loaded. Processing...');
      setScanning(false);
    } catch {
      toast.error('Failed to read QR code');
      setScanning(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Paste Gaga Chat link or user ID"
          className="flex-1 bg-[#F5F5F5] rounded-xl px-4 py-3 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#8D8D8D]"
        />
        <button type="button" onClick={() => { if (input) { onAdd(input); setInput(''); } }}
          disabled={!input}
          className="px-4 py-3 bg-[#00C300] text-white rounded-xl text-sm font-bold disabled:opacity-30 active:bg-[#00A300] transition-colors"
        >
          <UserPlus size={16} />
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <button type="button" onClick={() => fileRef.current?.click()}
        disabled={scanning}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#F5F5F5] text-[#8D8D8D] rounded-xl text-xs font-medium hover:text-[#111111] transition-colors"
      >
        {scanning ? <Loader size={14} className="animate-spin" /> : <QrCode size={14} />}
        {scanning ? 'Scanning...' : 'Upload QR Image'}
      </button>
    </div>
  );
}
