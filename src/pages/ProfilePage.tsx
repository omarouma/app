import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Settings, Edit3, Share2, Camera, Check, X,
  MapPin, Link2, Mail, Phone, Users, Heart, Image, BadgeCheck,
  Copy, QrCode, Loader, MoreHorizontal, MessageCircle, Video,
  UserPlus, UserCheck, Ban, Flag, Star, Clock,
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendStore } from '@/store/useFriendStore';
import { buildGagaChatWebUrl, getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
import { isFirestoreAvailable, COLLECTIONS, updateDocById, subscribeToDoc } from '@/lib/firestore';
import { copyToClipboard, nativeShare } from '@/lib/share';
import { usePageTitle } from '@/hooks/useDocumentTitle';
import { toast } from 'sonner';
import type { User, FriendStatus } from '@/types';

export default function ProfilePage() {
  const { userId: paramUserId } = useParams<{ userId?: string }>();
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const {
    friends, requests, sentRequests, sendRequest, cancelRequest, acceptRequest,
    removeFriend, blockUser, unblockUser, reportUser, toggleFavorite, getFriendStatus,
  } = useFriendStore();

  const isOwnProfile = !paramUserId || paramUserId === user?.id;
  const [otherUser, setOtherUser] = useState<User | null>(null);
  const [loadingOther, setLoadingOther] = useState(false);

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

  const displayUser = isOwnProfile ? user : otherUser;

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(user?.name || '');
  const [editBio, setEditBio] = useState(user?.bio || '');
  const [editLocation, setEditLocation] = useState(user?.location || '');
  const [editWebsite, setEditWebsite] = useState(user?.website || '');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [userPostsCount, setUserPostsCount] = useState(0);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('not_friends');
  const [actionBusy, setActionBusy] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showReportSheet, setShowReportSheet] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const profileUrl = displayUser ? buildGagaChatWebUrl(displayUser.id) : '';

  const startEdit = useCallback(() => {
    setEditName(user?.name || '');
    setEditBio(user?.bio || '');
    setEditLocation(user?.location || '');
    setEditWebsite(user?.website || '');
    setEditing(true);
  }, [user]);

  const cancelEdit = useCallback(() => setEditing(false), []);

  const saveEdit = useCallback(async () => {
    if (!user?.id || !isFirestoreAvailable()) return;
    setSaving(true);
    try {
      const updates = {
        name: editName.trim(),
        bio: editBio.trim(),
        location: editLocation.trim(),
        website: editWebsite.trim(),
      };
      await updateDocById(COLLECTIONS.USERS, user.id, updates);
      setUser({ ...user, ...updates });
      setEditing(false);
      toast.success('Profile updated');
    } catch {
      toast.error('Failed to save profile');
    } finally {
      setSaving(false);
    }
  }, [user, editName, editBio, editLocation, editWebsite, setUser]);

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
      await updateDocById(COLLECTIONS.USERS, user.id, { coverImage: url });
      setUser({ ...user, coverImage: url });
      toast.success('Cover image updated');
    } catch {
      toast.error('Failed to upload cover image');
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = '';
    }
  }, [user, setUser]);

  // Load actual post count for the profile owner
  useEffect(() => {
    if (!displayUser?.id) return;
    let cancelled = false;
    const loadCount = async () => {
      try {
        const { getSupabaseSafe } = await import('@/lib/supabase');
        const supabase = getSupabaseSafe();
        if (!supabase) return;
        const { count } = await supabase
          .from('posts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', displayUser.id);
        if (!cancelled && typeof count === 'number') setUserPostsCount(count);
      } catch {
        // Non-fatal — keep count at 0 if query fails
      }
    };
    loadCount();
    return () => { cancelled = true; };
  }, [displayUser?.id]);

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
    const usedNative = await nativeShare({ title: `${displayUser?.name} on GaGa Chat`, url: profileUrl, text: 'Check out my profile on GaGa Chat' });
    if (!usedNative) {
      await handleCopyLink();
    }
    setShowShareSheet(false);
  }, [displayUser?.name, profileUrl, handleCopyLink]);

  // ── Other-user friend status (real-time) ────────────────────────────────
  useEffect(() => {
    if (isOwnProfile || !user?.id || !paramUserId) return;
    let cancelled = false;
    void (async () => {
      const status = await getFriendStatus(user.id, paramUserId);
      if (!cancelled) setFriendStatus(status);
    })();
    return () => { cancelled = true; };
  }, [isOwnProfile, user?.id, paramUserId, getFriendStatus]);

  const runAction = useCallback(async (fn: () => Promise<void>, okMsg: string, errMsg: string) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await fn();
      toast.success(okMsg);
    } catch {
      toast.error(errMsg);
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy]);

  const handleAddFriend = useCallback(() => {
    if (!user?.id || !paramUserId) return;
    void runAction(
      async () => { await sendRequest(paramUserId, user.id); setFriendStatus('request_sent'); },
      'Friend request sent', 'Failed to send friend request',
    );
  }, [user?.id, paramUserId, sendRequest, runAction]);

  const handleCancelRequest = useCallback(() => {
    if (!user?.id || !paramUserId) return;
    const req = sentRequests.find(r => r.toUserId === paramUserId);
    if (!req) { toast.error('Request not found'); return; }
    void runAction(
      async () => { await cancelRequest(req.id); setFriendStatus('not_friends'); },
      'Request cancelled', 'Failed to cancel request',
    );
  }, [user?.id, paramUserId, sentRequests, cancelRequest, runAction]);

  const handleAcceptRequest = useCallback(() => {
    if (!user?.id || !paramUserId) return;
    const req = requests.find(r => r.from === paramUserId);
    if (!req) { toast.error('Request not found'); return; }
    void runAction(
      async () => { await acceptRequest(req.id); setFriendStatus('friends'); },
      'Friend request accepted', 'Failed to accept request',
    );
  }, [user?.id, paramUserId, requests, acceptRequest, runAction]);

  const handleRemoveFriend = useCallback(() => {
    if (!user?.id || !paramUserId) return;
    void runAction(
      async () => { await removeFriend(paramUserId, user.id); setFriendStatus('not_friends'); },
      'Friend removed', 'Failed to remove friend',
    );
  }, [user?.id, paramUserId, removeFriend, runAction]);

  const handleBlock = useCallback(() => {
    if (!user?.id || !paramUserId) return;
    void runAction(
      async () => { await blockUser(paramUserId, user.id); setFriendStatus('blocked'); },
      'User blocked', 'Failed to block user',
    );
  }, [user?.id, paramUserId, blockUser, runAction]);

  const handleUnblock = useCallback(() => {
    if (!user?.id || !paramUserId) return;
    void runAction(
      async () => { await unblockUser(paramUserId, user.id); setFriendStatus('not_friends'); },
      'User unblocked', 'Failed to unblock user',
    );
  }, [user?.id, paramUserId, unblockUser, runAction]);

  const handleReport = useCallback((reason: string) => {
    if (!user?.id || !paramUserId) return;
    setShowReportSheet(false);
    void runAction(
      async () => { await reportUser({ reporterId: user.id, reportedId: paramUserId, reason }); },
      'Report submitted', 'Failed to submit report',
    );
  }, [user?.id, paramUserId, reportUser, runAction]);

  const handleToggleFavorite = useCallback(() => {
    if (!user?.id || !paramUserId) return;
    const current = (user.favorites as string[]) || [];
    void runAction(
      async () => { await toggleFavorite(paramUserId, user.id, current); },
      current.includes(paramUserId) ? 'Removed from favorites' : 'Added to favorites',
      'Failed to update favorites',
    );
  }, [user?.id, user?.favorites, paramUserId, toggleFavorite, runAction]);

  const profileCompletion = useMemo(() => {
    const fields = [
      Boolean(displayUser?.name),
      Boolean(displayUser?.bio),
      Boolean(displayUser?.avatar),
      Boolean(displayUser?.coverImage),
      Boolean(displayUser?.location),
      Boolean(displayUser?.website),
    ];
    const completed = fields.filter(Boolean).length;
    return Math.round((completed / fields.length) * 100);
  }, [displayUser]);

  const stats = [
    { label: 'Friends', value: displayUser?.friends?.length ?? (isOwnProfile ? friends.length : 0) },
    { label: 'Posts', value: userPostsCount },
    { label: 'Followers', value: displayUser?.followers?.length ?? 0 },
    { label: 'Following', value: displayUser?.following?.length ?? 0 },
  ];

  if (!displayUser) {
    return (
      <div className="min-h-[100dvh] bg-secondary flex items-center justify-center">
        {loadingOther
          ? <Loader size={28} className="animate-spin text-primary" />
          : <p className="text-muted-foreground text-sm">Profile not found</p>}
      </div>
    );
  }

  const avatarSrc = sanitizeMediaUrl(displayUser.avatar) || getDefaultAvatar(displayUser.id || displayUser.name || 'U');

  return (
    <div className="min-h-screen-safe bg-secondary">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border px-4 flex items-center justify-between" style={{ paddingTop: 'max(12px, env(safe-area-inset-top, 0px))', paddingBottom: '12px' }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-secondary transition-colors"
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
                className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-secondary transition-colors"
                aria-label="More options"
              >
                <MoreHorizontal size={20} className="text-muted-foreground" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/settings')}
                className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-secondary transition-colors"
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
        <div className="bg-card rounded-2xl shadow-sm overflow-hidden">
          {/* Cover image */}
          <div className="relative h-32 sm:h-40 w-full bg-gradient-to-r from-primary/20 to-blue-500/20">
            {sanitizeMediaUrl(displayUser.coverImage) && (
              <img
                src={sanitizeMediaUrl(displayUser.coverImage)}
                alt={`${displayUser.name}'s cover`}
                className="w-full h-full object-cover"
              />
            )}
            {isOwnProfile && (
              <>
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  className="absolute bottom-2 right-2 flex items-center gap-1.5 px-3 py-1.5 bg-black/50 backdrop-blur-sm text-white rounded-full text-xs font-medium hover:bg-black/70 transition-colors"
                  aria-label="Change cover image"
                >
                  <Camera size={14} />
                  {uploadingCover ? 'Uploading…' : (displayUser.coverImage ? 'Change' : 'Add')}
                </button>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCoverUpload}
                  aria-label="Upload cover image"
                />
              </>
            )}
            {uploadingCover && (
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <div className="w-7 h-7 border-2 border-background border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          <div className="p-5">
            <div className="flex flex-col items-center">
              {/* Avatar with stories ring + upload */}
              <div className="relative mb-3">
                <div className={`p-[3px] rounded-full ${displayUser.isPremium ? 'bg-gradient-to-tr from-[#FFD700] via-[#FF9800] to-[#FF4081]' : 'bg-gradient-to-tr from-primary to-primary/60'}`}>
                  <div className="p-[2px] bg-card rounded-full">
                    <div className="w-24 h-24 rounded-full overflow-hidden bg-secondary relative">
                      <img
                        src={avatarSrc}
                        className="w-full h-full object-cover"
                        alt={`${displayUser.name}'s avatar`}
                      />
                      {uploadingAvatar && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <div className="w-5 h-5 border-2 border-background border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {isOwnProfile && (
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute bottom-0 right-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center border-2 border-background shadow-sm hover:bg-primary/90 transition-colors"
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
                  className="text-xl font-bold text-foreground text-center bg-secondary rounded-xl px-3 py-1.5 w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-primary mb-1"
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
                    <BadgeCheck size={18} className="text-primary shrink-0" aria-label="Verified" />
                  )}
                  {displayUser.isPremium && (
                    <span className="text-[10px] bg-gradient-to-r from-[#FFD700] to-[#FF9800] text-white px-2 py-0.5 rounded-full font-bold">
                      PRO
                    </span>
                  )}
                </div>
              )}
              <p className="text-sm text-muted-foreground mb-2">@{displayUser.username || 'user'}</p>

              {/* Bio */}
              {editing ? (
                <textarea
                  value={editBio}
                  onChange={e => setEditBio(e.target.value)}
                  className="w-full max-w-xs bg-secondary rounded-xl px-3 py-2 text-sm text-foreground text-center resize-none focus:outline-none focus:ring-2 focus:ring-primary mb-2"
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
                  <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2">
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
                  <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2">
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
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Link2 size={12} /> {displayUser.website.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                </div>
              )}

              {/* Action buttons */}
              {isOwnProfile && (
                <div className="flex gap-2 mt-1">
                  {editing ? (
                    <>
                      <button
                        type="button"
                        onClick={saveEdit}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-5 py-2 bg-primary text-white rounded-full text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                        aria-label="Save profile changes"
                      >
                        <Check size={14} /> {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="flex items-center gap-1.5 px-5 py-2 bg-secondary text-foreground rounded-full text-sm font-medium hover:bg-muted transition-colors"
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
                        className="flex items-center gap-1.5 px-5 py-2 bg-secondary text-foreground rounded-full text-sm font-medium hover:bg-muted transition-colors"
                        aria-label="Edit profile"
                      >
                        <Edit3 size={14} /> Edit Profile
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate('/privacy')}
                        className="flex items-center gap-1.5 px-5 py-2 bg-secondary text-foreground rounded-full text-sm font-medium hover:bg-muted transition-colors"
                        aria-label="Privacy settings"
                      >
                        <Settings size={14} /> Privacy
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowShareSheet(true)}
                        className="flex items-center gap-1.5 px-5 py-2 bg-secondary text-foreground rounded-full text-sm font-medium hover:bg-muted transition-colors"
                        aria-label="Share profile"
                      >
                        <Share2 size={14} /> Share
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Other-user action buttons */}
              {!isOwnProfile && (
                <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                  {friendStatus === 'friends' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => navigate(`/chat/${paramUserId}`)}
                        className="flex items-center gap-1.5 px-5 py-2 bg-primary text-primary-foreground rounded-full text-sm font-medium hover:bg-primary/90 transition-colors"
                        aria-label="Message"
                      >
                        <MessageCircle size={14} /> Message
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate('/call', { state: { userId: paramUserId, mode: 'voice', isOutgoing: true } })}
                        className="flex items-center gap-1.5 px-4 py-2 bg-secondary text-foreground rounded-full text-sm font-medium hover:bg-muted transition-colors"
                        aria-label="Voice call"
                      >
                        <Phone size={14} /> Call
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate('/call', { state: { userId: paramUserId, mode: 'video', isOutgoing: true } })}
                        className="flex items-center gap-1.5 px-4 py-2 bg-secondary text-foreground rounded-full text-sm font-medium hover:bg-muted transition-colors"
                        aria-label="Video call"
                      >
                        <Video size={14} /> Video
                      </button>
                      <button
                        type="button"
                        onClick={handleToggleFavorite}
                        disabled={actionBusy}
                        className="w-9 h-9 flex items-center justify-center bg-secondary text-foreground rounded-full hover:bg-muted transition-colors disabled:opacity-50"
                        aria-label="Toggle favorite"
                      >
                        <Star size={15} className={((user?.favorites as string[]) || []).includes(paramUserId || '') ? 'text-amber-500 fill-amber-500' : ''} />
                      </button>
                    </>
                  ) : friendStatus === 'request_sent' ? (
                    <button
                      type="button"
                      onClick={handleCancelRequest}
                      disabled={actionBusy}
                      className="flex items-center gap-1.5 px-5 py-2 bg-secondary text-foreground rounded-full text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
                      aria-label="Cancel friend request"
                    >
                      <Clock size={14} /> Request Sent
                    </button>
                  ) : friendStatus === 'request_received' ? (
                    <button
                      type="button"
                      onClick={handleAcceptRequest}
                      disabled={actionBusy}
                      className="flex items-center gap-1.5 px-5 py-2 bg-primary text-primary-foreground rounded-full text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                      aria-label="Accept friend request"
                    >
                      <UserCheck size={14} /> Accept Request
                    </button>
                  ) : friendStatus === 'blocked' ? (
                    <button
                      type="button"
                      onClick={handleUnblock}
                      disabled={actionBusy}
                      className="flex items-center gap-1.5 px-5 py-2 bg-secondary text-foreground rounded-full text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
                      aria-label="Unblock user"
                    >
                      <Ban size={14} /> Unblock
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleAddFriend}
                      disabled={actionBusy}
                      className="flex items-center gap-1.5 px-5 py-2 bg-primary text-primary-foreground rounded-full text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                      aria-label="Add friend"
                    >
                      <UserPlus size={14} /> Add Friend
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowMoreMenu(true)}
                    className="w-9 h-9 flex items-center justify-center bg-secondary text-foreground rounded-full hover:bg-muted transition-colors"
                    aria-label="More actions"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="bg-card rounded-2xl shadow-sm overflow-hidden">
          <div className="grid grid-cols-4 divide-x divide-border">
            {stats.map(({ label, value }) => (
              <div key={label} className="flex flex-col items-center py-4 px-2">
                <span className="text-lg font-bold text-foreground">{value.toLocaleString()}</span>
                <span className="text-[11px] text-muted-foreground mt-0.5">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {isOwnProfile && (
          <div className="bg-card rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Profile completeness</h3>
                <p className="text-[11px] text-muted-foreground">Add a bio, photo, and links to make your profile feel complete.</p>
              </div>
              <span className="text-sm font-bold text-primary">{profileCompletion}%</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${profileCompletion}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {user?.hideOnlineStatus ? <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium text-foreground">Online status hidden</span> : <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary">Online status visible</span>}
              {user?.hideFriendList ? <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium text-foreground">Friend list hidden</span> : <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[10px] font-medium text-blue-500">Friend list visible</span>}
            </div>
          </div>
        )}

        {/* Contact info */}
        {(displayUser.email || displayUser.phone || profileUrl) && (
          <div className="bg-card rounded-2xl p-4 shadow-sm space-y-3">
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
            <div className="flex items-center gap-3 text-sm text-primary">
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

        {/* Quick actions */}
        {isOwnProfile && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Image, label: 'Posts', action: () => navigate('/timeline') },
              { icon: Users, label: 'Friends', action: () => navigate('/contacts') },
              { icon: Heart, label: 'Saved', action: () => navigate('/saved-messages') },
            ].map(({ icon: Icon, label, action }) => (
              <button
                key={label}
                type="button"
                onClick={action}
                className="bg-card rounded-2xl p-4 shadow-sm flex flex-col items-center gap-2 hover:bg-secondary transition-colors"
                aria-label={label}
              >
                <Icon size={22} className="text-primary" />
                <span className="text-xs font-medium text-foreground">{label}</span>
              </button>
            ))}
          </div>
        )}

        {/* QR Code shortcut */}
        {isOwnProfile && (
          <button
            type="button"
            onClick={() => navigate('/qr-scanner')}
            className="w-full bg-card rounded-2xl p-4 shadow-sm flex items-center gap-3 hover:bg-secondary transition-colors"
            aria-label="View my QR code"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <QrCode size={20} className="text-primary" />
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
            className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
            onClick={() => setShowShareSheet(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-card rounded-t-3xl p-6 w-full max-w-lg"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-5" />
              <h3 className="text-base font-bold text-foreground mb-4">Share Profile</h3>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl hover:bg-secondary transition-colors text-left"
                  aria-label="Share via system share sheet"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Share2 size={18} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Share via…</p>
                    <p className="text-xs text-muted-foreground">Use your device's share options</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl hover:bg-secondary transition-colors text-left"
                  aria-label="Copy profile link"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Copy size={18} className="text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Copy Link</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[220px]">{profileUrl}</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => { navigate('/qr-scanner'); setShowShareSheet(false); }}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl hover:bg-secondary transition-colors text-left"
                  aria-label="Show QR code"
                >
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
                    <QrCode size={18} className="text-purple-500" />
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
                className="w-full mt-4 py-3 bg-secondary text-foreground rounded-xl text-sm font-bold"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* More actions sheet (other users) */}
      <AnimatePresence>
        {showMoreMenu && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
            onClick={() => setShowMoreMenu(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-card rounded-t-3xl p-6 w-full max-w-lg"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-5" />
              <h3 className="text-base font-bold text-foreground mb-4">More Actions</h3>
              <div className="space-y-2">
                {friendStatus === 'friends' && (
                  <button
                    type="button"
                    onClick={() => { setShowMoreMenu(false); handleRemoveFriend(); }}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl hover:bg-secondary transition-colors text-left"
                    aria-label="Remove friend"
                  >
                    <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                      <X size={18} className="text-destructive" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Remove Friend</p>
                      <p className="text-xs text-muted-foreground">Remove from your friends list</p>
                    </div>
                  </button>
                )}
                {friendStatus === 'blocked' ? (
                  <button
                    type="button"
                    onClick={() => { setShowMoreMenu(false); handleUnblock(); }}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl hover:bg-secondary transition-colors text-left"
                    aria-label="Unblock user"
                  >
                    <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                      <Ban size={18} className="text-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Unblock User</p>
                      <p className="text-xs text-muted-foreground">Allow this user to contact you again</p>
                    </div>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setShowMoreMenu(false); handleBlock(); }}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl hover:bg-secondary transition-colors text-left"
                    aria-label="Block user"
                  >
                    <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                      <Ban size={18} className="text-destructive" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Block User</p>
                      <p className="text-xs text-muted-foreground">Stop this user from contacting you</p>
                    </div>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setShowMoreMenu(false); setShowReportSheet(true); }}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl hover:bg-secondary transition-colors text-left"
                  aria-label="Report user"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                    <Flag size={18} className="text-amber-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Report User</p>
                    <p className="text-xs text-muted-foreground">Report inappropriate behaviour</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => { setShowMoreMenu(false); setShowShareSheet(true); }}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl hover:bg-secondary transition-colors text-left"
                  aria-label="Share profile"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Share2 size={18} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Share Profile</p>
                    <p className="text-xs text-muted-foreground">Share this profile with others</p>
                  </div>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowMoreMenu(false)}
                className="w-full mt-4 py-3 bg-secondary text-foreground rounded-xl text-sm font-bold"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Report sheet */}
      <AnimatePresence>
        {showReportSheet && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
            onClick={() => setShowReportSheet(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-card rounded-t-3xl p-6 w-full max-w-lg"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-5" />
              <h3 className="text-base font-bold text-foreground mb-4">Report User</h3>
              <div className="space-y-2">
                {['Spam', 'Harassment', 'Inappropriate content', 'Impersonation', 'Other'].map(reason => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => handleReport(reason)}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl hover:bg-secondary transition-colors text-left"
                    aria-label={`Report for ${reason}`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                      <Flag size={18} className="text-amber-500" />
                    </div>
                    <p className="text-sm font-medium text-foreground">{reason}</p>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowReportSheet(false)}
                className="w-full mt-4 py-3 bg-secondary text-foreground rounded-xl text-sm font-bold"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}