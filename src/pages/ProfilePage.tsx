import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Settings, Edit3, Share2, Camera, Check, X,
  MapPin, Link2, Mail, Phone, Users, Heart, MessageCircle, BadgeCheck,
  Copy, QrCode, Loader, MoreHorizontal, Video, Flag, Ban, Bell, BellOff,
  Image as ImageIcon, Briefcase, Clock, Globe, UserPlus, UserCheck, UserX, Trash2,
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useChatStore } from '@/store/useChatStore';
import { useGroupStore } from '@/store/useGroupStore';
import { buildGagaChatWebUrl, getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
import ProfileCover from '@/components/profile/ProfileCover';
import { isFirestoreAvailable, COLLECTIONS, updateDocById, subscribeToDoc } from '@/lib/firestore';
import { copyToClipboard, nativeShare } from '@/lib/share';
import { validateUsername } from '@/lib/validation';
import { isUsernameAvailable } from '@/lib/supabaseAuth';
import { usePageTitle } from '@/hooks/useDocumentTitle';
import { toast } from 'sonner';
import ReportUserSheet from '@/components/features/contacts/ReportUserSheet';
import type { User } from '@/types';

export default function ProfilePage() {
  const { userId: paramUserId } = useParams<{ userId?: string }>();
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const {
    friends, blockedUsers, requests, sentRequests,
    blockUser, unblockUser, sendRequest, acceptRequest, cancelRequest,
    removeFriend, getMutualFriendsCount,
    followUser, unfollowUser, toggleCloseFriend, getFollowers, getFollowing,
  } = useFriendStore();
  const { chats, createDirectChat, muteChat } = useChatStore();
  const { groups, subscribeGroups } = useGroupStore();

  const isOwnProfile = !paramUserId || paramUserId === user?.id;
  const [otherUser, setOtherUser] = useState<User | null>(null);
  const [loadingOther, setLoadingOther] = useState(false);
  const [mutualCount, setMutualCount] = useState(0);
  const [showReportSheet, setShowReportSheet] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ type: 'block' | 'remove' } | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [followersCount, setFollowersCount] = useState<number | null>(null);
  const [followingCount, setFollowingCount] = useState<number | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);

  usePageTitle(isOwnProfile ? 'My Profile' : 'Profile');

  useEffect(() => {
    if (isOwnProfile || !paramUserId) return;
    const friend = friends.find(f => f.id === paramUserId);
    if (friend) { setOtherUser(friend as User); return; }
    if (!isFirestoreAvailable()) return;
    setLoadingOther(true);
    let resolved = false;
    const unsub = subscribeToDoc(COLLECTIONS.USERS, paramUserId, (data) => {
      if (data) setOtherUser(data as User);
      if (!resolved) { resolved = true; setLoadingOther(false); }
    });
    return () => { unsub(); };
  }, [isOwnProfile, paramUserId, friends]);

  // Keep the group list live so "groups in common" stays accurate.
  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeGroups(user.id);
    return () => { unsub(); };
  }, [user?.id, subscribeGroups]);

  // Resolve the relationship + mutual-friend count when viewing someone else.
  useEffect(() => {
    if (isOwnProfile || !user?.id || !otherUser?.id) return;
    let cancelled = false;
    (async () => {
      const count = await getMutualFriendsCount(user.id, otherUser.id);
      if (!cancelled) setMutualCount(count);
    })();
    return () => { cancelled = true; };
  }, [isOwnProfile, user?.id, otherUser?.id, getMutualFriendsCount]);

  const displayUser = isOwnProfile ? user : otherUser;

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(user?.name || '');
  const [editUsername, setEditUsername] = useState(user?.username || '');
  const [editBio, setEditBio] = useState(user?.bio || '');
  const [editLocation, setEditLocation] = useState(user?.location || '');
  const [editWebsite, setEditWebsite] = useState(user?.website || '');
  const [editBusinessName, setEditBusinessName] = useState(user?.businessName || '');
  const [editBusinessCategory, setEditBusinessCategory] = useState(user?.businessCategory || '');
  const [editBusinessDescription, setEditBusinessDescription] = useState(user?.businessDescription || '');
  const [editBusinessAddress, setEditBusinessAddress] = useState(user?.businessAddress || '');
  const [editBusinessHours, setEditBusinessHours] = useState(user?.businessHours || '');
  const [editBusinessWebsite, setEditBusinessWebsite] = useState(user?.businessWebsite || '');
  const [editBusinessEmail, setEditBusinessEmail] = useState(user?.businessEmail || '');
  const [editBusinessPhone, setEditBusinessPhone] = useState(user?.businessPhone || '');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingCoverVideo, setUploadingCoverVideo] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const coverVideoInputRef = useRef<HTMLInputElement>(null);
  const profileUrl = displayUser ? buildGagaChatWebUrl(displayUser.id) : '';

  // ── Relationship memos (other-user view) ──
  const isBlocked = useMemo(
    () => (otherUser ? blockedUsers.some(b => b.blockedId === otherUser.id) : false),
    [otherUser, blockedUsers],
  );
  const isFriend = useMemo(
    () => (otherUser ? friends.some(f => f.id === otherUser.id) : false),
    [otherUser, friends],
  );
  const isFavorite = useMemo(
    () => (otherUser ? !!user?.favorites?.includes(otherUser.id) : false),
    [otherUser, user?.favorites],
  );
  const requestSent = useMemo(
    () => (otherUser ? sentRequests.some(r => r.toUserId === otherUser.id) : false),
    [otherUser, sentRequests],
  );
  const incomingRequest = useMemo(
    () => (otherUser ? requests.find(r => r.from === otherUser.id) : undefined),
    [otherUser, requests],
  );
  const directChat = useMemo(
    () => (otherUser ? chats.find(c => c.type === 'direct' && c.participants.includes(otherUser.id)) : undefined),
    [otherUser, chats],
  );
  const mutualGroups = useMemo(() => {
    if (!otherUser || !user?.id) return [];
    return groups.filter(g => g.participants.includes(user.id) && g.participants.includes(otherUser.id));
  }, [otherUser, user?.id, groups]);
  const isCloseFriend = useMemo(
    () => (otherUser ? !!user?.closeFriends?.includes(otherUser.id) : false),
    [otherUser, user?.closeFriends],
  );

  // Load real follower/following counts (and follow status) from the store.
  useEffect(() => {
    const targetId = isOwnProfile ? user?.id : otherUser?.id;
    if (!targetId) return;
    let cancelled = false;
    (async () => {
      try {
        const [followers, following] = await Promise.all([
          getFollowers(targetId),
          getFollowing(targetId),
        ]);
        if (cancelled) return;
        setFollowersCount(followers.length);
        setFollowingCount(following.length);
        if (!isOwnProfile && user?.id) {
          setIsFollowing(followers.some(f => f.id === user.id));
        }
      } catch {
        if (!cancelled) { setFollowersCount(0); setFollowingCount(0); }
      }
    })();
    return () => { cancelled = true; };
  }, [isOwnProfile, user?.id, otherUser?.id, getFollowers, getFollowing]);

  // ── Visibility enforcement (respect the viewed user's privacy settings) ──
  const canSeeFriendList = isOwnProfile || !displayUser?.hideFriendList;

  const startEdit = useCallback(() => {
    setEditName(user?.name || '');
    setEditUsername(user?.username || '');
    setEditBio(user?.bio || '');
    setEditLocation(user?.location || '');
    setEditWebsite(user?.website || '');
    setEditBusinessName(user?.businessName || '');
    setEditBusinessCategory(user?.businessCategory || '');
    setEditBusinessDescription(user?.businessDescription || '');
    setEditBusinessAddress(user?.businessAddress || '');
    setEditBusinessHours(user?.businessHours || '');
    setEditBusinessWebsite(user?.businessWebsite || '');
    setEditBusinessEmail(user?.businessEmail || '');
    setEditBusinessPhone(user?.businessPhone || '');
    setEditing(true);
  }, [user]);

  const cancelEdit = useCallback(() => setEditing(false), []);

  const saveEdit = useCallback(async () => {
    if (!user?.id || !isFirestoreAvailable()) return;
    const usernameCheck = validateUsername(editUsername);
    if (editUsername.trim() && !usernameCheck.valid) {
      toast.error(usernameCheck.error || 'Invalid username');
      return;
    }
    setSaving(true);
    try {
      const normalizedUsername = usernameCheck.normalized;
      if (normalizedUsername && normalizedUsername !== (user.username || '')) {
        const availability = await isUsernameAvailable(normalizedUsername, user.id);
        if (!availability.available) {
          toast.error(availability.error || 'That username is already taken');
          setSaving(false);
          return;
        }
      }
      const updates: Record<string, unknown> = {
        name: editName.trim(),
        username: normalizedUsername,
        bio: editBio.trim(),
        location: editLocation.trim(),
        website: editWebsite.trim(),
      };
      if (user.isBusiness) {
        updates.businessName = editBusinessName.trim();
        updates.businessCategory = editBusinessCategory.trim();
        updates.businessDescription = editBusinessDescription.trim();
        updates.businessAddress = editBusinessAddress.trim();
        updates.businessHours = editBusinessHours.trim();
        updates.businessWebsite = editBusinessWebsite.trim();
        updates.businessEmail = editBusinessEmail.trim();
        updates.businessPhone = editBusinessPhone.trim();
      }
      await updateDocById(COLLECTIONS.USERS, user.id, updates);
      setUser({ ...user, ...updates });
      setEditing(false);
      toast.success('Profile updated');
    } catch {
      toast.error('Failed to save profile');
    } finally {
      setSaving(false);
    }
  }, [user, editName, editUsername, editBio, editLocation, editWebsite,
      editBusinessName, editBusinessCategory, editBusinessDescription, editBusinessAddress,
      editBusinessHours, editBusinessWebsite, editBusinessEmail, editBusinessPhone, setUser]);

  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Image must be under 10MB'); return; }
    setUploadingAvatar(true);
    try {
      const { uploadMediaBlob } = await import('@/lib/storage');
      const url = await uploadMediaBlob({ kind: 'avatars', file, mimeType: file.type, userId: user.id });
      if (!url) throw new Error('Upload failed');
      await updateDocById(COLLECTIONS.USERS, user.id, { avatar: url });
      setUser({ ...user, avatar: url });
      toast.success('Avatar updated');
    } catch {
      toast.error('Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }, [user, setUser]);

  const handleCoverUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Image must be under 10MB'); return; }
    setUploadingCover(true);
    try {
      const { uploadMediaBlob } = await import('@/lib/storage');
      // Use a dedicated kind so cover images land in the posts bucket/folder
      // instead of the avatars bucket. 'posts' kind supports image uploads.
      const url = await uploadMediaBlob({ kind: 'covers', file, mimeType: file.type, userId: user.id });
      if (!url) throw new Error('Upload failed');
      await updateDocById(COLLECTIONS.USERS, user.id, { coverImage: url, coverVideo: '' });
      setUser({ ...user, coverImage: url, coverVideo: '' });
      toast.success('Cover image updated');
    } catch {
      toast.error('Failed to upload cover image');
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = '';
    }
  }, [user, setUser]);

  const handleCoverVideoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    if (!file.type.startsWith('video/')) { toast.error('Please select a video file'); return; }
    if (file.size > 50 * 1024 * 1024) { toast.error('Video must be under 50MB'); return; }
    setUploadingCoverVideo(true);
    try {
      const { uploadMediaBlob } = await import('@/lib/storage');
      const url = await uploadMediaBlob({ kind: 'covers', file, mimeType: file.type, userId: user.id });
      if (!url) throw new Error('Upload failed');
      await updateDocById(COLLECTIONS.USERS, user.id, { coverVideo: url, coverImage: '' });
      setUser({ ...user, coverVideo: url, coverImage: '' });
      toast.success('Cover video updated');
    } catch {
      toast.error('Failed to upload cover video');
    } finally {
      setUploadingCoverVideo(false);
      if (coverVideoInputRef.current) coverVideoInputRef.current.value = '';
    }
  }, [user, setUser]);

  const handleRemoveCover = useCallback(async () => {
    if (!user?.id) return;
    try {
      await updateDocById(COLLECTIONS.USERS, user.id, { coverImage: '', coverVideo: '' });
      setUser({ ...user, coverImage: '', coverVideo: '' });
      toast.success('Cover removed');
    } catch {
      toast.error('Failed to remove cover');
    }
  }, [user, setUser]);

  const handleCopyLink = useCallback(async () => {
    const ok = await copyToClipboard(profileUrl);
    if (ok) {
      toast.success('Profile link copied');
    } else {
      toast.error('Unable to copy link in this browser');
    }
    setShowShareSheet(false);
  }, [profileUrl]);

  const handleNativeShare = useCallback(async () => {
    const usedNative = await nativeShare({ title: `${displayUser?.name} on GaGa`, url: profileUrl, text: 'Check out my profile on GaGa' });
    if (!usedNative) {
      await handleCopyLink();
    }
    setShowShareSheet(false);
  }, [displayUser?.name, profileUrl, handleCopyLink]);

  // ── Other-user action handlers ──
  const handleMessageUser = useCallback(async () => {
    if (!user?.id || !otherUser) return;
    setActionBusy(true);
    try {
      await createDirectChat(otherUser.id, user.id);
      navigate(`/chat/${otherUser.id}`);
    } catch {
      toast.error('Failed to open chat');
    } finally {
      setActionBusy(false);
    }
  }, [user?.id, otherUser, createDirectChat, navigate]);

  const handleVoiceCall = useCallback(() => {
    if (!otherUser) return;
    navigate('/call', { state: { userId: otherUser.id, mode: 'voice' } });
  }, [otherUser, navigate]);

  const handleVideoCall = useCallback(() => {
    if (!otherUser) return;
    navigate('/call', { state: { userId: otherUser.id, mode: 'video' } });
  }, [otherUser, navigate]);

  const handleToggleBlock = useCallback(async () => {
    if (!user?.id || !otherUser) return;
    // Unblocking is immediate; blocking asks for confirmation + optional reason.
    if (!isBlocked) { setConfirmDialog({ type: 'block' }); return; }
    setActionBusy(true);
    try {
      await unblockUser(otherUser.id, user.id);
      toast.success('User unblocked');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionBusy(false);
    }
  }, [user?.id, otherUser, isBlocked, unblockUser]);

  const confirmBlock = useCallback(async () => {
    if (!user?.id || !otherUser) return;
    setActionBusy(true);
    try {
      await blockUser(otherUser.id, user.id, blockReason.trim() || undefined);
      toast.success('User blocked');
      setConfirmDialog(null);
      setBlockReason('');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionBusy(false);
    }
  }, [user?.id, otherUser, blockUser, blockReason]);

  const handleCopyUsername = useCallback(async () => {
    const handle = displayUser?.username ? `@${displayUser.username}` : (displayUser?.name || '');
    if (!handle) return;
    const ok = await copyToClipboard(handle);
    if (ok) toast.success('Username copied');
    else toast.error('Unable to copy');
  }, [displayUser?.username, displayUser?.name]);

  const handleToggleCloseFriend = useCallback(async () => {
    if (!user?.id || !otherUser) return;
    setActionBusy(true);
    try {
      await toggleCloseFriend(otherUser.id, user.id, user.closeFriends || []);
      toast.success(isCloseFriend ? 'Removed from close friends' : 'Added to close friends');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionBusy(false);
    }
  }, [user?.id, user, otherUser, isCloseFriend, toggleCloseFriend]);

  const handleToggleFollow = useCallback(async () => {
    if (!user?.id || !otherUser) return;
    setActionBusy(true);
    try {
      if (isFollowing) {
        await unfollowUser(otherUser.id, user.id);
        setIsFollowing(false);
        setFollowersCount(c => (c ?? 1) - 1);
        toast.success('Unfollowed');
      } else {
        await followUser(otherUser.id, user.id);
        setIsFollowing(true);
        setFollowersCount(c => (c ?? 0) + 1);
        toast.success('Following');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionBusy(false);
    }
  }, [user?.id, otherUser, isFollowing, followUser, unfollowUser]);

  const handleAddFriend = useCallback(async () => {
    if (!user?.id || !otherUser) return;
    setActionBusy(true);
    try {
      await sendRequest(otherUser.id, user.id);
      toast.success('Friend request sent');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send request');
    } finally {
      setActionBusy(false);
    }
  }, [user?.id, otherUser, sendRequest]);

  const handleAcceptRequest = useCallback(async () => {
    if (!incomingRequest) return;
    setActionBusy(true);
    try {
      await acceptRequest(incomingRequest.id);
      toast.success('Friend request accepted');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to accept request');
    } finally {
      setActionBusy(false);
    }
  }, [incomingRequest, acceptRequest]);

  const handleCancelRequest = useCallback(async () => {
    if (!user?.id || !otherUser) return;
    setActionBusy(true);
    try {
      const req = sentRequests.find(r => r.toUserId === otherUser.id);
      if (req) await cancelRequest(req.id);
      toast.success('Request cancelled');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel request');
    } finally {
      setActionBusy(false);
    }
  }, [user?.id, otherUser, sentRequests, cancelRequest]);

  const handleRemoveFriend = useCallback(() => {
    if (!user?.id || !otherUser) return;
    setConfirmDialog({ type: 'remove' });
  }, [user?.id, otherUser]);

  const confirmRemoveFriend = useCallback(async () => {
    if (!user?.id || !otherUser) return;
    setActionBusy(true);
    try {
      await removeFriend(otherUser.id, user.id);
      toast.success('Removed from friends');
      setConfirmDialog(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove friend');
    } finally {
      setActionBusy(false);
    }
  }, [user?.id, otherUser, removeFriend]);

  const handleToggleMute = useCallback(async () => {
    if (!directChat) { toast.error('No conversation to mute yet'); return; }
    setActionBusy(true);
    try {
      await muteChat(directChat.id);
      toast.success(directChat.isMuted ? 'Notifications unmuted' : 'Notifications muted');
    } catch {
      toast.error('Failed to update mute');
    } finally {
      setActionBusy(false);
    }
  }, [directChat, muteChat]);

  const handleOpenSharedMedia = useCallback(() => {
    if (!directChat) { toast.error('No conversation yet'); return; }
    navigate(`/chat-info/${directChat.id}`);
  }, [directChat, navigate]);

  const profileCompletion = useMemo(() => {
    const fields = [
      Boolean(displayUser?.name),
      Boolean(displayUser?.bio),
      Boolean(displayUser?.avatar),
      Boolean(displayUser?.coverImage) || Boolean(displayUser?.coverVideo),
      Boolean(displayUser?.location),
      Boolean(displayUser?.website),
    ];
    const completed = fields.filter(Boolean).length;
    return Math.round((completed / fields.length) * 100);
  }, [displayUser]);

  const stats = [
    { label: 'Friends', value: canSeeFriendList ? (displayUser?.friends?.length ?? (isOwnProfile ? friends.length : 0)) : null },
    { label: 'Followers', value: followersCount ?? (displayUser?.followers?.length ?? 0) },
    { label: 'Following', value: followingCount ?? (displayUser?.following?.length ?? 0) },
  ];

  if (!displayUser) {
    return (
      <div className="min-h-[100vh] bg-muted flex items-center justify-center">
        {loadingOther
          ? <Loader size={28} className="animate-spin text-[#00C300]" />
          : <p className="text-muted-foreground text-sm">Profile not found</p>}
      </div>
    );
  }

  const avatarSrc = sanitizeMediaUrl(displayUser.avatar) || getDefaultAvatar(displayUser.id || displayUser.name || 'U');

  return (
    <div className="min-h-screen-safe bg-muted">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border px-4 flex items-center justify-between" style={{ paddingTop: 'max(12px, env(safe-area-inset-top, 0px))', paddingBottom: '12px' }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft size={22} className="text-foreground" />
        </button>
        <h1 className="text-[17px] font-bold text-foreground">
          {isOwnProfile ? 'My Profile' : displayUser.name}
        </h1>
        <div className="flex items-center gap-1">
          {isOwnProfile && (
            <>
              <button
                type="button"
                onClick={() => navigate('/more')}
                className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
                aria-label="More options"
              >
                <MoreHorizontal size={20} className="text-muted-foreground" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/settings')}
                className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
                aria-label="Open settings"
              >
                <Settings size={20} className="text-muted-foreground" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3 pb-16">
        {/* Avatar + Name card */}
        <div className="bg-background rounded-2xl shadow-sm overflow-hidden">
          {/* Cover image / video */}
          <div className="relative h-32 sm:h-40 w-full">
            <ProfileCover
              videoUrl={displayUser.coverVideo}
              imageUrl={displayUser.coverImage}
              alt={`${displayUser.name}'s cover`}
            />
            {isOwnProfile && (
              <>
                <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
                  {(displayUser.coverImage || displayUser.coverVideo) && (
                    <button
                      type="button"
                      onClick={handleRemoveCover}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-black/50 backdrop-blur-sm text-white rounded-full text-xs font-medium hover:bg-black/70 transition-colors"
                      aria-label="Remove cover"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-black/50 backdrop-blur-sm text-white rounded-full text-xs font-medium hover:bg-black/70 transition-colors"
                    aria-label="Change cover photo"
                  >
                    <Camera size={14} />
                    {uploadingCover ? 'Uploading…' : 'Photo'}
                  </button>
                  <button
                    type="button"
                    onClick={() => coverVideoInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-black/50 backdrop-blur-sm text-white rounded-full text-xs font-medium hover:bg-black/70 transition-colors"
                    aria-label="Change cover video"
                  >
                    <Video size={14} />
                    {uploadingCoverVideo ? 'Uploading…' : 'Video'}
                  </button>
                </div>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCoverUpload}
                  aria-label="Upload cover image"
                />
                <input
                  ref={coverVideoInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleCoverVideoUpload}
                  aria-label="Upload cover video"
                />
              </>
            )}
            {(uploadingCover || uploadingCoverVideo) && (
              <div className="absolute top-0 right-0 bottom-0 left-0 bg-black/30 flex items-center justify-center">
                <div className="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          <div className="p-5">
            <div className="flex flex-col items-center">
              {/* Avatar with stories ring + upload */}
              <div className="relative mb-3">
                <div className={`p-[3px] rounded-full ${displayUser.isPremium ? 'bg-gradient-to-tr from-[#FFD700] via-[#FF9800] to-[#FF4081]' : 'bg-gradient-to-tr from-[#00C300] to-[#00FF00]'}`}>
                  <div className="p-[2px] bg-background rounded-full">
                    <div className="w-24 h-24 rounded-full overflow-hidden bg-muted relative">
                      <img
                        src={avatarSrc}
                        className="w-full h-full object-cover"
                        alt={`${displayUser.name}'s avatar`}
                      />
                      {uploadingAvatar && (
                        <div className="absolute top-0 right-0 bottom-0 left-0 bg-black/40 flex items-center justify-center">
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {isOwnProfile && (
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute bottom-0 right-0 w-8 h-8 bg-[#00C300] rounded-full flex items-center justify-center border-2 border-white shadow-sm hover:bg-[#00A300] transition-colors"
                    aria-label="Change avatar"
                  >
                    <Camera size={14} className="text-white" />
                  </button>
                )}
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                  aria-label="Upload avatar"
                />
              </div>

              {/* Name + username */}
              {editing ? (
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="text-xl font-bold text-foreground text-center bg-muted rounded-xl px-3 py-1.5 w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-[#00C300] mb-1"
                  placeholder="Your name"
                  aria-label="Edit name"
                  maxLength={50}
                />
              ) : (
                <div className="flex items-center gap-1.5 mb-1">
                  <h2 className="text-xl font-bold text-foreground">
                    {displayUser.displayName || displayUser.name || 'Your profile'}
                  </h2>
                  {displayUser.verified && (
                    <BadgeCheck size={18} className="text-[#00C300] shrink-0" aria-label="Verified" />
                  )}
                  {displayUser.isPremium && (
                    <span className="text-[10px] bg-gradient-to-r from-[#FFD700] to-[#FF9800] text-white px-2 py-0.5 rounded-full font-bold">
                      PRO
                    </span>
                  )}
                  {displayUser.isBusiness && (
                    <span className="text-[10px] bg-[#00C300]/10 text-[#00C300] px-2 py-0.5 rounded-full font-bold">
                      BUSINESS
                    </span>
                  )}
                </div>
              )}
              <p className="text-sm text-muted-foreground mb-2">@{displayUser.username || 'user'}</p>

              {/* Relationship / mutual friends line (other-user view) */}
              {!isOwnProfile && (
                <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
                  {isFriend && (
                    <span className="text-[10px] font-medium bg-[#00C300]/10 text-[#00C300] px-2 py-0.5 rounded-full">Friend</span>
                  )}
                  {isFavorite && (
                    <span className="text-[10px] font-medium bg-[#00C300]/10 text-[#00C300] px-2 py-0.5 rounded-full">Favorite</span>
                  )}
                  {isCloseFriend && (
                    <span className="text-[10px] font-medium bg-[#00C300]/10 text-[#00C300] px-2 py-0.5 rounded-full">Close friend</span>
                  )}
                  {requestSent && (
                    <span className="text-[10px] font-medium bg-[#00C300]/10 text-[#00C300] px-2 py-0.5 rounded-full">Request sent</span>
                  )}
                  {incomingRequest && (
                    <span className="text-[10px] font-medium bg-[#00C300]/10 text-[#00C300] px-2 py-0.5 rounded-full">Wants to connect</span>
                  )}
                  {isBlocked && (
                    <span className="text-[10px] font-medium bg-[#FF3B30]/10 text-[#FF3B30] px-2 py-0.5 rounded-full">Blocked</span>
                  )}
                  {mutualCount > 0 && (
                    <span className="text-[10px] font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                      {mutualCount} mutual friend{mutualCount === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              )}

              {/* Username (edit mode) */}
              {editing && (
                <div className="w-full max-w-xs mb-2">
                  <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
                    <span className="text-sm text-muted-foreground">@</span>
                    <input
                      value={editUsername}
                      onChange={e => setEditUsername(e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground focus:outline-none"
                      placeholder="username"
                      aria-label="Edit username"
                      maxLength={30}
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                  </div>
                  {editUsername.trim() && !validateUsername(editUsername).valid && (
                    <p className="text-[11px] text-red-500 mt-1 px-1">{validateUsername(editUsername).error}</p>
                  )}
                </div>
              )}

              {/* Bio */}
              {editing ? (
                <textarea
                  value={editBio}
                  onChange={e => setEditBio(e.target.value)}
                  className="w-full max-w-xs bg-muted rounded-xl px-3 py-2 text-sm text-foreground text-center resize-none focus:outline-none focus:ring-2 focus:ring-[#00C300] mb-2"
                  placeholder="Write a bio..."
                  rows={2}
                  maxLength={150}
                  aria-label="Edit bio"
                />
              ) : (
                displayUser.bio && (
                  <p className="text-sm text-muted-foreground text-center max-w-xs mb-2">{displayUser.bio}</p>
                )
              )}

              {/* Location + Website (edit mode) */}
              {editing && (
                <div className="w-full max-w-xs space-y-2 mb-3">
                  <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
                    <MapPin size={14} className="text-muted-foreground shrink-0" />
                    <input
                      value={editLocation}
                      onChange={e => setEditLocation(e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground focus:outline-none"
                      placeholder="Location"
                      aria-label="Edit location"
                      maxLength={60}
                    />
                  </div>
                  <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
                    <Link2 size={14} className="text-muted-foreground shrink-0" />
                    <input
                      value={editWebsite}
                      onChange={e => setEditWebsite(e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground focus:outline-none"
                      placeholder="Website"
                      aria-label="Edit website"
                      maxLength={100}
                    />
                  </div>
                </div>
              )}

              {/* Business fields (edit mode, business accounts only) */}
              {editing && user?.isBusiness && (
                <div className="w-full max-w-xs space-y-2 mb-3">
                  <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
                    <Briefcase size={14} className="text-muted-foreground shrink-0" />
                    <input
                      value={editBusinessName}
                      onChange={e => setEditBusinessName(e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground focus:outline-none"
                      placeholder="Business name"
                      aria-label="Edit business name"
                      maxLength={80}
                    />
                  </div>
                  <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
                    <Briefcase size={14} className="text-muted-foreground shrink-0" />
                    <input
                      value={editBusinessCategory}
                      onChange={e => setEditBusinessCategory(e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground focus:outline-none"
                      placeholder="Category (e.g. Retail)"
                      aria-label="Edit business category"
                      maxLength={40}
                    />
                  </div>
                  <textarea
                    value={editBusinessDescription}
                    onChange={e => setEditBusinessDescription(e.target.value)}
                    className="w-full bg-muted rounded-xl px-3 py-2 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-[#00C300]"
                    placeholder="Business description"
                    rows={2}
                    maxLength={300}
                    aria-label="Edit business description"
                  />
                  <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
                    <MapPin size={14} className="text-muted-foreground shrink-0" />
                    <input
                      value={editBusinessAddress}
                      onChange={e => setEditBusinessAddress(e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground focus:outline-none"
                      placeholder="Business address"
                      aria-label="Edit business address"
                      maxLength={120}
                    />
                  </div>
                  <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
                    <Clock size={14} className="text-muted-foreground shrink-0" />
                    <input
                      value={editBusinessHours}
                      onChange={e => setEditBusinessHours(e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground focus:outline-none"
                      placeholder="Business hours (e.g. 9am–5pm)"
                      aria-label="Edit business hours"
                      maxLength={80}
                    />
                  </div>
                  <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
                    <Globe size={14} className="text-muted-foreground shrink-0" />
                    <input
                      value={editBusinessWebsite}
                      onChange={e => setEditBusinessWebsite(e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground focus:outline-none"
                      placeholder="Business website"
                      aria-label="Edit business website"
                      maxLength={100}
                    />
                  </div>
                  <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
                    <Mail size={14} className="text-muted-foreground shrink-0" />
                    <input
                      value={editBusinessEmail}
                      onChange={e => setEditBusinessEmail(e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground focus:outline-none"
                      placeholder="Business email"
                      aria-label="Edit business email"
                      maxLength={100}
                    />
                  </div>
                  <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
                    <Phone size={14} className="text-muted-foreground shrink-0" />
                    <input
                      value={editBusinessPhone}
                      onChange={e => setEditBusinessPhone(e.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground focus:outline-none"
                      placeholder="Business phone"
                      aria-label="Edit business phone"
                      maxLength={30}
                    />
                  </div>
                </div>
              )}

              {/* Location + Website (view mode) */}
              {!editing && (displayUser.location || displayUser.website) && (
                <div className="flex flex-wrap items-center justify-center gap-3 mb-3">
                  {displayUser.location && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin size={12} /> {displayUser.location}
                    </span>
                  )}
                  {displayUser.website && (
                    <a
                      href={displayUser.website.startsWith('http') ? displayUser.website : `https://${displayUser.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-[#00C300] hover:underline"
                    >
                      <Link2 size={12} /> {displayUser.website.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                </div>
              )}

              {/* Action buttons (own profile) */}
              {isOwnProfile && (
                <div className="flex gap-2 mt-1">
                  {editing ? (
                    <>
                      <button
                        type="button"
                        onClick={saveEdit}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-5 py-2 bg-[#00C300] text-white rounded-full text-sm font-medium hover:bg-[#00A300] transition-colors disabled:opacity-50"
                        aria-label="Save profile changes"
                      >
                        <Check size={14} /> {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="flex items-center gap-1.5 px-5 py-2 bg-muted text-foreground rounded-full text-sm font-medium hover:bg-muted transition-colors"
                        aria-label="Cancel editing"
                      >
                        <X size={14} /> Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={startEdit}
                        className="flex items-center gap-1.5 px-5 py-2 bg-muted text-foreground rounded-full text-sm font-medium hover:bg-muted transition-colors"
                        aria-label="Edit profile"
                      >
                        <Edit3 size={14} /> Edit Profile
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate('/privacy')}
                        className="flex items-center gap-1.5 px-5 py-2 bg-muted text-foreground rounded-full text-sm font-medium hover:bg-muted transition-colors"
                        aria-label="Privacy settings"
                      >
                        <Settings size={14} /> Privacy
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowShareSheet(true)}
                        className="flex items-center gap-1.5 px-5 py-2 bg-muted text-foreground rounded-full text-sm font-medium hover:bg-muted transition-colors"
                        aria-label="Share profile"
                      >
                        <Share2 size={14} /> Share
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Other-user action buttons */}
        {!isOwnProfile && (
          <div className="bg-background rounded-2xl p-4 shadow-sm">
            {/* Primary actions */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={actionBusy || isBlocked}
                onClick={handleMessageUser}
                className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-[#00C300]/10 text-[#00C300] font-medium text-xs active:bg-[#00C300]/20 transition-colors disabled:opacity-40"
                aria-label="Message user"
              >
                <MessageCircle size={20} /> Message
              </button>
              <button
                type="button"
                disabled={actionBusy || isBlocked}
                onClick={handleVoiceCall}
                className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-[#00C300]/10 text-[#00C300] font-medium text-xs active:bg-[#00C300]/20 transition-colors disabled:opacity-40"
                aria-label="Voice call user"
              >
                <Phone size={20} /> Voice
              </button>
              <button
                type="button"
                disabled={actionBusy || isBlocked}
                onClick={handleVideoCall}
                className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-[#00C300]/10 text-[#00C300] font-medium text-xs active:bg-[#00C300]/20 transition-colors disabled:opacity-40"
                aria-label="Video call user"
              >
                <Video size={20} /> Video
              </button>
            </div>

            {/* Secondary actions */}
            <div className="mt-2 space-y-1">
              {isFriend ? (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={handleRemoveFriend}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors text-left disabled:opacity-40"
                >
                  <UserX size={18} className="text-[#FF3B30]" />
                  <span className="text-sm font-medium text-foreground">Remove friend</span>
                </button>
              ) : requestSent ? (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={handleCancelRequest}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors text-left disabled:opacity-40"
                >
                  <X size={18} className="text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">Cancel friend request</span>
                </button>
              ) : incomingRequest ? (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={handleAcceptRequest}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors text-left disabled:opacity-40"
                >
                  <UserCheck size={18} className="text-[#00C300]" />
                  <span className="text-sm font-medium text-foreground">Accept friend request</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={actionBusy || isBlocked}
                  onClick={handleAddFriend}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors text-left disabled:opacity-40"
                >
                  <UserPlus size={18} className="text-[#00C300]" />
                  <span className="text-sm font-medium text-foreground">Add friend</span>
                </button>
              )}

              {!isBlocked && (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={handleToggleFollow}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors text-left disabled:opacity-40"
                >
                  {isFollowing
                    ? <><UserCheck size={18} className="text-[#00C300]" /><span className="text-sm font-medium text-foreground">Following</span></>
                    : <><UserPlus size={18} className="text-[#00C300]" /><span className="text-sm font-medium text-foreground">Follow</span></>}
                </button>
              )}

              {isFriend && (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={handleToggleCloseFriend}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors text-left disabled:opacity-40"
                >
                  <Heart size={18} className={isCloseFriend ? 'text-[#00C300] fill-[#00C300]' : 'text-[#00C300]'} />
                  <span className="text-sm font-medium text-foreground">{isCloseFriend ? 'Remove from close friends' : 'Add to close friends'}</span>
                </button>
              )}

              <button
                type="button"
                disabled={actionBusy}
                onClick={handleCopyUsername}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors text-left disabled:opacity-40"
              >
                <Copy size={18} className="text-[#00C300]" />
                <span className="text-sm font-medium text-foreground">Copy username</span>
              </button>

              <button
                type="button"
                disabled={actionBusy}
                onClick={handleToggleMute}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors text-left disabled:opacity-40"
              >
                {directChat?.isMuted
                  ? <><Bell size={18} className="text-[#00C300]" /><span className="text-sm font-medium text-foreground">Unmute notifications</span></>
                  : <><BellOff size={18} className="text-[#00C300]" /><span className="text-sm font-medium text-foreground">Mute notifications</span></>}
              </button>

              <button
                type="button"
                disabled={actionBusy}
                onClick={handleOpenSharedMedia}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors text-left disabled:opacity-40"
              >
                <ImageIcon size={18} className="text-[#00C300]" />
                <span className="text-sm font-medium text-foreground">Shared media</span>
              </button>

              <button
                type="button"
                disabled={actionBusy}
                onClick={() => setShowShareSheet(true)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors text-left disabled:opacity-40"
              >
                <Share2 size={18} className="text-[#00C300]" />
                <span className="text-sm font-medium text-foreground">Share profile</span>
              </button>

              <button
                type="button"
                disabled={actionBusy}
                onClick={handleToggleBlock}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors text-left disabled:opacity-40"
              >
                {isBlocked
                  ? <><Ban size={18} className="text-[#00C300]" /><span className="text-sm font-medium text-[#00C300]">Unblock</span></>
                  : <><Ban size={18} className="text-[#FF3B30]" /><span className="text-sm font-medium text-[#FF3B30]">Block</span></>}
              </button>

              <button
                type="button"
                disabled={actionBusy}
                onClick={() => setShowReportSheet(true)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors text-left disabled:opacity-40"
              >
                <Flag size={18} className="text-[#FF3B30]" />
                <span className="text-sm font-medium text-[#FF3B30]">Report</span>
              </button>
            </div>

            {actionBusy && (
              <div className="flex items-center justify-center gap-2 py-2 text-muted-foreground text-xs">
                <Loader size={14} className="animate-spin" /> Working…
              </div>
            )}
          </div>
        )}

        {/* Stats bar */}
        <div className="bg-background rounded-2xl shadow-sm overflow-hidden">
          <div className="grid grid-cols-3 divide-x divide-border">
            {stats.map(({ label, value }) => (
              <div key={label} className="flex flex-col items-center py-4 px-2">
                <span className="text-lg font-bold text-foreground">
                  {value === null ? '—' : value.toLocaleString()}
                </span>
                <span className="text-[11px] text-muted-foreground mt-0.5">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {isOwnProfile && (
          <div className="bg-background rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Profile completeness</h3>
                <p className="text-[11px] text-muted-foreground">Add a bio, photo, and links to make your profile feel complete.</p>
              </div>
              <span className="text-sm font-bold text-[#00C300]">{profileCompletion}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-[#00C300] transition-all" style={{ width: `${profileCompletion}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {user?.hideOnlineStatus ? <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-foreground">Online status hidden</span> : <span className="rounded-full bg-[#00C300]/10 px-2.5 py-1 text-[10px] font-medium text-[#00C300]">Online status visible</span>}
              {user?.hideFriendList ? <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-foreground">Friend list hidden</span> : <span className="rounded-full bg-[#00C300]/10 px-2.5 py-1 text-[10px] font-medium text-[#00C300]">Friend list visible</span>}
            </div>
          </div>
        )}

        {/* Business profile */}
        {displayUser.isBusiness && (
          <div className="bg-background rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Briefcase size={16} className="text-[#00C300]" />
              <h3 className="text-sm font-semibold text-foreground">{displayUser.businessName || 'Business'}</h3>
              {displayUser.businessCategory && (
                <span className="text-[10px] bg-[#00C300]/10 text-[#00C300] px-2 py-0.5 rounded-full font-medium">
                  {displayUser.businessCategory}
                </span>
              )}
            </div>
            {displayUser.businessDescription && (
              <p className="text-sm text-muted-foreground">{displayUser.businessDescription}</p>
            )}
            <div className="space-y-2">
              {displayUser.businessAddress && (
                <div className="flex items-center gap-3 text-sm text-foreground">
                  <MapPin size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
                  <span>{displayUser.businessAddress}</span>
                </div>
              )}
              {displayUser.businessHours && (
                <div className="flex items-center gap-3 text-sm text-foreground">
                  <Clock size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
                  <span>{displayUser.businessHours}</span>
                </div>
              )}
              {displayUser.businessWebsite && (
                <a
                  href={displayUser.businessWebsite.startsWith('http') ? displayUser.businessWebsite : `https://${displayUser.businessWebsite}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 text-sm text-[#00C300] hover:underline"
                >
                  <Globe size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
                  <span className="truncate">{displayUser.businessWebsite.replace(/^https?:\/\//, '')}</span>
                </a>
              )}
              {displayUser.businessEmail && (
                <div className="flex items-center gap-3 text-sm text-foreground">
                  <Mail size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
                  <span className="truncate">{displayUser.businessEmail}</span>
                </div>
              )}
              {displayUser.businessPhone && (
                <div className="flex items-center gap-3 text-sm text-foreground">
                  <Phone size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
                  <span>{displayUser.businessPhone}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Groups in common (other-user view) */}
        {!isOwnProfile && mutualGroups.length > 0 && (
          <div className="bg-background rounded-2xl p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Groups in common ({mutualGroups.length})
            </h3>
            <div className="space-y-1">
              {mutualGroups.slice(0, 5).map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => navigate(`/group/${g.id}`)}
                  className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-muted transition-colors text-left"
                  aria-label={`Open group ${g.name || 'Group'}`}
                >
                  <img
                    src={sanitizeMediaUrl(g.avatar) || getDefaultAvatar(g.id)}
                    className="w-10 h-10 rounded-full object-cover shrink-0"
                    alt=""
                  />
                  <span className="text-sm font-medium text-foreground truncate">{g.name || 'Group'}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Contact info */}
        {(displayUser.email || displayUser.phone || profileUrl) && (
          <div className="bg-background rounded-2xl p-4 shadow-sm space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Contact Info</h3>
            {displayUser.email && (
              <div className="flex items-center gap-3 text-sm text-foreground">
                <Mail size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
                <span className="truncate">{displayUser.email}</span>
              </div>
            )}
            {displayUser.phone && (
              <div className="flex items-center gap-3 text-sm text-foreground">
                <Phone size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
                <span>{displayUser.phone}</span>
              </div>
            )}
            <div className="flex items-center gap-3 text-sm text-[#00C300]">
              <Link2 size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
              <button
                type="button"
                onClick={handleCopyLink}
                className="truncate hover:underline text-left"
                aria-label="Copy profile link"
              >
                {profileUrl}
              </button>
            </div>
          </div>
        )}

        {/* Quick actions (own profile) */}
        {isOwnProfile && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Users, label: 'Friends', action: () => navigate('/contacts') },
              { icon: Heart, label: 'Saved', action: () => navigate('/saved-messages') },
              { icon: MessageCircle, label: 'Chats', action: () => navigate('/chats') },
            ].map(({ icon: Icon, label, action }) => (
              <button
                key={label}
                type="button"
                onClick={action}
                className="bg-background rounded-2xl p-4 shadow-sm flex flex-col items-center gap-2 hover:bg-muted transition-colors"
                aria-label={label}
              >
                <Icon size={22} className="text-[#00C300]" />
                <span className="text-xs font-medium text-foreground">{label}</span>
              </button>
            ))}
          </div>
        )}

        {/* QR Code shortcut (own profile) */}
        {isOwnProfile && (
          <button
            type="button"
            onClick={() => navigate('/qr-scanner')}
            className="w-full bg-background rounded-2xl p-4 shadow-sm flex items-center gap-3 hover:bg-muted transition-colors"
            aria-label="View my QR code"
          >
            <div className="w-10 h-10 rounded-xl bg-[#00C300]/10 flex items-center justify-center shrink-0">
              <QrCode size={20} className="text-[#00C300]" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-foreground">My QR Code</p>
              <p className="text-xs text-muted-foreground">Share your profile instantly</p>
            </div>
            <ArrowLeft size={18} className="text-muted-foreground rotate-180" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Share sheet */}
      <AnimatePresence>
        {showShareSheet && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed top-0 right-0 bottom-0 left-0 bg-black/50 z-50 flex items-end justify-center"
            onClick={() => setShowShareSheet(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-background rounded-t-3xl p-6 w-full max-w-lg"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-5" />
              <h3 className="text-base font-bold text-foreground mb-4">Share Profile</h3>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl hover:bg-muted transition-colors text-left"
                  aria-label="Share via system share sheet"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#00C300]/10 flex items-center justify-center shrink-0">
                    <Share2 size={18} className="text-[#00C300]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Share via…</p>
                    <p className="text-xs text-muted-foreground">Use your device's share options</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl hover:bg-muted transition-colors text-left"
                  aria-label="Copy profile link"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#00C300]/10 flex items-center justify-center shrink-0">
                    <Copy size={18} className="text-[#00C300]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Copy Link</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[220px]">{profileUrl}</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => { navigate('/qr-scanner'); setShowShareSheet(false); }}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl hover:bg-muted transition-colors text-left"
                  aria-label="Show QR code"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#00C300]/10 flex items-center justify-center shrink-0">
                    <QrCode size={18} className="text-[#00C300]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Show QR Code</p>
                    <p className="text-xs text-muted-foreground">Let others scan to find you</p>
                  </div>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowShareSheet(false)}
                className="w-full mt-4 py-3 bg-muted text-foreground rounded-xl text-sm font-bold"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm dialog (block / remove friend) */}
      <AnimatePresence>
        {confirmDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed top-0 right-0 bottom-0 left-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => { setConfirmDialog(null); setBlockReason(''); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-background rounded-2xl p-5 w-full max-w-sm"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-base font-bold text-foreground mb-1">
                {confirmDialog.type === 'block' ? `Block ${otherUser?.name || 'this user'}?` : `Remove ${otherUser?.name || 'this user'}?`}
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                {confirmDialog.type === 'block'
                  ? 'They will no longer be able to message you or see your profile.'
                  : 'They will be removed from your friends list. You can add them again later.'}
              </p>
              {confirmDialog.type === 'block' && (
                <textarea
                  value={blockReason}
                  onChange={e => setBlockReason(e.target.value)}
                  className="w-full bg-muted rounded-xl px-3 py-2 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-[#00C300] mb-3"
                  placeholder="Reason (optional)"
                  rows={2}
                  maxLength={200}
                  aria-label="Block reason"
                />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setConfirmDialog(null); setBlockReason(''); }}
                  className="flex-1 py-2.5 bg-muted text-foreground rounded-xl text-sm font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={confirmDialog.type === 'block' ? confirmBlock : confirmRemoveFriend}
                  className="flex-1 py-2.5 bg-[#FF3B30] text-white rounded-xl text-sm font-bold disabled:opacity-50"
                >
                  {actionBusy ? 'Working…' : confirmDialog.type === 'block' ? 'Block' : 'Remove'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Report sheet */}
      <ReportUserSheet user={showReportSheet ? otherUser : null} onClose={() => setShowReportSheet(false)} />
    </div>
  );
}
