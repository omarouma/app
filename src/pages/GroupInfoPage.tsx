import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Users, Camera, Loader, Search, X, Crown, Shield, ShieldOff,
  UserMinus, UserPlus, Link2, Copy, Trash2, Volume2, VolumeX, Check,
  LogOut, Pencil, Lock, Unlock
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useGroupStore } from '@/store/useGroupStore';
import { useFriendStore } from '@/store/useFriendStore';
import { getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
import { copyToClipboard, nativeShare } from '@/lib/share';
import { toast } from 'sonner';
import type { User } from '@/types';

export default function GroupInfoPage() {
  const navigate = useNavigate();
  const { groupId } = useParams<{ groupId: string }>();
  const { user: currentUser } = useAuthStore();
  const {
    groups, updateGroup, addParticipant, removeParticipant, promoteAdmin, demoteAdmin,
    leaveGroup, toggleGroupMute, updateGroupSettings, createInviteLink, revokeInviteLink,
  } = useGroupStore();
  const { friends } = useFriendStore();

  const group = useMemo(() => groups.find(g => g.id === groupId), [groups, groupId]);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [addSearch, setAddSearch] = useState('');
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = !!currentUser && !!group?.admins?.includes(currentUser.id);
  const isCreator = !!currentUser && group?.createdBy === currentUser.id;

  useEffect(() => {
    if (group) {
      setNameDraft(group.name || '');
      setDescDraft(group.description || '');
      setInviteCode(group.inviteCode || null);
    }
  }, [group]);

  const memberInfo = useMemo<Record<string, User>>(() => {
    const map: Record<string, User> = {};
    if (currentUser) map[currentUser.id] = currentUser as User;
    for (const f of friends) map[f.id] = f;
    return map;
  }, [currentUser, friends]);

  const members = useMemo(() => {
    if (!group) return [];
    return (group.participants || []).map((id) => {
      const info = memberInfo[id];
      return {
        id,
        name: info?.name || (id === currentUser?.id ? 'You' : 'Member'),
        username: info?.username || '',
        avatar: info?.avatar,
        isAdmin: !!group.admins?.includes(id),
        isCreator: group.createdBy === id,
      };
    });
  }, [group, memberInfo, currentUser?.id]);

  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return members;
    const q = memberSearch.toLowerCase();
    return members.filter(m => m.name.toLowerCase().includes(q) || m.username.toLowerCase().includes(q));
  }, [members, memberSearch]);

  const addableFriends = useMemo(() => {
    if (!group) return [];
    const existing = new Set(group.participants || []);
    const q = addSearch.toLowerCase();
    return friends
      .filter(f => !existing.has(f.id))
      .filter(f => !q || (f.name || '').toLowerCase().includes(q) || (f.username || '').toLowerCase().includes(q));
  }, [friends, group, addSearch]);

  if (!group) {
    return (
      <div className="min-h-[100vh] bg-muted flex items-center justify-center">
        <div className="text-center text-foreground">
          <Users size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">Group not found</p>
          <button type="button" onClick={() => navigate('/chats')} className="mt-4 text-sm underline">Go back</button>
        </div>
      </div>
    );
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    setUploadingAvatar(true);
    try {
      const { uploadMediaBlob } = await import('@/lib/storage');
      const url = await uploadMediaBlob({ kind: 'avatars', userId: currentUser.id, file, fileName: file.name, contentType: file.type });
      if (url) {
        await updateGroup(group.id, { avatar: url }, currentUser.id);
        toast.success('Group photo updated');
      }
    } catch {
      toast.error('Failed to upload photo');
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleSaveName = async () => {
    if (!nameDraft.trim() || !currentUser) return;
    setBusy(true);
    await updateGroup(group.id, { name: nameDraft.trim() }, currentUser.id);
    setBusy(false);
    setEditingName(false);
    toast.success('Group name updated');
  };

  const handleSaveDesc = async () => {
    if (!currentUser) return;
    setBusy(true);
    await updateGroup(group.id, { description: descDraft.trim() }, currentUser.id);
    setBusy(false);
    setEditingDesc(false);
    toast.success('Description updated');
  };

  const handleAddMember = async (userId: string) => {
    if (!currentUser) return;
    await addParticipant(group.id, userId, currentUser.id);
    toast.success('Member added');
  };

  const handleRemoveMember = async (userId: string) => {
    if (!currentUser) return;
    if (userId === group.createdBy) { toast.error('The group creator cannot be removed'); return; }
    await removeParticipant(group.id, userId, currentUser.id);
    toast.success('Member removed');
  };

  const handleToggleAdmin = async (userId: string, currentlyAdmin: boolean) => {
    if (!currentUser) return;
    if (currentlyAdmin) {
      if (userId === group.createdBy) { toast.error('The group creator is always an admin'); return; }
      const ok = await demoteAdmin(group.id, userId);
      if (ok) toast.success('Admin removed'); else toast.error('Cannot remove the last admin');
    } else {
      await promoteAdmin(group.id, userId);
      toast.success('Promoted to admin');
    }
  };

  const handleToggleMute = async () => {
    await toggleGroupMute(group.id, !group.isMuted);
    toast.success(group.isMuted ? 'Notifications unmuted' : 'Notifications muted');
  };

  const handleToggleSetting = async (key: 'onlyAdminsCanPost' | 'onlyAdminsCanAdd') => {
    const current = group.settings || {};
    await updateGroupSettings(group.id, { ...current, [key]: !current[key] });
  };

  const handleCreateInvite = async () => {
    const code = await createInviteLink(group.id);
    if (code) { setInviteCode(code); toast.success('Invite link created'); }
    else toast.error('Failed to create invite link');
  };

  const handleRevokeInvite = async () => {
    await revokeInviteLink(group.id);
    setInviteCode(null);
    toast.success('Invite link revoked');
  };

  const inviteUrl = inviteCode ? `https://gagachat.app/join/${inviteCode}` : '';

  const handleCopyInvite = async () => {
    const ok = await copyToClipboard(inviteUrl);
    if (ok) toast.success('Invite link copied'); else toast.error('Unable to copy');
  };

  const handleShareInvite = async () => {
    const ok = await nativeShare({ title: `Join ${group.name}`, text: `Join my group "${group.name}" on GaGa`, url: inviteUrl });
    if (!ok) handleCopyInvite();
  };

  const handleLeave = async () => {
    if (!currentUser) return;
    await leaveGroup(group.id, currentUser.id);
    toast.success('You left the group');
    navigate('/chats');
  };

  return (
    <div className="min-h-[100vh] bg-muted flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 bg-background border-b border-border">
        <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 active:bg-muted rounded-full text-foreground">
          <ArrowLeft size={24} strokeWidth={1.5} />
        </button>
        <h1 className="text-lg font-bold text-foreground">Group Info</h1>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide pb-8">
        {/* Group identity */}
        <div className="bg-background p-4 flex flex-col items-center gap-3">
          <button
            type="button"
            disabled={!isAdmin}
            onClick={() => isAdmin && avatarInputRef.current?.click()}
            className="w-24 h-24 rounded-full bg-[#00C300]/10 flex items-center justify-center overflow-hidden relative active:opacity-80 disabled:opacity-100"
          >
            {uploadingAvatar ? (
              <Loader size={28} className="animate-spin text-[#00C300]" />
            ) : group.avatar ? (
              <img src={sanitizeMediaUrl(group.avatar)} loading="lazy" decoding="async" className="w-full h-full object-cover" alt={group.name} />
            ) : (
              <Users size={36} className="text-[#00C300]" />
            )}
            {isAdmin && (
              <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#00C300] flex items-center justify-center text-white border-2 border-white">
                <Camera size={16} />
              </span>
            )}
          </button>
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />

          {editingName ? (
            <div className="flex items-center gap-2 w-full max-w-xs">
              <input
                autoFocus
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                className="flex-1 text-center text-lg font-bold text-foreground border-b border-[#00C300] focus:outline-none pb-1"
              />
              <button type="button" onClick={handleSaveName} disabled={busy} className="text-[#00C300]"><Check size={20} /></button>
              <button type="button" onClick={() => { setEditingName(false); setNameDraft(group.name || ''); }} className="text-muted-foreground"><X size={20} /></button>
            </div>
          ) : (
            <button type="button" disabled={!isAdmin} onClick={() => isAdmin && setEditingName(true)} className="flex items-center gap-2">
              <span className="text-lg font-bold text-foreground">{group.name}</span>
              {isAdmin && <Pencil size={14} className="text-muted-foreground" />}
            </button>
          )}
          <p className="text-xs text-muted-foreground">{members.length} members</p>
        </div>

        {/* Description */}
        <div className="bg-background mt-2 px-4 py-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</span>
            {isAdmin && !editingDesc && (
              <button type="button" onClick={() => setEditingDesc(true)} className="text-[#00C300] text-xs font-medium">Edit</button>
            )}
          </div>
          {editingDesc ? (
            <div className="flex items-start gap-2">
              <textarea
                autoFocus
                value={descDraft}
                onChange={e => setDescDraft(e.target.value)}
                rows={2}
                placeholder="Add a group description"
                className="flex-1 text-sm text-foreground bg-muted rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-[#00C300] resize-none"
              />
              <button type="button" onClick={handleSaveDesc} disabled={busy} className="text-[#00C300] mt-1"><Check size={20} /></button>
              <button type="button" onClick={() => { setEditingDesc(false); setDescDraft(group.description || ''); }} className="text-muted-foreground mt-1"><X size={20} /></button>
            </div>
          ) : (
            <p className="text-sm text-foreground">{group.description || <span className="text-muted-foreground">No description</span>}</p>
          )}
        </div>

        {/* Quick actions */}
        <div className="bg-background mt-2 divide-y divide-border">
          <button type="button" onClick={handleToggleMute} className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-muted">
            {group.isMuted ? <VolumeX size={20} className="text-muted-foreground" /> : <Volume2 size={20} className="text-muted-foreground" />}
            <span className="flex-1 text-left text-sm text-foreground">{group.isMuted ? 'Unmute notifications' : 'Mute notifications'}</span>
          </button>
          <button type="button" onClick={() => setShowInviteModal(true)} className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-muted">
            <Link2 size={20} className="text-muted-foreground" />
            <span className="flex-1 text-left text-sm text-foreground">Invite via link</span>
          </button>
        </div>

        {/* Admin controls */}
        {isAdmin && (
          <div className="bg-background mt-2">
            <div className="px-4 pt-3 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Admin Controls</div>
            <button type="button" onClick={() => handleToggleSetting('onlyAdminsCanPost')} className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-muted">
              {group.settings?.onlyAdminsCanPost ? <Lock size={20} className="text-[#00C300]" /> : <Unlock size={20} className="text-muted-foreground" />}
              <span className="flex-1 text-left text-sm text-foreground">Only admins can send messages</span>
              <span className={`w-11 h-6 rounded-full transition-colors relative ${group.settings?.onlyAdminsCanPost ? 'bg-[#00C300]' : 'bg-[#E5E5EA]'}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-background shadow transition-all ${group.settings?.onlyAdminsCanPost ? 'left-[22px]' : 'left-0.5'}`} />
              </span>
            </button>
            <button type="button" onClick={() => handleToggleSetting('onlyAdminsCanAdd')} className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-muted border-t border-border">
              {group.settings?.onlyAdminsCanAdd ? <Lock size={20} className="text-[#00C300]" /> : <Unlock size={20} className="text-muted-foreground" />}
              <span className="flex-1 text-left text-sm text-foreground">Only admins can add members</span>
              <span className={`w-11 h-6 rounded-full transition-colors relative ${group.settings?.onlyAdminsCanAdd ? 'bg-[#00C300]' : 'bg-[#E5E5EA]'}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-background shadow transition-all ${group.settings?.onlyAdminsCanAdd ? 'left-[22px]' : 'left-0.5'}`} />
              </span>
            </button>
          </div>
        )}

        {/* Members */}
        <div className="bg-background mt-2">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{members.length} Members</span>
            {isAdmin && (
              <button type="button" onClick={() => setShowAddMembers(true)} className="flex items-center gap-1 text-[#00C300] text-sm font-medium">
                <UserPlus size={16} /> Add
              </button>
            )}
          </div>
          <div className="px-4 pb-2">
            <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
              <Search size={16} className="text-muted-foreground" />
              <input
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                placeholder="Search members"
                className="flex-1 bg-transparent text-sm text-foreground focus:outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
          {filteredMembers.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3 border-t border-border">
              <img
                src={sanitizeMediaUrl(m.avatar) || getDefaultAvatar(m.id)}
                loading="lazy" decoding="async" className="w-10 h-10 rounded-full object-cover shrink-0"
                alt={m.name}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                  {m.name}
                  {m.isCreator && <Crown size={13} className="text-[#FFB300]" />}
                  {m.isAdmin && !m.isCreator && <Shield size={13} className="text-[#00C300]" />}
                </p>
                {m.username && <p className="text-xs text-muted-foreground truncate">@{m.username}</p>}
              </div>
              {isAdmin && m.id !== currentUser?.id && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleAdmin(m.id, m.isAdmin)}
                    className="p-2 rounded-full hover:bg-muted text-muted-foreground"
                    title={m.isAdmin ? 'Dismiss as admin' : 'Make admin'}
                  >
                    {m.isAdmin ? <ShieldOff size={18} /> : <Shield size={18} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveMember(m.id)}
                    className="p-2 rounded-full hover:bg-red-50 text-[#FF3B30]"
                    title="Remove from group"
                  >
                    <UserMinus size={18} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {filteredMembers.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No members match your search.</p>
          )}
        </div>

        {/* Danger zone */}
        <div className="bg-background mt-2">
          <button type="button" onClick={() => setShowLeaveConfirm(true)} className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-muted text-[#FF3B30]">
            <LogOut size={20} />
            <span className="text-sm font-medium">Leave group</span>
          </button>
        </div>
      </div>

      {/* Add members sheet */}
      <AnimatePresence>
        {showAddMembers && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed top-0 right-0 bottom-0 left-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
            onClick={() => setShowAddMembers(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="w-full sm:max-w-md bg-background rounded-t-2xl sm:rounded-2xl max-h-[80vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="text-base font-bold text-foreground">Add Members</h3>
                <button type="button" onClick={() => setShowAddMembers(false)} className="p-1 rounded-full hover:bg-muted text-muted-foreground"><X size={20} /></button>
              </div>
              <div className="px-4 py-2">
                <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
                  <Search size={16} className="text-muted-foreground" />
                  <input
                    value={addSearch}
                    onChange={e => setAddSearch(e.target.value)}
                    placeholder="Search friends"
                    className="flex-1 bg-transparent text-sm text-foreground focus:outline-none placeholder:text-muted-foreground"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {addableFriends.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">No friends available to add.</p>
                ) : addableFriends.map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => handleAddMember(f.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 active:bg-muted border-b border-border"
                  >
                    <img src={sanitizeMediaUrl(f.avatar) || getDefaultAvatar(f.id)} className="w-10 h-10 rounded-full object-cover" alt={f.name} />
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{f.name}</p>
                      {f.username && <p className="text-xs text-muted-foreground truncate">@{f.username}</p>}
                    </div>
                    <UserPlus size={18} className="text-[#00C300]" />
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Invite link modal */}
      <AnimatePresence>
        {showInviteModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed top-0 right-0 bottom-0 left-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setShowInviteModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-background rounded-2xl p-5"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-base font-bold text-foreground mb-1">Invite via link</h3>
              <p className="text-xs text-muted-foreground mb-4">Anyone with this link can join the group.</p>
              {inviteCode ? (
                <>
                  <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2.5 mb-3">
                    <Link2 size={16} className="text-muted-foreground shrink-0" />
                    <span className="flex-1 text-xs text-foreground truncate">{inviteUrl}</span>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={handleCopyInvite} className="flex-1 flex items-center justify-center gap-2 bg-[#00C300] text-white rounded-xl py-2.5 text-sm font-medium">
                      <Copy size={16} /> Copy
                    </button>
                    <button type="button" onClick={handleShareInvite} className="flex-1 flex items-center justify-center gap-2 bg-muted text-foreground rounded-xl py-2.5 text-sm font-medium">
                      Share
                    </button>
                  </div>
                  {isAdmin && (
                    <button type="button" onClick={handleRevokeInvite} className="w-full mt-3 flex items-center justify-center gap-2 text-[#FF3B30] text-sm py-2">
                      <Trash2 size={16} /> Revoke link
                    </button>
                  )}
                </>
              ) : (
                <button type="button" onClick={handleCreateInvite} className="w-full bg-[#00C300] text-white rounded-xl py-2.5 text-sm font-medium">
                  Create invite link
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Leave confirm */}
      <AnimatePresence>
        {showLeaveConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed top-0 right-0 bottom-0 left-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setShowLeaveConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-background rounded-2xl p-5"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-base font-bold text-foreground mb-1">Leave group?</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {isCreator && members.length > 1
                  ? 'You are the creator. Admin rights will be transferred to another member.'
                  : 'You will no longer receive messages from this group.'}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowLeaveConfirm(false)} className="flex-1 bg-muted text-foreground rounded-xl py-2.5 text-sm font-medium">Cancel</button>
                <button type="button" onClick={handleLeave} className="flex-1 bg-[#FF3B30] text-white rounded-xl py-2.5 text-sm font-medium">Leave</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
