/* eslint-disable @typescript-eslint/no-explicit-any */
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, Lock, UserX, Users, Ban, Clock, Phone, Image, Camera } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useUserSettings } from '@/store/useSettingsStore';
import { useAuthStore } from '@/store/useAuthStore';
import { isFirestoreAvailable } from '@/lib/firestore';
import { toast } from 'sonner';

export default function PrivacyPage() {
  const navigate = useNavigate();
  const { settings, updateSettings } = useUserSettings();
  const { user, setUser } = useAuthStore();

  const readReceipts = settings.privacy.readReceipts;
  const lastSeenEnabled = settings.privacy.lastSeen !== 'nobody';
  const profileVisible = settings.privacy.profileVisibility !== 'nobody';
  const friendRequestPrivacy = (user?.friendRequestPrivacy || settings.privacy as any).whoCanSendRequests || 'everyone';
  const hideFriendList = user?.hideFriendList || false;

  const syncPrivacyToDB = async (updates: Record<string, any>) => {
    if (!isFirestoreAvailable() || !user?.id) return;
    try {
      const { updateDocById } = await import('@/lib/firestore');
      await updateDocById('users', user.id, updates);
      setUser({ ...user, ...updates });
    } catch {
      toast.error('Failed to sync privacy settings');
    }
  };

  const settingsList = [
    {
      icon: Eye,
      label: 'Read Receipts',
      desc: 'Let others see when you have read their messages',
      value: readReceipts,
      onChange: (v: boolean) => updateSettings({ privacy: { ...settings.privacy, readReceipts: v } }),
    },
    {
      icon: Clock,
      label: 'Last Seen',
      desc: 'Show when you were last online',
      value: lastSeenEnabled,
      onChange: (v: boolean) => updateSettings({ privacy: { ...settings.privacy, lastSeen: v ? 'everyone' : 'nobody' } }),
    },
    {
      icon: UserX,
      label: 'Profile Visibility',
      desc: 'Show your profile to others',
      value: profileVisible,
      onChange: (v: boolean) => updateSettings({ privacy: { ...settings.privacy, profileVisibility: v ? 'everyone' : 'nobody' } }),
    },
  ];

  return (
    <div className="min-h-[100dvh] bg-[#F5F5F5]">
      <div className="bg-white border-b border-[#EBEBEB] flex items-center gap-3 p-4">
        <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 active:bg-gray-100 rounded-full text-[#111111]">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-bold text-[#111111]">Privacy</h1>
      </div>

      <div className="mt-4 bg-white border-y border-[#EBEBEB]">
        {settingsList.map((item, idx) => (
          <div key={item.label} className={`flex items-center justify-between p-4 ${idx !== settingsList.length - 1 ? 'border-b border-[#EBEBEB]' : ''}`}>
            <div className="flex items-center gap-3">
              <item.icon size={18} className="text-[#111111]" />
              <div>
                <p className="text-[#111111] text-sm">{item.label}</p>
                <p className="text-[#8D8D8D] text-xs">{item.desc}</p>
              </div>
            </div>
            <Switch checked={item.value} onCheckedChange={item.onChange} />
          </div>
        ))}
      </div>

      {/* Friend Request Privacy */}
      <div className="mt-4 bg-white border-y border-[#EBEBEB] p-4">
        <div className="flex items-center gap-3 mb-3">
          <Users size={18} className="text-[#111111]" />
          <div>
            <p className="text-[#111111] text-sm font-medium">Who can send friend requests</p>
            <p className="text-[#8D8D8D] text-xs">Control who can add you as a friend</p>
          </div>
        </div>
        <div className="flex gap-2">
          {(['everyone', 'friends_of_friends', 'nobody'] as const).map(option => (
            <button type="button" key={option}
              onClick={() => {
                const val = option;
                syncPrivacyToDB({ friend_request_privacy: val });
                updateSettings({ privacy: { ...(settings.privacy as any), whoCanSendRequests: val } });
              }}
              className={`flex-1 py-2 rounded-lg text-xs font-medium capitalize transition-colors ${
                friendRequestPrivacy === option
                  ? 'bg-[#00C300] text-white'
                  : 'bg-[#F5F5F5] text-[#8D8D8D]'
              }`}
            >
              {option === 'friends_of_friends' ? 'Friends of Friends' : option}
            </button>
          ))}
        </div>
      </div>

      {/* Hide Friend List */}
      <div className="mt-4 bg-white border-y border-[#EBEBEB]">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Users size={18} className="text-[#111111]" />
            <div>
              <p className="text-[#111111] text-sm">Hide Friend List</p>
              <p className="text-[#8D8D8D] text-xs">Others cannot see your friends</p>
            </div>
          </div>
          <Switch
            checked={hideFriendList}
            onCheckedChange={(v) => syncPrivacyToDB({ hide_friend_list: v })}
          />
        </div>
      </div>

      {/* Online Status */}
      <div className="mt-4 bg-white border-y border-[#EBEBEB] p-4">
        <div className="flex items-center gap-3 mb-3">
          <Ban size={18} className="text-[#111111]" />
          <div>
            <p className="text-[#111111] text-sm font-medium">Online Status</p>
            <p className="text-[#8D8D8D] text-xs">Control who can see when you're online</p>
          </div>
        </div>
        <div className="flex gap-2">
          {(['everyone', 'friends', 'nobody'] as const).map(option => (
            <button type="button" key={option}
              onClick={() => {
                updateSettings({ privacy: { ...settings.privacy, onlineStatus: option } });
                syncPrivacyToDB({ hide_online_status: option === 'nobody' });
              }}
              className={`flex-1 py-2 rounded-lg text-xs font-medium capitalize transition-colors ${
                settings.privacy.onlineStatus === option
                  ? 'bg-[#00C300] text-white'
                  : 'bg-[#F5F5F5] text-[#8D8D8D]'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {/* Story Privacy */}
      <div className="mt-4 bg-white border-y border-[#EBEBEB] p-4">
        <div className="flex items-center gap-3 mb-3">
          <Camera size={18} className="text-[#111111]" />
          <div>
            <p className="text-[#111111] text-sm font-medium">Story Privacy</p>
            <p className="text-[#8D8D8D] text-xs">Who can see your stories</p>
          </div>
        </div>
        <div className="flex gap-2">
          {(['everyone', 'friends', 'close_friends'] as const).map(option => (
            <button type="button" key={option}
              onClick={() => updateSettings({ privacy: { ...(settings.privacy as any), storyPrivacy: option } })}
              className={`flex-1 py-2 rounded-lg text-xs font-medium capitalize transition-colors ${
                (settings.privacy as any).storyPrivacy === option
                  ? 'bg-[#00C300] text-white'
                  : 'bg-[#F5F5F5] text-[#8D8D8D]'
              }`}
            >
              {option === 'close_friends' ? 'Close Friends' : option}
            </button>
          ))}
        </div>
      </div>

      {/* Call Privacy */}
      <div className="mt-4 bg-white border-y border-[#EBEBEB] p-4">
        <div className="flex items-center gap-3 mb-3">
          <Phone size={18} className="text-[#111111]" />
          <div>
            <p className="text-[#111111] text-sm font-medium">Call Privacy</p>
            <p className="text-[#8D8D8D] text-xs">Who can call you</p>
          </div>
        </div>
        <div className="flex gap-2">
          {(['everyone', 'friends', 'nobody'] as const).map(option => (
            <button type="button" key={option}
              onClick={() => updateSettings({ privacy: { ...(settings.privacy as any), callPrivacy: option } })}
              className={`flex-1 py-2 rounded-lg text-xs font-medium capitalize transition-colors ${
                (settings.privacy as any).callPrivacy === option
                  ? 'bg-[#00C300] text-white'
                  : 'bg-[#F5F5F5] text-[#8D8D8D]'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {/* Profile Photo Privacy */}
      <div className="mt-4 bg-white border-y border-[#EBEBEB] p-4">
        <div className="flex items-center gap-3 mb-3">
          <Image size={18} className="text-[#111111]" />
          <div>
            <p className="text-[#111111] text-sm font-medium">Profile Photo</p>
            <p className="text-[#8D8D8D] text-xs">Who can see your profile photo</p>
          </div>
        </div>
        <div className="flex gap-2">
          {(['everyone', 'friends', 'nobody'] as const).map(option => (
            <button type="button" key={option}
              onClick={() => updateSettings({ privacy: { ...(settings.privacy as any), profilePhotoPrivacy: option } })}
              className={`flex-1 py-2 rounded-lg text-xs font-medium capitalize transition-colors ${
                (settings.privacy as any).profilePhotoPrivacy === option
                  ? 'bg-[#00C300] text-white'
                  : 'bg-[#F5F5F5] text-[#8D8D8D]'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 mx-4 bg-white border border-[#EBEBEB] rounded-2xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-[#00C300]/10 flex items-center justify-center">
            <Lock size={18} className="text-[#00C300]" />
          </div>
          <div>
            <p className="text-[#111111] text-sm font-medium">End-to-End Encryption</p>
            <p className="text-[#00C300] text-xs">Enabled</p>
          </div>
        </div>
        <p className="text-[#8D8D8D] text-xs leading-relaxed">
          Your messages are secured with end-to-end encryption. Only you and the recipient can read them. We comply with applicable jurisdiction Digital Security Act 2018.
        </p>
      </div>

      {/* Data Protection Notice */}
      <div className="mt-4 mx-4 bg-white border border-[#EBEBEB] rounded-2xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-[#2196F3]/10 flex items-center justify-center">
            <Lock size={18} className="text-[#2196F3]" />
          </div>
          <div>
            <p className="text-[#111111] text-sm font-medium">Data Protection (applicable jurisdiction)</p>
            <p className="text-[#2196F3] text-xs">Compliant</p>
          </div>
        </div>
        <p className="text-[#8D8D8D] text-xs leading-relaxed">
          Your data is stored in the Asia region (Singapore) with backups in secure locations. We comply with applicable jurisdiction Telecommunication Regulation Act 2001 and Digital Security Act 2018. You have the right to access, correct, or delete your data. Contact privacy@gagachat.app for data requests.
        </p>
      </div>
    </div>
  );
}
