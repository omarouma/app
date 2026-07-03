/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Camera, QrCode, ChevronRight, Edit2, MessageCircle,
  Link2, Copy, Check, Share2, MapPin, Globe, Phone, Mail, Ban,
  UserPlus, Loader, ImagePlus, Settings, Shield, Video, Flag, Star, Users
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useAuth } from '@/context/AuthContext';
import { useFriendStore } from '@/store/useFriendStore';
import { useGroupStore } from '@/store/useGroupStore';
import { isFirestoreAvailable, getDocById, updateDocById, queryCollection, subscribeToDoc, subscribeToCollection } from '@/lib/firestore';
import { setLocalUser } from '@/lib/localAuth';
import { formatLastSeen } from '@/lib/timeUtils';
import { uploadMediaBlob } from '@/lib/storage';
import { buildGagaChatUri, buildGagaChatWebUrl, getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
import { where, orderBy, limit } from '@/lib/firestore';
import { toast } from 'sonner';
import type { TimelinePost, User } from '@/types';

// QR Code SVG component
function QRCodeSVG({ data, size = 180 }: { data: string; size?: number }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    import('qrcode').then((QR) => {
      QR.toString(data, { type: 'svg', width: size, margin: 2, color: { dark: '#111111', light: '#ffffff' } })
        .then(setSvg).catch(() => setSvg(''));
    });
  }, [data, size]);
  if (!svg) return <div className={`w-[${size}px] h-[${size}px] bg-gray-100 rounded-lg animate-pulse`} />;
  return <div dangerouslySetInnerHTML={{ __html: svg }} className="w-full h-full flex items-center justify-center" />;
}

// Wallet icon component
function WalletIcon(props: { size: number; strokeWidth: number; className: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={props.size} height={props.size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={props.className}>
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { userId: viewUserId } = useParams<{ userId: string }>();
  const { user, setUser } = useAuthStore();
  const { logout } = useAuth();
  const {
    getUserById, sendRequest, getFriendStatus, getMutualFriendsCount,
    cancelRequest, acceptRequest, rejectRequest, blockUser, unblockUser,
    reportUser, removeFriend, sentRequests, requests, toggleFavorite
  } = useFriendStore();
  const { groups } = useGroupStore();
  const [viewUser, setViewUser] = useState<User | null>(null);
  const [loadingViewUser, setLoadingViewUser] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showAvatarViewer, setShowAvatarViewer] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [copied, setCopied] = useState(false);
  const [posts, setPosts] = useState<TimelinePost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [friendStatus, setFriendStatus] = useState<string>('not_friends');
  const [mutualCount, setMutualCount] = useState(0);
  const [mutualGroups, setMutualGroups] = useState<any[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [processingAction, setProcessingAction] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);

  const isViewingOther = !!viewUserId;
  const displayUser = viewUser || user;
  const targetUserId = viewUserId || user?.id;

  // Load view user when viewing another profile
  useEffect(() => {
    if (!viewUserId) { setViewUser(null); return; }
    setLoadingViewUser(true);
    getUserById(viewUserId).then(u => {
      setViewUser(u);
      setLoadingViewUser(false);
    });
  }, [viewUserId, getUserById]);

  // Load friend status and mutual count when viewing another user
  useEffect(() => {
    if (!isViewingOther || !user?.id || !viewUserId) return;
    setLoadingStatus(true);
    const loadStatus = async () => {
      try {
        const status = await getFriendStatus(user.id, viewUserId);
        setFriendStatus(status);
        const mutual = await getMutualFriendsCount(user.id, viewUserId);
        setMutualCount(mutual);
        const fav = user.favorites?.includes(viewUserId) || false;
        setIsFavorited(fav);
      } catch { /* noop */ } finally {
        setLoadingStatus(false);
      }
    };
    loadStatus();
  }, [isViewingOther, user?.id, viewUserId, getFriendStatus, getMutualFriendsCount, user?.favorites]);

  // Compute mutual groups when viewing another user
  useEffect(() => {
    if (!isViewingOther || !user?.id || !viewUserId) return;
    const shared = groups.filter(g => {
      const participants = g.participants || [];
      return participants.includes(user!.id) && participants.includes(viewUserId);
    });
    setMutualGroups(shared);
  }, [isViewingOther, user, user?.id, viewUserId, groups]);

  // Real-time sync: subscribe to user profile changes
  useEffect(() => {
    if (!isFirestoreAvailable() || !targetUserId) return;
    const fetchProfile = async () => {
      try {
        const data = await getDocById('users', targetUserId);
        if (!data) return;
        const updatedUser = {
          id: data.id,
          name: data.name || 'User',
          displayName: data.displayName || data.name || 'User',
          username: data.username || '',
          email: data.email || '',
          phone: data.phone || '',
          avatar: data.avatar || '',
          status: data.status || 'offline',
          statusMessage: data.statusMessage || '',
          lastSeen: data.lastSeen ? new Date(data.lastSeen) : null,
          coins: data.coins || 0,
          savedPosts: data.savedPosts || [],
          blockedUsers: data.blockedUsers || [],
          favorites: data.favorites || [],
          friends: data.friends || [],
          bio: data.bio || '',
          location: data.location || '',
          website: data.website || '',
          verified: data.verified || false,
        } as User;
        if (viewUserId) {
          setViewUser(updatedUser);
        } else if (user?.id === targetUserId) {
          setUser(updatedUser);
        }
      } catch {
        // Silently ignore — user may not exist or firestore may be down
      }
    };
    fetchProfile();
    const unsubscribe = subscribeToDoc('users', targetUserId, (data) => {
      if (!data) return;
      const updatedUser = {
        id: data.id,
        name: data.name || 'User',
        displayName: data.displayName || data.name || 'User',
        username: data.username || '',
        email: data.email || '',
        phone: data.phone || '',
        avatar: data.avatar || '',
        status: data.status || 'offline',
        statusMessage: data.statusMessage || '',
        lastSeen: data.lastSeen ? new Date(data.lastSeen) : null,
        coins: data.coins || 0,
        savedPosts: data.savedPosts || [],
        blockedUsers: data.blockedUsers || [],
        favorites: data.favorites || [],
        friends: data.friends || [],
        bio: data.bio || '',
        location: data.location || '',
        website: data.website || '',
        verified: data.verified || false,
      } as User;
      if (viewUserId) {
        setViewUser(updatedUser);
      } else if (user?.id === targetUserId) {
        setUser(updatedUser);
      }
    });
    return () => unsubscribe();
  }, [targetUserId, viewUserId, user?.id, setUser]);

  // Form states
  const [form, setForm] = useState({
    displayName: user?.displayName || '',
    name: user?.name || '',
    bio: user?.bio || '',
    statusMessage: user?.statusMessage || '',
    location: user?.location || '',
    website: user?.website || '',
    phone: user?.phone || '',
  });

  // Sync form when user changes
  useEffect(() => {
    if (user) {
      setForm({
        displayName: user.displayName || '',
        name: user.name || '',
        bio: user.bio || '',
        statusMessage: user.statusMessage || '',
        location: user.location || '',
        website: user.website || '',
        phone: user.phone || '',
      });
    }
  }, [user]);

  const fetchPosts = useCallback(async () => {
    if (!targetUserId) return;
    setLoadingPosts(true);
    try {
      if (isFirestoreAvailable()) {
        const data = await queryCollection('posts', [
          where('userId', '==', targetUserId),
          orderBy('timestamp', 'desc'),
          limit(500),
        ]);
        let list: TimelinePost[] = data.map((d: any) => ({
          id: d.id, userId: d.userId || d.user_id, content: d.content || '',
          images: d.images || [], likes: d.likes || [], comments: d.comments || [],
          shares: d.shares || [], timestamp: d.timestamp ? new Date(d.timestamp) : new Date(),
          visibility: d.visibility || 'public',
        }));
        // Visibility filter when viewing another user's profile
        if (isViewingOther && user?.id) {
          const isFriend = friendStatus === 'friends';
          list = list.filter((post) => {
            if (post.visibility === 'private') return false;
            if (post.visibility === 'friends' && !isFriend) return false;
            return true;
          });
        }
        setPosts(list);
      }
    } catch { /* noop */ }
    setLoadingPosts(false);
  }, [targetUserId, isViewingOther, user?.id, friendStatus]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    if (!isFirestoreAvailable() || !targetUserId) return;
    const unsubscribe = subscribeToCollection('posts', [
      where('userId', '==', targetUserId),
      orderBy('timestamp', 'desc'),
    ], () => fetchPosts());
    return () => unsubscribe();
  }, [targetUserId, fetchPosts]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Always save to localStorage as primary backup
      const updated = { ...user, ...form };
      setLocalUser(updated);

      // Try Firestore as secondary (may fail due to billing/permissions)
      if (isFirestoreAvailable()) {
        try {
          await updateDocById('users', user.id, {
            displayName: form.displayName,
            name: form.name,
            bio: form.bio,
            statusMessage: form.statusMessage,
            location: form.location,
            website: form.website,
            phone: form.phone,
          });
        } catch (firestoreErr: any) {
          console.warn('[Profile] Firestore write failed (billing/permissions):', firestoreErr.message);
        }
      }

      // Update app state
      setUser(updated);
      toast.success('Profile updated');
      setEditing(false);
    } catch { /* noop */ }
    setSaving(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingAvatar(true);
    try {
      // Step 1: Upload to Cloudinary (primary storage)
      const url = await uploadMediaBlob({ kind: 'avatars', userId: user.id, file });

      // Step 2: Always save to localStorage as backup
      const updatedUser = { ...user, avatar: url };
      setLocalUser(updatedUser);

      // Step 3: Try Firestore (secondary, may fail due to billing/permissions)
      if (isFirestoreAvailable()) {
        try {
          await updateDocById('users', user.id, { avatar: url });
        } catch (firestoreErr: any) {
          console.warn('[Avatar] Firestore write failed (billing/permissions):', firestoreErr.message);
          // Firestore failed but Cloudinary + localStorage succeeded — this is OK
        }
      }

      // Step 4: Update app state
      setUser(updatedUser);
      toast.success('Avatar updated');
    } catch { /* noop */ } finally {
      setUploadingAvatar(false);
    }
  };

  const handleCopyLink = async () => {
    const link = displayUser ? buildGagaChatWebUrl(displayUser.id) : '';
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success('Profile link copied');
      const t = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(t);
    } catch { toast.error('Failed to copy'); }
  };

  const handleShare = async () => {
    const link = displayUser ? buildGagaChatWebUrl(displayUser.id) : '';
    try {
      if (navigator.share) {
        await navigator.share({ title: `Add ${displayUser?.name} on GaGa Chat`, text: `Connect with me on GaGa Chat!`, url: link });
      } else {
        await handleCopyLink();
      }
    } catch { /* cancelled */ }
  };

  const handleToggleFavorite = async () => {
    if (!user?.id || !displayUser?.id) return;
    setProcessingAction(true);
    try {
      await toggleFavorite(displayUser.id, user.id, user.favorites || []);
      setIsFavorited(!isFavorited);
      toast.success(isFavorited ? 'Removed from favorites' : 'Added to favorites');
    } catch { /* noop */ }
    setProcessingAction(false);
  };

  const profileLink = displayUser ? buildGagaChatWebUrl(displayUser.id) : '';
  const qrCodeData = displayUser ? buildGagaChatUri(displayUser.id) : '';

  // Friend action helpers
  const findSentRequest = (toUserId: string) => {
    return sentRequests.find((r: any) =>
      r.toUserId === toUserId || r.to_user_id === toUserId ||
      r.receiverId === toUserId || r.receiver_id === toUserId
    );
  };

  const findReceivedRequest = (fromUserId: string) => {
    return requests.find((r: any) =>
      r.fromUserId === fromUserId || r.from_user_id === fromUserId ||
      r.senderId === fromUserId || r.sender_id === fromUserId
    );
  };

  const handleAddFriend = async () => {
    if (!user?.id || !displayUser?.id) return;
    setProcessingAction(true);
    try {
      await sendRequest(displayUser.id, user.id);
      toast.success('Friend request sent');
      setFriendStatus('request_sent');
    } catch { /* noop */ }
    setProcessingAction(false);
  };

  const handleCancelRequest = async () => {
    if (!user?.id || !displayUser?.id) return;
    const req = findSentRequest(displayUser.id);
    if (!req) return;
    setProcessingAction(true);
    try {
      await cancelRequest(req.id);
      toast.success('Friend request cancelled');
      setFriendStatus('not_friends');
    } catch { /* noop */ }
    setProcessingAction(false);
  };

  const handleAcceptRequest = async () => {
    if (!user?.id || !displayUser?.id) return;
    const req = findReceivedRequest(displayUser.id);
    if (!req) return;
    setProcessingAction(true);
    try {
      await acceptRequest(req.id);
      toast.success('Friend request accepted');
      setFriendStatus('friends');
    } catch { /* noop */ }
    setProcessingAction(false);
  };

  const handleRejectRequest = async () => {
    if (!user?.id || !displayUser?.id) return;
    const req = findReceivedRequest(displayUser.id);
    if (!req) return;
    setProcessingAction(true);
    try {
      await rejectRequest(req.id);
      toast.success('Friend request declined');
      setFriendStatus('not_friends');
    } catch { /* noop */ }
    setProcessingAction(false);
  };

  const handleRemoveFriend = async () => {
    if (!user?.id || !displayUser?.id) return;
    setProcessingAction(true);
    try {
      await removeFriend(displayUser.id, user.id);
      toast.success('Friend removed');
      setFriendStatus('not_friends');
    } catch { /* noop */ }
    setProcessingAction(false);
  };

  const handleBlockUser = async () => {
    if (!user?.id || !displayUser?.id) return;
    setProcessingAction(true);
    try {
      await blockUser(displayUser.id, user.id);
      toast.success('User blocked');
      setFriendStatus('blocked');
    } catch { /* noop */ }
    setProcessingAction(false);
  };

  const handleUnblockUser = async () => {
    if (!user?.id || !displayUser?.id) return;
    setProcessingAction(true);
    try {
      await unblockUser(displayUser.id, user.id);
      toast.success('User unblocked');
      setFriendStatus('not_friends');
    } catch { /* noop */ }
    setProcessingAction(false);
  };

  const handleReportSubmit = async () => {
    if (!user?.id || !displayUser?.id || !reportReason) return;
    setProcessingAction(true);
    try {
      await reportUser({ reporterId: user.id, reportedId: displayUser.id, reason: reportReason, details: reportDetails });
      toast.success('Report submitted');
      setShowReportModal(false);
      setReportReason('');
      setReportDetails('');
    } catch { /* noop */ }
    setProcessingAction(false);
  };

  const reportOptions = ['Spam', 'Harassment', 'Inappropriate content', 'Fake account', 'Other'];

  if (!displayUser || loadingViewUser) {
    return (
      <div className="min-h-[100dvh] bg-[#F5F5F5] flex items-center justify-center">
        <Loader size={32} className="text-[#00C300] animate-spin" />
      </div>
    );
  }

  const renderActionButtons = () => {
    if (loadingStatus) {
      return <Loader size={20} className="text-[#00C300] animate-spin" />;
    }

    switch (friendStatus) {
      case 'not_friends':
        return (
          <div className="flex gap-2 flex-wrap justify-center">
            <button type="button" onClick={handleAddFriend} disabled={processingAction} className="flex items-center gap-1.5 px-4 py-2 bg-[#00C300] rounded-full text-sm font-medium text-white active:bg-[#00A300] transition-colors disabled:opacity-50">
              <UserPlus size={14} /> Add Friend
            </button>
            <button type="button" onClick={handleBlockUser} disabled={processingAction} className="flex items-center gap-1.5 px-4 py-2 bg-[#F5F5F5] rounded-full text-sm font-medium text-[#111111] active:bg-[#EBEBEB] transition-colors disabled:opacity-50">
              <Ban size={14} /> Block
            </button>
            <button type="button" onClick={() => setShowReportModal(true)} disabled={processingAction} className="flex items-center gap-1.5 px-4 py-2 bg-[#F5F5F5] rounded-full text-sm font-medium text-[#111111] active:bg-[#EBEBEB] transition-colors disabled:opacity-50">
              <Flag size={14} /> Report
            </button>
          </div>
        );
      case 'request_sent':
        return (
          <div className="flex gap-2 flex-wrap justify-center">
            <button type="button" onClick={handleCancelRequest} disabled={processingAction} className="flex items-center gap-1.5 px-4 py-2 bg-[#FF9800] rounded-full text-sm font-medium text-white active:bg-[#F57C00] transition-colors disabled:opacity-50">
              <Ban size={14} /> Cancel Request
            </button>
            <button type="button" onClick={handleBlockUser} disabled={processingAction} className="flex items-center gap-1.5 px-4 py-2 bg-[#F5F5F5] rounded-full text-sm font-medium text-[#111111] active:bg-[#EBEBEB] transition-colors disabled:opacity-50">
              <Ban size={14} /> Block
            </button>
          </div>
        );
      case 'request_received':
        return (
          <div className="flex gap-2 flex-wrap justify-center">
            <button type="button" onClick={handleAcceptRequest} disabled={processingAction} className="flex items-center gap-1.5 px-4 py-2 bg-[#00C300] rounded-full text-sm font-medium text-white active:bg-[#00A300] transition-colors disabled:opacity-50">
              <Check size={14} /> Accept Request
            </button>
            <button type="button" onClick={handleRejectRequest} disabled={processingAction} className="flex items-center gap-1.5 px-4 py-2 bg-[#FF3B30] rounded-full text-sm font-medium text-white active:bg-[#D32F2F] transition-colors disabled:opacity-50">
              <Ban size={14} /> Decline
            </button>
            <button type="button" onClick={handleBlockUser} disabled={processingAction} className="flex items-center gap-1.5 px-4 py-2 bg-[#F5F5F5] rounded-full text-sm font-medium text-[#111111] active:bg-[#EBEBEB] transition-colors disabled:opacity-50">
              <Ban size={14} /> Block
            </button>
          </div>
        );
      case 'friends':
        return (
          <div className="flex gap-2 flex-wrap justify-center">
            <button type="button" onClick={() => navigate(`/chat/${displayUser.id}`)} className="flex items-center gap-1.5 px-4 py-2 bg-[#00C300] rounded-full text-sm font-medium text-white active:bg-[#00A300] transition-colors">
              <MessageCircle size={14} /> Message
            </button>
            <button type="button" onClick={handleToggleFavorite} disabled={processingAction} className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors disabled:opacity-50 ${isFavorited ? 'bg-yellow-100 text-yellow-700 active:bg-yellow-200' : 'bg-[#F5F5F5] text-[#111111] active:bg-[#EBEBEB]'}`}>
              <Star size={14} className={isFavorited ? 'fill-yellow-500 text-yellow-500' : ''} /> {isFavorited ? 'Favorited' : 'Favorite'}
            </button>
            <button type="button" onClick={() => navigate('/call', { state: { userId: displayUser.id, mode: 'voice' } })} className="flex items-center gap-1.5 px-4 py-2 bg-[#F5F5F5] rounded-full text-sm font-medium text-[#111111] active:bg-[#EBEBEB] transition-colors">
              <Phone size={14} /> Call
            </button>
            <button type="button" onClick={() => navigate('/call', { state: { userId: displayUser.id, mode: 'video' } })} className="flex items-center gap-1.5 px-4 py-2 bg-[#F5F5F5] rounded-full text-sm font-medium text-[#111111] active:bg-[#EBEBEB] transition-colors">
              <Video size={14} /> Video Call
            </button>
            <button type="button" onClick={handleRemoveFriend} disabled={processingAction} className="flex items-center gap-1.5 px-4 py-2 bg-[#FF3B30] rounded-full text-sm font-medium text-white active:bg-[#D32F2F] transition-colors disabled:opacity-50">
              <Ban size={14} /> Remove Friend
            </button>
            <button type="button" onClick={handleBlockUser} disabled={processingAction} className="flex items-center gap-1.5 px-4 py-2 bg-[#F5F5F5] rounded-full text-sm font-medium text-[#111111] active:bg-[#EBEBEB] transition-colors disabled:opacity-50">
              <Ban size={14} /> Block
            </button>
          </div>
        );
      case 'blocked':
        return (
          <div className="flex gap-2 flex-wrap justify-center">
            <button type="button" onClick={handleUnblockUser} disabled={processingAction} className="flex items-center gap-1.5 px-4 py-2 bg-[#00C300] rounded-full text-sm font-medium text-white active:bg-[#00A300] transition-colors disabled:opacity-50">
              <Check size={14} /> Unblock
            </button>
            <button type="button" onClick={() => setShowReportModal(true)} disabled={processingAction} className="flex items-center gap-1.5 px-4 py-2 bg-[#F5F5F5] rounded-full text-sm font-medium text-[#111111] active:bg-[#EBEBEB] transition-colors disabled:opacity-50">
              <Flag size={14} /> Report
            </button>
          </div>
        );
      default:
        return (
          <div className="flex gap-2 flex-wrap justify-center">
            <span className="text-sm text-[#8D8D8D]">Unable to load actions</span>
          </div>
        );
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#F5F5F5]">
      {/* Header */}
      <div className="bg-white border-b border-[#EBEBEB]">
        <div className="flex items-center gap-3 p-4">
          <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 active:bg-gray-100 rounded-full text-[#111111]">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-lg font-bold text-[#111111]">{isViewingOther ? displayUser.name || 'Profile' : 'Profile'}</h1>
          {!isViewingOther && (
            <button type="button" onClick={() => setEditing(!editing)} className="ml-auto p-2 active:bg-gray-100 rounded-full text-[#8D8D8D]">
              {editing ? <Ban size={18} /> : <Edit2 size={18} />}
            </button>
          )}
        </div>
      </div>

      {/* Profile Card */}
      <div className="bg-white pb-6 mb-4">
        <div className="flex flex-col items-center pt-6">
          {/* Avatar */}
          <div className="relative mb-3">
            <div
              className={`w-28 h-28 rounded-full bg-[#F5F5F5] flex items-center justify-center border-3 border-[#EBEBEB] overflow-hidden shadow-sm ${!isViewingOther ? 'cursor-pointer' : ''}`}
              onClick={() => {
                if (!isViewingOther) fileInputRef.current?.click();
                else if (sanitizeMediaUrl(displayUser.avatar)) setShowAvatarViewer(true);
              }}
            >
              {uploadingAvatar ? (
                <Loader size={32} className="text-[#00C300] animate-spin" />
              ) : sanitizeMediaUrl(displayUser.avatar) ? (
                <img src={sanitizeMediaUrl(displayUser.avatar)} className="w-full h-full object-cover" alt="User avatar" />
              ) : (
                <img src={getDefaultAvatar(displayUser.id || displayUser.name || 'U')} className="w-full h-full object-cover" alt="User avatar" />
              )}
            </div>
            {!isViewingOther && (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-[#00C300] flex items-center justify-center border-2 border-white shadow-sm disabled:opacity-50"
              >
                {uploadingAvatar ? <Loader size={14} className="text-white animate-spin" /> : <Camera size={16} className="text-white" />}
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </div>

          <div className="flex items-center gap-1">
            <h2 className="text-xl font-bold text-[#111111]">{displayUser.displayName || displayUser.name}</h2>
            {(displayUser as any).verified && (
              <span className="text-[#00C300]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 12l2 2 4-4" />
                  <circle cx="12" cy="12" r="10" />
                </svg>
              </span>
            )}
          </div>
          <p className="text-[#8D8D8D] text-sm">@{displayUser.username || 'user'}</p>
          {displayUser.statusMessage && <p className="text-[#111111] text-sm mt-1">{displayUser.statusMessage}</p>}
          {displayUser.bio && <p className="text-[#8D8D8D] text-sm mt-1 max-w-xs text-center">{displayUser.bio}</p>}

          {/* Online/Last Seen Status with privacy respect */}
          {displayUser.status && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`w-2 h-2 rounded-full ${displayUser.status === 'online' ? 'bg-[#00C300]' : 'bg-[#8D8D8D]'}`} />
              <span className="text-[#8D8D8D] text-xs">
                {displayUser.status === 'online'
                  ? 'Online'
                  : (!isViewingOther || friendStatus === 'friends')
                    ? (displayUser.lastSeen ? `Last seen ${formatLastSeen(displayUser.lastSeen)}` : 'Offline')
                    : 'Offline'}
              </span>
            </div>
          )}

          {/* Location & Website badges */}
          <div className="flex items-center gap-3 mt-2">
            {displayUser.location && (
              <span className="flex items-center gap-1 text-[#8D8D8D] text-xs">
                <MapPin size={12} /> {displayUser.location}
              </span>
            )}
            {displayUser.website && (
              <a href={displayUser.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[#00C300] text-xs hover:underline">
                <Globe size={12} /> Website
              </a>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-8 mt-4 text-sm">
            <div className="text-center cursor-pointer" onClick={() => navigate('/contacts')}>
              <span className="text-[#111111] font-bold block">{(displayUser.friends || []).length}</span>
              <span className="text-[#8D8D8D] text-xs">Friends</span>
            </div>
            <div className="text-center">
              <span className="text-[#111111] font-bold block">{posts.length}</span>
              <span className="text-[#8D8D8D] text-xs">Posts</span>
            </div>
            <div className="text-center">
              <span className="text-[#111111] font-bold block">{(displayUser.coins || 0).toLocaleString()}</span>
              <span className="text-[#8D8D8D] text-xs">Coins</span>
            </div>
            {isViewingOther && (
              <div className="text-center">
                <span className="text-[#111111] font-bold block">{mutualCount}</span>
                <span className="text-[#8D8D8D] text-xs">Mutual</span>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2 mt-4">
            {isViewingOther ? (
              renderActionButtons()
            ) : (
              <>
                <button type="button" onClick={handleCopyLink} className="flex items-center gap-1.5 px-4 py-2 bg-[#F5F5F5] rounded-full text-sm font-medium text-[#111111] active:bg-[#EBEBEB] transition-colors">
                  {copied ? <Check size={14} className="text-[#00C300]" /> : <Copy size={14} />}
                  {copied ? 'Copied' : 'Copy Link'}
                </button>
                <button type="button" onClick={() => setShowQr(true)} className="flex items-center gap-1.5 px-4 py-2 bg-[#F5F5F5] rounded-full text-sm font-medium text-[#111111] active:bg-[#EBEBEB] transition-colors">
                  <QrCode size={14} /> QR Code
                </button>
                <button type="button" onClick={handleShare} className="flex items-center gap-1.5 px-4 py-2 bg-[#00C300] rounded-full text-sm font-medium text-white active:bg-[#00A300] transition-colors">
                  <Share2 size={14} /> Share
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mutual Groups - when viewing another user */}
      {isViewingOther && mutualGroups.length > 0 && (
        <div className="bg-white border-y border-[#EBEBEB] p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Users size={18} className="text-[#00C300]" />
            <h3 className="text-sm font-semibold text-[#111111]">Mutual Groups ({mutualGroups.length})</h3>
          </div>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide">
            {mutualGroups.map(g => (
              <button
                type="button"
                key={g.id}
                onClick={() => navigate(`/group/${g.id}`)}
                className="flex items-center gap-2 min-w-[160px] p-2.5 bg-[#F5F5F5] rounded-xl text-left hover:bg-[#EBEBEB] transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-[#E8F5E9] flex items-center justify-center shrink-0 overflow-hidden">
                  {g.avatar ? (
                    <img src={sanitizeMediaUrl(g.avatar)} className="w-full h-full object-cover" alt="Group avatar" />
                  ) : (
                    <Users size={18} className="text-[#00C300]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[#111111] text-sm font-medium truncate">{g.name || 'Group'}</p>
                  <p className="text-[#8D8D8D] text-xs">{(g.participants || []).length} members</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Edit Form - only for current user */}
      <AnimatePresence>
        {editing && !isViewingOther && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white border-y border-[#EBEBEB] p-4 mb-4 space-y-3 overflow-hidden"
          >
            <h3 className="text-sm font-semibold text-[#111111] mb-2">Edit Profile</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[#8D8D8D] text-xs mb-1 block">Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]" />
              </div>
              <div>
                <label className="text-[#8D8D8D] text-xs mb-1 block">Display Name</label>
                <input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                  className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]" />
              </div>
            </div>
            <div>
              <label className="text-[#8D8D8D] text-xs mb-1 block">Status Message</label>
              <input value={form.statusMessage} onChange={e => setForm(f => ({ ...f, statusMessage: e.target.value }))}
                className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]" />
            </div>
            <div>
              <label className="text-[#8D8D8D] text-xs mb-1 block">Bio</label>
              <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300] resize-none min-h-[60px]"
                maxLength={160} />
              <p className="text-[#C7C7CC] text-[10px] text-right mt-0.5">{form.bio.length}/160</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[#8D8D8D] text-xs mb-1 block">Location</label>
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]" />
              </div>
              <div>
                <label className="text-[#8D8D8D] text-xs mb-1 block">Website</label>
                <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                  className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]" />
              </div>
            </div>
            <div>
              <label className="text-[#8D8D8D] text-xs mb-1 block">Phone</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300]" />
            </div>
            <button type="button" onClick={handleSave}
              disabled={saving}
              className="w-full bg-[#00C300] hover:bg-[#00A300] text-white rounded-xl py-3 text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader size={16} className="animate-spin" /> : <Check size={16} />}
              Save Changes
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Menu - only for own profile */}
      {!isViewingOther && (
        <div className="bg-white border-y border-[#EBEBEB] mb-4">
          {[
            { icon: QrCode, label: 'My QR Code', action: () => setShowQr(true) },
            { icon: WalletIcon, label: 'My Wallet', action: () => navigate('/wallet') },
            { icon: MessageCircle, label: 'Notifications', action: () => navigate('/notifications') },
            { icon: Shield, label: 'Privacy & Security', action: () => navigate('/privacy') },
            { icon: Settings, label: 'Settings', action: () => navigate('/more') },
          ].map((item, idx, arr) => (
            <button type="button" key={item.label}
              onClick={item.action}
              className={`w-full flex items-center px-4 py-3.5 active:bg-gray-50 text-left ${idx !== arr.length - 1 ? 'border-b border-[#EBEBEB]' : ''}`}
            >
              <item.icon size={20} strokeWidth={1.5} className="text-[#111111] mr-3" />
              <span className="flex-1 text-[16px] text-[#111111]">{item.label}</span>
              <ChevronRight size={20} className="text-[#C7C7CC]" />
            </button>
          ))}
        </div>
      )}

      {/* Contact Info - only for own profile */}
      {!isViewingOther && (
        <div className="bg-white border-y border-[#EBEBEB] mb-4 p-4">
          <h3 className="text-sm font-semibold text-[#111111] mb-3">Contact Info</h3>
          <div className="space-y-3">
            {displayUser.email && (
              <div className="flex items-center gap-3">
                <Mail size={16} className="text-[#8D8D8D]" />
                <span className="text-[#111111] text-sm">{displayUser.email}</span>
              </div>
            )}
            {displayUser.phone && (
              <div className="flex items-center gap-3">
                <Phone size={16} className="text-[#8D8D8D]" />
                <span className="text-[#111111] text-sm">{displayUser.phone}</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Link2 size={16} className="text-[#8D8D8D]" />
              <a
                href={profileLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00C300] text-xs hover:underline truncate max-w-[200px]"
              >
                {profileLink}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Posts Grid */}
      <div className="bg-white p-4">
        <h3 className="text-sm font-semibold text-[#111111] mb-3">Posts</h3>
        {loadingPosts ? (
          <div className="flex justify-center py-8">
            <Loader size={20} className="animate-spin text-[#00C300]" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {posts.map((post) => (
              <div key={post.id} className="aspect-square bg-[#F5F5F5] rounded-lg overflow-hidden">
                {post.images && post.images[0] ? (
                  <img src={post.images[0]} className="w-full h-full object-cover" alt="Post image" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-2">
                    <p className="text-[#8D8D8D] text-xs line-clamp-3">{post.content}</p>
                  </div>
                )}
              </div>
            ))}
            {posts.length === 0 && (
              <div className="col-span-3 py-12 text-center text-[#8D8D8D] text-sm">
                <ImagePlus size={24} className="mx-auto mb-2 text-[#EBEBEB]" />
                No posts yet
              </div>
            )}
          </div>
        )}
      </div>

      {/* Avatar Viewer Modal */}
      <AnimatePresence>
        {showAvatarViewer && sanitizeMediaUrl(displayUser.avatar) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center"
            onClick={() => setShowAvatarViewer(false)}
          >
            <motion.img
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              src={sanitizeMediaUrl(displayUser.avatar)}
              className="max-w-[90%] max-h-[80%] object-contain rounded-2xl"
              alt="Avatar"
              onClick={(e) => e.stopPropagation()}
            />
            <button type="button" onClick={() => setShowAvatarViewer(false)}
              className="absolute top-4 right-4 p-2 bg-white/20 rounded-full text-white hover:bg-white/30"
            >
              <Ban size={24} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Logout - only for own profile */}
      {!isViewingOther && (
        <div className="p-4 mt-4">
          <button type="button" onClick={logout}
            className="w-full py-3 bg-[#FF3B30]/10 text-[#FF3B30] rounded-xl font-semibold text-sm active:bg-[#FF3B30]/20 transition-colors"
          >
            Log Out
          </button>
        </div>
      )}

      {/* QR Code Modal */}
      <AnimatePresence>
        {showQr && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowQr(false)}
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
                <button type="button" onClick={() => setShowQr(false)} className="p-1 text-[#8D8D8D]"><Ban size={18} /></button>
              </div>
              <div className="bg-[#F5F5F5] rounded-2xl p-6 mb-4">
                <div className="w-52 h-52 mx-auto bg-white rounded-xl p-3">
                  <QRCodeSVG data={qrCodeData} size={200} />
                </div>
                <p className="text-center text-[#8D8D8D] text-xs mt-3">Scan to add {user?.name || 'you'} on GaGa Chat</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={handleCopyLink} className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold">
                  <Copy size={16} /> Copy Link
                </button>
                <button type="button" onClick={handleShare} className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#00C300] text-white rounded-xl text-sm font-bold">
                  <Share2 size={16} /> Share
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Report Modal */}
      <AnimatePresence>
        {showReportModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowReportModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[#111111]">Report User</h2>
                <button type="button" onClick={() => setShowReportModal(false)} className="p-1 text-[#8D8D8D]"><Ban size={18} /></button>
              </div>
              <p className="text-[#8D8D8D] text-sm mb-3">Why are you reporting {displayUser.name}?</p>
              <div className="space-y-2 mb-3">
                {reportOptions.map((option) => (
                  <button type="button" key={option}
                    onClick={() => setReportReason(option)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm transition-colors ${
                      reportReason === option ? 'bg-[#00C300]/10 text-[#00C300] font-medium' : 'bg-[#F5F5F5] text-[#111111]'
                    }`}
                  >
                    {option}
                    {reportReason === option && <Check size={16} />}
                  </button>
                ))}
              </div>
              <div className="mb-4">
                <label className="text-[#8D8D8D] text-xs mb-1 block">Details (optional)</label>
                <textarea
                  value={reportDetails}
                  onChange={e => setReportDetails(e.target.value)}
                  className="w-full bg-[#F5F5F5] rounded-xl px-4 py-2.5 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#00C300] resize-none min-h-[60px]"
                  placeholder="Add more details..."
                  maxLength={500}
                />
                <p className="text-[#C7C7CC] text-[10px] text-right mt-0.5">{reportDetails.length}/500</p>
              </div>
              <button type="button" onClick={handleReportSubmit}
                disabled={!reportReason || processingAction}
                className="w-full bg-[#FF3B30] hover:bg-[#D32F2F] text-white rounded-xl py-3 text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {processingAction ? <Loader size={16} className="animate-spin" /> : <Flag size={16} />}
                Submit Report
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
