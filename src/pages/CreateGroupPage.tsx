import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Users, Check, Camera, Loader } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useGroupStore } from '@/store/useGroupStore';
import { isFirestoreAvailable } from '@/lib/firestore';
import { toast } from 'sonner';

export default function CreateGroupPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { friends } = useFriendStore();
  const { createGroup } = useGroupStore();
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const toggleFriend = (id: string) => {
    setSelectedFriends(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isFirestoreAvailable()) { toast.error('Storage not available'); return; }
    setUploadingAvatar(true);
    try {
      const { uploadMediaBlob } = await import('@/lib/storage');
      const url = await uploadMediaBlob({ kind: 'avatars', file });
      setAvatarUrl(url);
    } catch {
      toast.error('Failed to upload avatar');
    }
    setUploadingAvatar(false);
  };

  const handleCreate = async () => {
    if (!groupName.trim() || !user || selectedFriends.length === 0) return;
    setCreating(true);
    const groupId = await createGroup(groupName.trim(), description, selectedFriends, user.id);
    // If avatar was uploaded, update the group record
    if (groupId && avatarUrl) {
      const { useGroupStore: gs } = await import('@/store/useGroupStore');
      await gs.getState().updateGroup(groupId, { avatar: avatarUrl });
    }
    setCreating(false);
    if (groupId) {
      navigate(`/group/${groupId}`);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#F5F5F5] flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-white border-b border-[#EBEBEB]">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 active:bg-gray-100 rounded-full text-[#111111]">
            <ArrowLeft size={24} strokeWidth={1.5} />
          </button>
          <h1 className="text-lg font-bold text-[#111111]">New Group</h1>
        </div>
        <button type="button" onClick={handleCreate}
          disabled={!groupName.trim() || selectedFriends.length === 0 || creating}
          className="text-[#00C300] font-bold text-sm disabled:text-[#8D8D8D] active:opacity-60"
        >
          {creating ? 'Creating...' : 'Create'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide pb-8">
        {/* Group Info */}
        <div className="bg-white p-4 space-y-4">
          <div className="flex items-center gap-4">
            {/* Avatar Upload */}
            <button type="button" className="w-16 h-16 rounded-full bg-[#F5F5F5] flex items-center justify-center text-[#8D8D8D] shrink-0 relative overflow-hidden"
              onClick={() => avatarInputRef.current?.click()}
            >
              {uploadingAvatar ? (
                <Loader size={20} className="animate-spin text-[#00C300]" />
              ) : avatarUrl ? (
                <img src={avatarUrl} className="w-full h-full object-cover" alt="User avatar" />
              ) : (
                <Camera size={24} strokeWidth={1.5} />
              )}
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </button>
            <div className="flex-1 space-y-3">
              <input
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder="Group Name"
                className="w-full text-[#111111] text-lg font-medium focus:outline-none placeholder:text-[#8D8D8D] border-b border-[#EBEBEB] pb-2"
              />
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-full text-[#8D8D8D] text-sm focus:outline-none placeholder:text-[#C7C7CC]"
              />
            </div>
          </div>
        </div>

        {/* Selected count */}
        <div className="px-4 py-3 flex items-center justify-between">
          <span className="text-[#8D8D8D] text-sm">Add Members</span>
          <span className="text-[#00C300] text-sm font-medium">{selectedFriends.length} selected</span>
        </div>

        {/* Friends List */}
        <div className="bg-white">
          {friends.length === 0 ? (
            <div className="text-center py-8 text-[#8D8D8D] text-sm">
              <Users size={32} className="mx-auto mb-2 opacity-50" />
              <p>No friends yet. Add friends first!</p>
            </div>
          ) : (
            friends.map((friend, i) => {
              const isSelected = selectedFriends.includes(friend.id);
              return (
                <motion.button
                  key={friend.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => toggleFriend(friend.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 active:bg-gray-50 transition-colors ${
                    i !== friends.length - 1 ? 'border-b border-[#EBEBEB]' : ''
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                    isSelected ? 'bg-[#00C300]' : 'bg-[#F5F5F5]'
                  }`}>
                    {isSelected ? (
                      <Check size={18} className="text-white" />
                    ) : friend.avatar ? (
                      <img src={friend.avatar} className="w-full h-full object-cover rounded-full" alt="User avatar" />
                    ) : (
                      <span className="text-[#8D8D8D] font-bold text-sm">{(friend.name || 'U')[0]}</span>
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-[#111111] text-sm font-medium">{friend.name || 'User'}</p>
                    <p className="text-[#8D8D8D] text-xs">@{friend.username || 'user'}</p>
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-[#00C300] flex items-center justify-center">
                      <Check size={12} className="text-white" />
                    </div>
                  )}
                </motion.button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
