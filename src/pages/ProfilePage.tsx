import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Settings, Edit3, Share2, Camera, Check, X,
  MapPin, Link2, Mail, Phone, Users, Heart, Image, BadgeCheck,
  Copy, QrCode, Loader, MoreHorizontal,
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendStore } from '@/store/useFriendStore';
import { buildGagaChatWebUrl, getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
import { isFirestoreAvailable, COLLECTIONS, updateDocById, subscribeToDoc } from '@/lib/firestore';
import { copyToClipboard, nativeShare } from '@/lib/share';
import { toast } from 'sonner';
import type { User } from '@/types';

export default function ProfilePage() {
  const { userId: paramUserId } = useParams<{ userId?: string }>();
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const { friends } = useFriendStore();

  const isOwnProfile = !paramUserId || paramUserId === user?.id;
  const [otherUser, setOtherUser] = useState<User | null>(null);
  const [loadingOther, setLoadingOther] = useState(false);

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
      <div className="min-h-[100dvh] bg-[#F5F5F5] flex items-center justify-center">
        {loadingOther
          ? <Loader size={28} className="animate-spin text-[#00C300]" />
          : <p className="text-[#8D8D8D] text-sm">Profile not found</p>}
      </div>
    );
  }

  const avatarSrc = sanitizeMediaUrl(displayUser.avatar) || getDefaultAvatar(displayUser.id || displayUser.name || 'U');

  return (
    <div className="min-h-screen-safe bg-[#F5F5F5]">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-[#EBEBEB] px-4 flex items-center justify-between" style={{ paddingTop: 'max(12px, env(safe-area-inset-top, 0px))', paddingBottom: '12px' }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-[#F5F5F5] transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft size={22} className="text-[#111111]" />
        </button>
        <h1 className="text-[17px] font-bold text-[#111111]">
          {isOwnProfile ? 'My Profile' : displayUser.name}
        </h1>
        <div className="flex items-center gap-1">
          {isOwnProfile && (
            <>
              <button
                type="button"
                onClick={() => navigate('/more')}
                className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-[#F5F5F5] transition-colors"
                aria-label="More options"
              >
                <MoreHorizontal size={20} className="text-[#8D8D8D]" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/settings')}
                className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-[#F5F5F5] transition-colors"
                aria-label="Open settings"
              >
                <Settings size={20} className="text-[#8D8D8D]" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3 pb-16">
        {/* Avatar + Name card */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* Cover image */}
          <div className="relative h-32 sm:h-40 w-full bg-gradient-to-r from-[#00C300]/20 to-[#2196F3]/20">
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
                <div className="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          <div className="p-5">
            <div className="flex flex-col items-center">
              {/* Avatar with stories ring + upload */}
              <div className="relative mb-3">
                <div className={`p-[3px] rounded-full ${displayUser.isPremium ? 'bg-gradient-to-tr from-[#FFD700] via-[#FF9800] to-[#FF4081]' : 'bg-gradient-to-tr from-[#00C300] to-[#00FF00]'}`}>
                  <div className="p-[2px] bg-white rounded-full">
                    <div className="w-24 h-24 rounded-full overflow-hidden bg-[#F5F5F5] relative">
                      <img
                        src={avatarSrc}
                        className="w-full h-full object-cover"
                        alt={`${displayUser.name}'s avatar`}
                      />
                      {uploadingAvatar && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
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
                  className="text-xl font-bold text-[#111111] text-center bg-[#F5F5F5] rounded-xl px-3 py-1.5 w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-[#00C300] mb-1"
                  placeholder="Your name"
                  aria-label="Edit name"
                  maxLength={50}
                />
              ) : (
                <div className="flex items-center gap-1.5 mb-1">
                  <h2 className="text-xl font-bold text-[#111111]">
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
                </div>
              )}
              <p className="text-sm text-[#8D8D8D] mb-2">@{displayUser.username || 'user'}</p>

              {/* Bio */}
              {editing ? (
                <textarea
                  value={editBio}
                  onChange={e => setEditBio(e.target.value)}
                  className="w-full max-w-xs bg-[#F5F5F5] rounded-xl px-3 py-2 text-sm text-[#111111] text-center resize-none focus:outline-none focus:ring-2 focus:ring-[#00C300] mb-2"
                  placeholder="Write a bio..."
                  rows={2}
                  maxLength={150}
                  aria-label="Edit bio"
                />
              ) : (
                displayUser.bio && (
                  <p className="text-sm text-[#8D8D8D] text-center max-w-xs mb-2">{displayUser.bio}</p>
                )
              )}

              {/* Location + Website (edit mode) */}
              {editing && (
                <div className="w-full max-w-xs space-y-2 mb-3">
                  <div className="flex items-center gap-2 bg-[#F5F5F5] rounded-xl px-3 py-2">
                    <MapPin size={14} className="text-[#8D8D8D] shrink-0" />
                    <input
                      value={editLocation}
                      onChange={e => setEditLocation(e.target.value)}
                      className="flex-1 bg-transparent text-sm text-[#111111] focus:outline-none"
                      placeholder="Location"
                      aria-label="Edit location"
                      maxLength={60}
                    />
                  </div>
                  <div className="flex items-center gap-2 bg-[#F5F5F5] rounded-xl px-3 py-2">
                    <Link2 size={14} className="text-[#8D8D8D] shrink-0" />
                    <input
                      value={editWebsite}
                      onChange={e => setEditWebsite(e.target.value)}
                      className="flex-1 bg-transparent text-sm text-[#111111] focus:outline-none"
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
                    <span className="flex items-center gap-1 text-xs text-[#8D8D8D]">
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

              {/* Action buttons */}
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
                        className="flex items-center gap-1.5 px-5 py-2 bg-[#F5F5F5] text-[#111111] rounded-full text-sm font-medium hover:bg-[#EBEBEB] transition-colors"
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
                        className="flex items-center gap-1.5 px-5 py-2 bg-[#F5F5F5] text-[#111111] rounded-full text-sm font-medium hover:bg-[#EBEBEB] transition-colors"
                        aria-label="Edit profile"
                      >
                        <Edit3 size={14} /> Edit Profile
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate('/privacy')}
                        className="flex items-center gap-1.5 px-5 py-2 bg-[#F5F5F5] text-[#111111] rounded-full text-sm font-medium hover:bg-[#EBEBEB] transition-colors"
                        aria-label="Privacy settings"
                      >
                        <Settings size={14} /> Privacy
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowShareSheet(true)}
                        className="flex items-center gap-1.5 px-5 py-2 bg-[#F5F5F5] text-[#111111] rounded-full text-sm font-medium hover:bg-[#EBEBEB] transition-colors"
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

        {/* Stats bar */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="grid grid-cols-4 divide-x divide-[#EBEBEB]">
            {stats.map(({ label, value }) => (
              <div key={label} className="flex flex-col items-center py-4 px-2">
                <span className="text-lg font-bold text-[#111111]">{value.toLocaleString()}</span>
                <span className="text-[11px] text-[#8D8D8D] mt-0.5">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {isOwnProfile && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <h3 className="text-sm font-semibold text-[#111111]">Profile completeness</h3>
                <p className="text-[11px] text-[#8D8D8D]">Add a bio, photo, and links to make your profile feel complete.</p>
              </div>
              <span className="text-sm font-bold text-[#00C300]">{profileCompletion}%</span>
            </div>
            <div className="h-2 bg-[#F5F5F5] rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-[#00C300] transition-all" style={{ width: `${profileCompletion}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {user?.hideOnlineStatus ? <span className="rounded-full bg-[#F5F5F5] px-2.5 py-1 text-[10px] font-medium text-[#111111]">Online status hidden</span> : <span className="rounded-full bg-[#00C300]/10 px-2.5 py-1 text-[10px] font-medium text-[#00C300]">Online status visible</span>}
              {user?.hideFriendList ? <span className="rounded-full bg-[#F5F5F5] px-2.5 py-1 text-[10px] font-medium text-[#111111]">Friend list hidden</span> : <span className="rounded-full bg-[#2196F3]/10 px-2.5 py-1 text-[10px] font-medium text-[#2196F3]">Friend list visible</span>}
            </div>
          </div>
        )}

        {/* Contact info */}
        {(displayUser.email || displayUser.phone || profileUrl) && (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <h3 className="text-sm font-semibold text-[#111111]">Contact Info</h3>
            {displayUser.email && (
              <div className="flex items-center gap-3 text-sm text-[#111111]">
                <Mail size={16} className="text-[#8D8D8D] shrink-0" aria-hidden="true" />
                <span className="truncate">{displayUser.email}</span>
              </div>
            )}
            {displayUser.phone && (
              <div className="flex items-center gap-3 text-sm text-[#111111]">
                <Phone size={16} className="text-[#8D8D8D] shrink-0" aria-hidden="true" />
                <span>{displayUser.phone}</span>
              </div>
            )}
            <div className="flex items-center gap-3 text-sm text-[#00C300]">
              <Link2 size={16} className="text-[#8D8D8D] shrink-0" aria-hidden="true" />
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
                className="bg-white rounded-2xl p-4 shadow-sm flex flex-col items-center gap-2 hover:bg-[#F5F5F5] transition-colors"
                aria-label={label}
              >
                <Icon size={22} className="text-[#00C300]" />
                <span className="text-xs font-medium text-[#111111]">{label}</span>
              </button>
            ))}
          </div>
        )}

        {/* QR Code shortcut */}
        {isOwnProfile && (
          <button
            type="button"
            onClick={() => navigate('/qr-scanner')}
            className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3 hover:bg-[#F5F5F5] transition-colors"
            aria-label="View my QR code"
          >
            <div className="w-10 h-10 rounded-xl bg-[#00C300]/10 flex items-center justify-center shrink-0">
              <QrCode size={20} className="text-[#00C300]" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-[#111111]">My QR Code</p>
              <p className="text-xs text-[#8D8D8D]">Share your profile instantly</p>
            </div>
            <ArrowLeft size={18} className="text-[#C7C7CC] rotate-180" aria-hidden="true" />
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
              className="bg-white rounded-t-3xl p-6 w-full max-w-lg"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-[#EBEBEB] rounded-full mx-auto mb-5" />
              <h3 className="text-base font-bold text-[#111111] mb-4">Share Profile</h3>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl hover:bg-[#F5F5F5] transition-colors text-left"
                  aria-label="Share via system share sheet"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#00C300]/10 flex items-center justify-center shrink-0">
                    <Share2 size={18} className="text-[#00C300]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#111111]">Share via…</p>
                    <p className="text-xs text-[#8D8D8D]">Use your device's share options</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl hover:bg-[#F5F5F5] transition-colors text-left"
                  aria-label="Copy profile link"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#2196F3]/10 flex items-center justify-center shrink-0">
                    <Copy size={18} className="text-[#2196F3]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#111111]">Copy Link</p>
                    <p className="text-xs text-[#8D8D8D] truncate max-w-[220px]">{profileUrl}</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => { navigate('/qr-scanner'); setShowShareSheet(false); }}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl hover:bg-[#F5F5F5] transition-colors text-left"
                  aria-label="Show QR code"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#8B5CF6]/10 flex items-center justify-center shrink-0">
                    <QrCode size={18} className="text-[#8B5CF6]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#111111]">Show QR Code</p>
                    <p className="text-xs text-[#8D8D8D]">Let others scan to find you</p>
                  </div>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowShareSheet(false)}
                className="w-full mt-4 py-3 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-bold"
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