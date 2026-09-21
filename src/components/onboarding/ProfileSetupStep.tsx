import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Camera, Check, Loader, User as UserIcon, AtSign, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/useAuthStore';
import { validateUsername } from '@/lib/validation';
import { isUsernameAvailable } from '@/lib/supabaseAuth';
import { uploadMediaBlob } from '@/lib/storage';
import { getDefaultAvatar } from '@/lib/utils';
import { updateDocById, COLLECTIONS } from '@/lib/firestore';

export interface ProfileSetupHandle {
  /** Persist the profile. Resolves true on success. */
  save: () => Promise<boolean>;
}

interface ProfileSetupStepProps {
  /** Called whenever the form's validity changes so the parent can gate "Next". */
  onValidityChange?: (valid: boolean) => void;
}

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

const ProfileSetupStep = forwardRef<ProfileSetupHandle, ProfileSetupStepProps>(
  function ProfileSetupStep({ onValidityChange }, ref) {
    const { user, setUser } = useAuthStore();
    const [name, setName] = useState(user?.name || '');
    const [username, setUsername] = useState(user?.username || '');
    const [avatarUrl, setAvatarUrl] = useState(user?.avatar || '');
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
    const [usernameError, setUsernameError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<number | null>(null);

    const nameValid = name.trim().length >= 2;
    const usernameValid = usernameStatus === 'available';
    const formValid = nameValid && usernameValid;

    useEffect(() => {
      onValidityChange?.(formValid);
    }, [formValid, onValidityChange]);

    // Debounced username availability check
    useEffect(() => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      const raw = username.trim();
      if (!raw) {
        setUsernameStatus('idle');
        setUsernameError(null);
        return;
      }
      const check = validateUsername(raw);
      if (!check.valid) {
        setUsernameStatus('invalid');
        setUsernameError(check.error || 'Invalid username');
        return;
      }
      if (check.normalized === (user?.username || '')) {
        setUsernameStatus('available');
        setUsernameError(null);
        return;
      }
      setUsernameStatus('checking');
      setUsernameError(null);
      debounceRef.current = window.setTimeout(async () => {
        const result = await isUsernameAvailable(check.normalized, user?.id);
        if (result.available) {
          setUsernameStatus('available');
          setUsernameError(null);
        } else {
          setUsernameStatus('taken');
          setUsernameError(result.error || 'That username is already taken');
        }
      }, 450);
      return () => {
        if (debounceRef.current) window.clearTimeout(debounceRef.current);
      };
    }, [username, user?.username, user?.id]);

    const handleAvatarPick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !user?.id) return;
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be under 5 MB');
        return;
      }
      setUploading(true);
      try {
        const url = await uploadMediaBlob({ kind: 'avatars', file, mimeType: file.type, userId: user.id });
        if (url) {
          setAvatarUrl(url);
          toast.success('Photo added');
        }
      } catch {
        toast.error('Failed to upload photo');
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    }, [user?.id]);

    const save = useCallback(async (): Promise<boolean> => {
      if (!user?.id || !formValid) return false;
      setSaving(true);
      try {
        const normalized = validateUsername(username).normalized;
        const updates: Record<string, unknown> = {
          name: name.trim(),
          display_name: name.trim(),
          username: normalized,
        };
        if (avatarUrl) updates.avatar = avatarUrl;
        await updateDocById(COLLECTIONS.USERS, user.id, updates);
        setUser({
          ...user,
          name: name.trim(),
          displayName: name.trim(),
          username: normalized,
          avatar: avatarUrl || user.avatar,
        });
        return true;
      } catch {
        toast.error('Failed to save your profile');
        return false;
      } finally {
        setSaving(false);
      }
    }, [user, formValid, username, name, avatarUrl, setUser]);

    useImperativeHandle(ref, () => ({ save }), [save]);

    const avatarSrc = avatarUrl || getDefaultAvatar(user?.id || name || 'U');

    return (
      <div className="w-full max-w-sm mx-auto text-center">
        <h2 className="text-2xl font-bold text-[#111111] mb-2">Set up your profile</h2>
        <p className="text-[#8D8D8D] text-sm mb-6 leading-relaxed">
          Choose how you appear to friends. Your username is how others can find and add you.
        </p>

        {/* Avatar */}
        <div className="relative w-24 h-24 mx-auto mb-6">
          <img
            src={avatarSrc}
            alt="Profile photo"
            className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-[#00C300] text-white flex items-center justify-center shadow-lg hover:bg-[#00A300] transition-colors disabled:opacity-60"
            aria-label="Upload profile photo"
          >
            {uploading ? <Loader size={16} className="animate-spin" /> : <Camera size={16} />}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarPick}
          />
        </div>

        {/* Display name */}
        <div className="text-left mb-4">
          <label className="block text-xs font-semibold text-[#8D8D8D] mb-1.5 ml-1">Display name</label>
          <div className="flex items-center gap-2 bg-[#F5F5F5] rounded-xl px-3 py-3">
            <UserIcon size={16} className="text-[#8D8D8D] shrink-0" />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={50}
              autoComplete="name"
              className="flex-1 bg-transparent text-sm text-[#111111] focus:outline-none"
              aria-label="Display name"
            />
            {nameValid && <Check size={16} className="text-[#00C300] shrink-0" />}
          </div>
        </div>

        {/* Username */}
        <div className="text-left mb-2">
          <label className="block text-xs font-semibold text-[#8D8D8D] mb-1.5 ml-1">Username</label>
          <div className="flex items-center gap-2 bg-[#F5F5F5] rounded-xl px-3 py-3">
            <AtSign size={16} className="text-[#8D8D8D] shrink-0" />
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              maxLength={30}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 bg-transparent text-sm text-[#111111] focus:outline-none"
              aria-label="Username"
            />
            {usernameStatus === 'checking' && <Loader size={16} className="text-[#8D8D8D] animate-spin shrink-0" />}
            {usernameStatus === 'available' && <Check size={16} className="text-[#00C300] shrink-0" />}
            {(usernameStatus === 'taken' || usernameStatus === 'invalid') && <X size={16} className="text-red-500 shrink-0" />}
          </div>
          {usernameError && <p className="text-[11px] text-red-500 mt-1 ml-1">{usernameError}</p>}
          {usernameStatus === 'available' && (
            <p className="text-[11px] text-[#00C300] mt-1 ml-1">@{validateUsername(username).normalized} is available</p>
          )}
        </div>

        {saving && <p className="text-xs text-[#8D8D8D] mt-3">Saving…</p>}
      </div>
    );
  },
);

export default ProfileSetupStep;
