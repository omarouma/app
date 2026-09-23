
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, User, Bell, Palette, Globe, Database,
  Shield, HelpCircle, Info, LogOut, Trash2, Download, AlertTriangle,
  Check, Moon, Sun, Smartphone, Eye, Lock,
  Volume2, Users, Wallet, Phone, Music,
  Mail, MoonStar, Eraser,
  FileText, Crown,
  Clock, Bug, LifeBuoy, FileQuestion, ArrowLeft,
  KeyRound, ShieldCheck, RefreshCw,
  Gauge, Fingerprint, Sparkles, Zap,
  MonitorSmartphone, Accessibility, Contrast, Vibrate, CornerDownLeft,
  Video as VideoIcon, DownloadCloud, LockKeyhole, MessageCircle, Heart
} from 'lucide-react';
import { useAppPermissions, openAppSettings, type PermissionType, type PermissionStatus } from '@/hooks/useAppPermissions';
import { useAuthStore } from '@/store/useAuthStore';
import { useAuth } from '@/context/AuthContext';
import { useUserSettings } from '@/store/useSettingsStore';
import { useWalletStore } from '@/store/useWalletStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useTranslation } from '@/hooks/useTranslation';
import type { LangCode } from '@/lib/i18n';
import type { ThemeSettings } from '@/types';
import Logo from '@/components/Logo';
import { previewSound, type SoundProfile, isVibrationSupported } from '@/lib/sounds';
import { deleteAccount, reauthenticate } from '@/lib/supabaseAuth';
import { toast } from 'sonner';

const APP_VERSION = '1.0.0';

const accentColors = [
  { name: 'GaGa Green', value: '#00C300', class: 'bg-[#00C300]' },
  { name: 'Ocean Blue', value: '#2196F3', class: 'bg-[#2196F3]' },
  { name: 'Coral Red', value: '#FF5252', class: 'bg-[#FF5252]' },
  { name: 'Royal Purple', value: '#8B5CF6', class: 'bg-[#8B5CF6]' },
  { name: 'Sunset Orange', value: '#FF9800', class: 'bg-[#FF9800]' },
  { name: 'Hot Pink', value: '#FF4081', class: 'bg-[#FF4081]' },
  { name: 'Teal', value: '#00BCD4', class: 'bg-[#00BCD4]' },
  { name: 'Slate', value: '#607D8B', class: 'bg-[#607D8B]' },
];

const soundProfiles: { code: SoundProfile; label: string; desc: string }[] = [
  { code: 'gaga', label: 'GaGa', desc: 'Modern two-tone chime' },
  { code: 'classic', label: 'Classic', desc: 'Traditional phone beeps' },
  { code: 'minimal', label: 'Minimal', desc: 'Very subtle, short tones' },
  { code: 'playful', label: 'Playful', desc: 'Higher pitched, energetic' },
];

const themes = [
  { code: 'light' as const, label: 'Light', desc: 'Clean and bright', icon: Sun },
  { code: 'dark' as const, label: 'Dark', desc: 'Easy on the eyes', icon: Moon },
  { code: 'midnight' as const, label: 'Midnight', desc: 'Deep blue tones', icon: MoonStar },
  { code: 'oled' as const, label: 'OLED', desc: 'True black for OLED', icon: Smartphone },
  { code: 'gaga' as const, label: 'GaGa', desc: 'Our signature green', icon: Crown },
];

const languages = [
  { code: 'en' as const, label: 'English', native: 'English' },
  { code: 'bn' as const, label: 'Bengali', native: 'বাংলা' },
  { code: 'es' as const, label: 'Spanish', native: 'Español' },
  { code: 'fr' as const, label: 'French', native: 'Français' },
  { code: 'ar' as const, label: 'Arabic', native: 'العربية' },
  { code: 'zh' as const, label: 'Chinese', native: '中文' },
];

const openSourceLicenses = [
  { name: 'React', license: 'MIT', url: 'https://github.com/facebook/react' },
  { name: 'Supabase JS', license: 'MIT', url: 'https://github.com/supabase/supabase-js' },
  { name: 'Vite', license: 'MIT', url: 'https://github.com/vitejs/vite' },
  { name: 'Zustand', license: 'MIT', url: 'https://github.com/pmndrs/zustand' },
  { name: 'Framer Motion', license: 'MIT', url: 'https://github.com/motiondivision/motion' },
  { name: 'Lucide React', license: 'ISC', url: 'https://github.com/lucide-icons/lucide' },
  { name: 'Tailwind CSS', license: 'MIT', url: 'https://github.com/tailwindlabs/tailwindcss' },
  { name: 'Zod', license: 'MIT', url: 'https://github.com/colinhacks/zod' },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { logout } = useAuth();
  const { settings, updateSettings } = useUserSettings();
  const { wallet } = useWalletStore();
  const { blockedUsers } = useFriendStore();
  const { setLang } = useTranslation();
  const {
    statuses, audioStatus, requesting,
    requestPermission, requestAudio, checkAll,
    permissions,
  } = useAppPermissions();

  const permissionStatusInfo: Record<PermissionStatus, { label: string; color: string; bg: string }> = {
    granted: { label: 'Allowed', color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-500/20' },
    denied: { label: 'Denied', color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-500/20' },
    prompt: { label: 'Ask', color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-500/20' },
    unsupported: { label: 'N/A', color: 'text-muted-foreground', bg: 'bg-accent' },
    unknown: { label: 'Check', color: 'text-muted-foreground', bg: 'bg-accent' },
  };

  const [section, setSection] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLicenses, setShowLicenses] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [storageUsage, setStorageUsage] = useState<{ usedMB: string; totalMB: string } | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [tempSettings, setTempSettings] = useState<Partial<ThemeSettings>>({});
  const [tempLang, setTempLang] = useState<LangCode>(settings.language as LangCode || 'en');

  useEffect(() => {
    setTempSettings({ ...settings });
  }, [settings]);

  const handleUpdate = useCallback(async (key: keyof ThemeSettings, value: unknown) => {
    const updated = { ...tempSettings, [key]: value };
    setTempSettings(updated);
    try {
      await updateSettings({ [key]: value } as Partial<ThemeSettings>);
    } catch {
      toast.error('Failed to update setting');
    }
  }, [tempSettings, updateSettings]);

  const handleLanguageChange = useCallback(async (lang: LangCode) => {
    setTempLang(lang);
    try {
      await updateSettings({ language: lang });
      setLang(lang);
    } catch {
      toast.error('Failed to change language');
    }
  }, [updateSettings, setLang]);

  const handleExportData = useCallback(async () => {
    setLoading(true);
    try {
      const { getSupabaseSafe } = await import('@/lib/supabase');
      const supabase = getSupabaseSafe();
      if (!supabase || !user?.id) throw new Error('Not authenticated');
      const [{ data: profile }, { data: messages }, { data: chats }] = await Promise.all([
        supabase.from('public_profiles').select('*').eq('id', user.id).single(),
        supabase.from('messages').select('id,content,type,created_at').eq('sender_id', user.id).limit(500),
        supabase.from('chats').select('id,type,created_at,updated_at').contains('participants', [user.id]).limit(200),
      ]);
      const exportData = { exportedAt: new Date().toISOString(), profile, messages: messages ?? [], chats: chats ?? [] };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gaga-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Your data has been exported');
    } catch {
      toast.error('Export failed');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const handleDeleteAccount = useCallback(async () => {
    if (deleteConfirmText !== 'DELETE') {
      toast.error('Please type DELETE to confirm');
      return;
    }
    if (!deletePassword) {
      toast.error('Please enter your password to confirm');
      return;
    }
    setLoading(true);
    try {
      // Security gate: re-authenticate before a destructive, irreversible action.
      const reauth = await reauthenticate(deletePassword);
      if (!reauth.success) {
        toast.error(reauth.error || 'Re-authentication failed');
        return;
      }
      await deleteAccount();
      toast.success('Account deleted');
      await logout();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Deletion failed. Contact support.');
    } finally {
      setLoading(false);
    }
  }, [deleteConfirmText, deletePassword, logout]);

  const handleClearCache = useCallback(async () => {
    setLoading(true);
    try {
      let cleared = 0;
      // 1. Clear the Cache Storage API (service-worker / fetch caches).
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
        cleared += keys.length;
      }
      // 2. Clear non-essential localStorage keys (keep auth + settings).
      const keep = ['gaga-auth', 'gaga-settings', 'supabase.auth.token'];
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && !keep.some(k => key.startsWith(k))) toRemove.push(key);
      }
      toRemove.forEach(k => localStorage.removeItem(k));
      // 3. Clear sessionStorage entirely.
      sessionStorage.clear();
      toast.success(cleared > 0 ? `Cache cleared (${cleared} cache${cleared === 1 ? '' : 's'})` : 'Cache cleared');
    } catch {
      toast.error('Failed to clear cache');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCheckStorage = useCallback(async () => {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const { usage = 0, quota = 0 } = await navigator.storage.estimate();
        setStorageUsage({
          usedMB: (usage / 1024 / 1024).toFixed(1),
          totalMB: (quota / 1024 / 1024).toFixed(0),
        });
      } else {
        toast.info('Storage info not available on this device');
      }
    } catch {
      toast.error('Unable to read storage usage');
    }
  }, []);

  useEffect(() => {
    if (section === 'storage' && !storageUsage) void handleCheckStorage();
  }, [section, storageUsage, handleCheckStorage]);

  const handleChangePassword = useCallback(async () => {
    if (!currentPassword) { toast.error('Enter your current password'); return; }
    if (newPassword.length < 6) { toast.error('New password must be at least 6 characters'); return; }
    if (newPassword !== confirmNewPassword) { toast.error('New passwords do not match'); return; }
    setLoading(true);
    try {
      const reauth = await reauthenticate(currentPassword);
      if (!reauth.success) { toast.error(reauth.error || 'Current password is incorrect'); return; }
      const { getSupabaseSafe } = await import('@/lib/supabase');
      const supabase = getSupabaseSafe();
      if (!supabase) throw new Error('Not authenticated');
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Password updated');
      setShowChangePassword(false);
      setCurrentPassword(''); setNewPassword(''); setConfirmNewPassword('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setLoading(false);
    }
  }, [currentPassword, newPassword, confirmNewPassword]);

  const currentTheme = settings.theme || 'light';
  const currentAccent = settings.accentColor || '#00C300';
  const currentFont = settings.fontSize || 'medium';

  const sections = [
    { id: 'account', label: 'Account', icon: User, desc: 'Profile, security, privacy' },
    { id: 'permissions', label: 'App Permissions', icon: ShieldCheck, desc: 'Camera, mic, notifications, location & more' },
    { id: 'appearance', label: 'Appearance', icon: Palette, desc: 'Theme, colors, fonts' },
    { id: 'notifications', label: 'Notifications', icon: Bell, desc: 'Sounds, alerts, previews' },
    { id: 'privacy', label: 'Privacy', icon: Shield, desc: 'Last seen, read receipts, blocked' },
    { id: 'security', label: 'Security', icon: LockKeyhole, desc: 'App lock, password, alerts' },
    { id: 'storage', label: 'Data & Storage', icon: Database, desc: 'Auto-download, quality, cache' },
    { id: 'accessibility', label: 'Accessibility', icon: Accessibility, desc: 'Motion, contrast, haptics' },
    { id: 'language', label: 'Language', icon: Globe, desc: 'App language and region' },
    { id: 'help', label: 'Help', icon: HelpCircle, desc: 'FAQ, support, report' },
    { id: 'about', label: 'About', icon: Info, desc: 'Version, terms, credits' },
  ];

  const settingItem = (label: string, Icon: React.ElementType, right?: React.ReactNode, onClick?: () => void, danger?: boolean) => (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 sm:py-3.5 rounded-xl transition-colors text-left press-card ${danger ? 'hover:bg-red-50 dark:hover:bg-red-500/10' : ''}`}
    >
      <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0 ${danger ? 'bg-red-100 dark:bg-red-500/20 text-red-500' : 'bg-accent text-foreground'}`}>
        {Icon && <Icon size={18} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${danger ? 'text-red-500' : 'text-foreground'}`}>{label}</p>
      </div>
      {right && <div className="flex items-center shrink-0">{right}</div>}
      {!right && onClick && <ChevronRight size={16} className="text-muted-foreground shrink-0" />}
    </button>
  );

  const toggleSwitch = (on: boolean, onToggle: () => void, label: string) => (
    <button
      type="button"
      onClick={onToggle}
      className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${on ? 'bg-primary' : 'bg-muted'}`}
      aria-pressed={on}
      aria-label={label}
    >
      <div className={`w-5 h-5 rounded-full bg-card absolute top-0.5 shadow-sm transition-all ${on ? 'left-5' : 'left-0.5'}`} />
    </button>
  );

  const segmented = <T extends string>(
    options: { value: T; label: string }[],
    current: T,
    onSelect: (v: T) => void,
  ) => (
    <div className="flex gap-1.5">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onSelect(o.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${current === o.value
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'bg-accent text-foreground hover:bg-accent/80'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-secondary/40">
      {/* Header */}
      <header className="page-header">
        <div className="w-full max-w-2xl mx-auto flex items-center gap-3">
          <button type="button" onClick={() => section ? setSection(null) : navigate(-1)} className="icon-btn w-9 h-9 -ml-2 bg-accent/50">
            <ArrowLeft size={20} className="text-foreground" />
          </button>
          <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">
            {section ? sections.find(s => s.id === section)?.label : 'Settings'}
          </h1>
        </div>
      </header>

      <div className="container-page py-4 pb-16">
        <AnimatePresence mode="wait">
          {!section ? (
            <motion.div key="main" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2 sm:space-y-3">
              {/* User Card */}
              <div className="card-surface p-4 sm:p-5 mb-4 sm:mb-6">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-accent flex items-center justify-center text-foreground font-bold text-lg sm:text-xl overflow-hidden shrink-0">
                    {user?.avatar ? (
                      <img src={user.avatar} alt={`${user.name || 'User'} avatar`} className="w-full h-full object-cover" />
                    ) : (
                      <span>{user?.name?.[0] || 'U'}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base sm:text-lg font-semibold text-foreground truncate">{user?.name || 'User'}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground truncate">{user?.username || user?.phone || ''}</p>
                  </div>
                  <button type="button" onClick={() => navigate('/profile')} className="icon-btn w-9 h-9 bg-accent/50 shrink-0">
                    <ChevronRight size={18} className="text-muted-foreground" />
                  </button>
                </div>
              </div>

              {/* Settings Sections */}
              <div className="card-surface divide-y divide-border -mx-0">
                {sections.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSection(s.id)}
                    className="w-full flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 sm:py-3.5 transition-colors text-left press-card first:rounded-t-xl last:rounded-b-xl"
                  >
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-accent flex items-center justify-center text-foreground shrink-0">
                      <s.icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{s.label}</p>
                      <p className="text-xs text-muted-foreground">{s.desc}</p>
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>

              {/* Logout */}
              <button
                type="button"
                onClick={async () => { await logout(); toast.success('Logged out'); navigate('/auth'); }}
                className="w-full flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 sm:py-3.5 rounded-xl card-surface mt-4 sm:mt-6 press-card hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-left"
              >
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-red-100 dark:bg-red-500/20 flex items-center justify-center text-red-500 shrink-0">
                  <LogOut size={18} />
                </div>
                <p className="text-sm font-medium text-red-500 flex-1">Log Out</p>
              </button>
            </motion.div>
          ) : (
            <motion.div key={section} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              {section === 'permissions' && (
                <div className="space-y-4">
                  {/* Summary card */}
                  <div className="card-surface p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">App Permissions</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Manage what GaGa can access on this device</p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => { await checkAll(); toast.success('Permissions refreshed'); }}
                        className="icon-btn w-9 h-9 bg-accent/50"
                        aria-label="Refresh permissions"
                      >
                        <RefreshCw size={16} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {permissions.map(p => {
                        const info = permissionStatusInfo[statuses[p.id] || 'unknown'];
                        return (
                          <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg bg-accent/50">
                            <span className="text-lg">{p.icon}</span>
                            <div className="min-w-0">
                              <p className="text-[11px] font-medium text-foreground truncate">{p.label}</p>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${info.bg} ${info.color}`}>{info.label}</span>
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-accent/50">
                        <span className="text-lg">🎵</span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium text-foreground truncate">Music & Audio</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${permissionStatusInfo[audioStatus || 'unknown'].bg} ${permissionStatusInfo[audioStatus || 'unknown'].color}`}>
                            {permissionStatusInfo[audioStatus || 'unknown'].label}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Individual permission rows */}
                  <div className="card-surface p-3 sm:p-4 space-y-1">
                    {permissions.map(p => (
                      <div key={p.id} className="flex items-center gap-3 px-2 py-2.5 rounded-xl">
                        <span className="text-xl shrink-0">{p.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{p.label}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{p.description}</p>
                        </div>
                        {statuses[p.id] === 'granted' ? (
                          <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-green-100 dark:bg-green-500/20 text-green-600">
                            <Check size={12} /> Allowed
                          </span>
                        ) : statuses[p.id] === 'denied' ? (
                          <button
                            type="button"
                            onClick={() => (p.openSettings ?? openAppSettings)()}
                            disabled={!!requesting[p.id]}
                            className="shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-full bg-red-500 text-white disabled:opacity-50"
                          >
                            {requesting[p.id] ? '...' : 'Open Settings'}
                          </button>
                        ) : p.isSupported() ? (
                          <button
                            type="button"
                            onClick={() => requestPermission(p.id as PermissionType)}
                            disabled={!!requesting[p.id]}
                            className="shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-full bg-primary text-primary-foreground disabled:opacity-50"
                          >
                            {requesting[p.id] ? 'Requesting…' : statuses[p.id] === 'prompt' || statuses[p.id] === 'unknown' ? 'Allow' : 'Re-request'}
                          </button>
                        ) : (
                          <span className="shrink-0 text-[11px] text-muted-foreground px-2 py-1 rounded-full bg-accent">Not supported</span>
                        )}
                      </div>
                    ))}

                    {/* Music & Audio row */}
                    <div className="flex items-center gap-3 px-2 py-2.5 rounded-xl">
                      <span className="text-xl shrink-0">🎵</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">Music & Audio</p>
                        <p className="text-[11px] text-muted-foreground truncate">Notification sounds, voice messages, and background audio</p>
                      </div>
                      {audioStatus === 'granted' ? (
                        <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-green-100 dark:bg-green-500/20 text-green-600">
                          <Check size={12} /> Allowed
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => requestAudio().then(() => toast.success('Audio unlocked'))}
                          disabled={!!requesting.__audio}
                          className="shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-full bg-primary text-primary-foreground disabled:opacity-50"
                        >
                          {requesting.__audio ? 'Unlocking…' : 'Unlock Audio'}
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground px-2 leading-relaxed">
                    💡 Tip: If a permission is denied, tap “Open Settings” to grant it from your
                    device settings. Camera and microphone are required for voice &amp; video calls.
                  </p>
                </div>
              )}

              {section === 'appearance' && (
                <div className="space-y-4 sm:space-y-5">
                  {/* Theme */}
                  <div className="card-surface p-4 sm:p-5">
                    <p className="text-sm font-semibold text-foreground mb-3 sm:mb-4">Theme</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                      {themes.map(t => (
                        <button
                          key={t.code}
                          type="button"
                          onClick={() => handleUpdate('theme', t.code)}
                          className={`flex items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-xl border-2 transition-all press-card ${currentTheme === t.code
                            ? 'border-primary bg-primary/5'
                            : 'border-transparent bg-accent hover:bg-accent/80'
                            }`}
                        >
                          <t.icon size={18} className={currentTheme === t.code ? 'text-primary' : 'text-muted-foreground shrink-0'} />
                          <div className="text-left min-w-0">
                            <p className={`text-xs sm:text-sm font-medium ${currentTheme === t.code ? 'text-primary' : 'text-foreground'}`}>{t.label}</p>
                            <p className="text-[10px] sm:text-xs text-muted-foreground">{t.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Accent Color */}
                  <div className="card-surface p-4 sm:p-5">
                    <p className="text-sm font-semibold text-foreground mb-3 sm:mb-4">Accent Color</p>
                    <div className="flex flex-wrap gap-2.5 sm:gap-3">
                      {accentColors.map(c => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => handleUpdate('accentColor', c.value)}
                          className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full ${c.class} flex items-center justify-center transition-all tap-scale ring-offset-background ${currentAccent === c.value ? 'ring-2 ring-offset-2 ring-foreground' : ''
                            }`}
                          title={c.name}
                          aria-label={`Accent color ${c.name}`}
                        >
                          {currentAccent === c.value && <Check size={16} className="text-white" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font Size */}
                  <div className="card-surface p-4 sm:p-5">
                    <p className="text-sm font-semibold text-foreground mb-3 sm:mb-4">Font Size</p>
                    <div className="flex gap-2 sm:gap-3">
                      {(['small', 'medium', 'large'] as const).map(size => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => handleUpdate('fontSize', size)}
                          className={`flex-1 py-2.5 sm:py-3 rounded-xl text-sm font-medium transition-all tap-scale ${currentFont === size
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'bg-accent text-foreground hover:bg-accent/80'
                            }`}
                        >
                          {size.charAt(0).toUpperCase() + size.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {section === 'language' && (
                <div className="card-surface p-3 sm:p-4">
                  {languages.map(l => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => handleLanguageChange(l.code)}
                      className={`w-full flex items-center gap-3 sm:gap-4 px-3 py-3 rounded-xl transition-colors text-left mb-1 press-card ${tempLang === l.code ? 'bg-primary/5' : ''
                        }`}
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${tempLang === l.code ? 'border-primary' : 'border-muted-foreground/30'
                        }`}>
                        {tempLang === l.code && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${tempLang === l.code ? 'text-primary' : 'text-foreground'}`}>{l.label}</p>
                      </div>
                      <p className="text-sm text-muted-foreground shrink-0">{l.native}</p>
                    </button>
                  ))}
                </div>
              )}

              {section === 'notifications' && (
                <div className="card-surface p-3 sm:p-4 space-y-1">
                  {settingItem('Message Notifications', Bell, (
                    <button
                      type="button"
                      onClick={() => updateSettings({ notifications: { ...settings.notifications, pushEnabled: !settings.notifications.pushEnabled } })}
                      className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${settings.notifications.pushEnabled ? 'bg-primary' : 'bg-muted'}`}
                      aria-pressed={settings.notifications.pushEnabled}
                    >
                      <div className={`w-5 h-5 rounded-full bg-card absolute top-0.5 shadow-sm transition-all ${settings.notifications.pushEnabled ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  ))}
                  {settingItem('Sound', Volume2, (
                    <button
                      type="button"
                      onClick={() => {
                        updateSettings({ notifications: { ...settings.notifications, messageSound: !settings.notifications.messageSound } });
                      }}
                      className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${settings.notifications.messageSound ? 'bg-primary' : 'bg-muted'}`}
                      aria-pressed={settings.notifications.messageSound}
                    >
                      <div className={`w-5 h-5 rounded-full bg-card absolute top-0.5 shadow-sm transition-all ${settings.notifications.messageSound ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  ))}
                  {settingItem('Call Sound', Phone, (
                    <button
                      type="button"
                      onClick={() => updateSettings({ notifications: { ...settings.notifications, callSound: !settings.notifications.callSound } })}
                      className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${settings.notifications.callSound ? 'bg-primary' : 'bg-muted'}`}
                      aria-pressed={settings.notifications.callSound}
                    >
                      <div className={`w-4 h-4 rounded-full bg-background absolute top-1 transition-all ${settings.notifications.callSound ? 'left-5' : 'left-1'}`} />
                    </button>
                  ))}
                  {isVibrationSupported() && settingItem('Vibration', Smartphone, (
                    <button
                      type="button"
                      onClick={() => updateSettings({ notifications: { ...settings.notifications, vibrationEnabled: !settings.notifications.vibrationEnabled } })}
                      className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${settings.notifications.vibrationEnabled ? 'bg-primary' : 'bg-muted'}`}
                      aria-pressed={settings.notifications.vibrationEnabled}
                    >
                      <div className={`w-5 h-5 rounded-full bg-card absolute top-0.5 shadow-sm transition-all ${settings.notifications.vibrationEnabled ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  ))}
                  {/* Sound Profile Picker */}
                  <div className="pt-2 sm:pt-3">
                    <p className="text-sm font-medium text-foreground mb-2 sm:mb-3">Notification Tone</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      {soundProfiles.map((profile) => (
                        <button
                          key={profile.code}
                          type="button"
                          onClick={() => {
                            updateSettings({ notifications: { ...settings.notifications, soundProfile: profile.code } });
                          }}
                          className={`flex-1 py-2.5 sm:py-2 px-3 rounded-xl text-xs font-medium transition-all tap-scale ${settings.notifications.soundProfile === profile.code
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'bg-accent text-foreground hover:bg-accent/80'
                            }`}
                        >
                          {profile.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-1.5 sm:mt-2">
                      {soundProfiles.find((p) => p.code === settings.notifications.soundProfile)?.desc}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        previewSound(settings.notifications.soundProfile);
                        toast.info('Playing preview...');
                      }}
                      className="mt-2 sm:mt-3 flex items-center gap-1.5 text-primary text-xs font-medium hover:underline"
                    >
                      <Music size={14} /> Preview Tone
                    </button>
                  </div>
                  {settingItem('Show Preview', Eye,
                    toggleSwitch(settings.notifications.showPreview, () => updateSettings({ notifications: { ...settings.notifications, showPreview: !settings.notifications.showPreview } }), 'Show preview'))}
                  {settingItem('Group message sound', Users,
                    toggleSwitch(settings.notifications.groupSound, () => updateSettings({ notifications: { ...settings.notifications, groupSound: !settings.notifications.groupSound } }), 'Group sound'))}
                  {settingItem('Mentions', MessageCircle,
                    toggleSwitch(settings.notifications.mentions, () => updateSettings({ notifications: { ...settings.notifications, mentions: !settings.notifications.mentions } }), 'Mentions'))}
                  {settingItem('Reactions', Heart,
                    toggleSwitch(settings.notifications.reactions, () => updateSettings({ notifications: { ...settings.notifications, reactions: !settings.notifications.reactions } }), 'Reactions'))}
                  {settingItem('Quiet hours', MoonStar,
                    toggleSwitch(settings.notifications.quietHours, () => updateSettings({ notifications: { ...settings.notifications, quietHours: !settings.notifications.quietHours } }), 'Quiet hours'))}
                  {settings.notifications.quietHours && (
                    <div className="flex items-center gap-3 px-3 sm:px-4 py-3">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-accent flex items-center justify-center text-foreground shrink-0">
                        <Clock size={18} />
                      </div>
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="time"
                          value={settings.notifications.quietHoursStart}
                          onChange={e => updateSettings({ notifications: { ...settings.notifications, quietHoursStart: e.target.value } })}
                          className="flex-1 bg-muted rounded-lg px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          aria-label="Quiet hours start"
                        />
                        <span className="text-xs text-muted-foreground">to</span>
                        <input
                          type="time"
                          value={settings.notifications.quietHoursEnd}
                          onChange={e => updateSettings({ notifications: { ...settings.notifications, quietHoursEnd: e.target.value } })}
                          className="flex-1 bg-muted rounded-lg px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          aria-label="Quiet hours end"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {section === 'privacy' && (
                <div className="card-surface p-3 sm:p-4 space-y-1">
                  {settingItem('Last Seen', Clock, undefined, () => navigate('/privacy'))}
                  {settingItem('Read Receipts', Mail, undefined, () => navigate('/privacy'))}
                  {settingItem('Blocked Users', Users, <span className="text-sm text-muted-foreground">{blockedUsers.length}</span>, () => navigate('/blocked-users'))}
                  {settingItem('Chat Lock', Lock, undefined, () => navigate('/privacy'))}
                  {settingItem('Two-Step Verification', KeyRound, undefined, () => navigate('/privacy'))}
                </div>
              )}

              {section === 'storage' && (
                <div className="space-y-4">
                  {/* Storage usage */}
                  <div className="card-surface p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Storage Usage</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {storageUsage ? `${storageUsage.usedMB} MB of ${storageUsage.totalMB} MB used` : 'Calculating…'}
                        </p>
                      </div>
                      <button type="button" onClick={handleCheckStorage} className="icon-btn w-9 h-9 bg-accent/50" aria-label="Refresh storage usage">
                        <RefreshCw size={16} />
                      </button>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: storageUsage ? `${Math.min(100, (parseFloat(storageUsage.usedMB) / Math.max(1, parseFloat(storageUsage.totalMB))) * 100)}%` : '0%' }}
                      />
                    </div>
                  </div>

                  {/* Auto-download */}
                  <div className="card-surface p-3 sm:p-4 space-y-1">
                    {settingItem('Auto-download media', DownloadCloud,
                      toggleSwitch(settings.data.autoDownloadMedia, () => handleUpdate('data', { ...settings.data, autoDownloadMedia: !settings.data.autoDownloadMedia }), 'Auto-download media'))}
                    {settingItem('Data saver', Gauge,
                      toggleSwitch(settings.data.dataSaver, () => handleUpdate('data', { ...settings.data, dataSaver: !settings.data.dataSaver }), 'Data saver'))}
                    {settingItem('Auto-play videos', VideoIcon,
                      toggleSwitch(settings.data.autoPlayVideos, () => handleUpdate('data', { ...settings.data, autoPlayVideos: !settings.data.autoPlayVideos }), 'Auto-play videos'))}
                    {settingItem('Auto-play reels', Sparkles,
                      toggleSwitch(settings.data.autoPlayReels, () => handleUpdate('data', { ...settings.data, autoPlayReels: !settings.data.autoPlayReels }), 'Auto-play reels'))}
                  </div>

                  {/* Media quality */}
                  <div className="card-surface p-4 sm:p-5">
                    <p className="text-sm font-semibold text-foreground mb-3">Media upload quality</p>
                    {segmented(
                      [
                        { value: 'auto' as const, label: 'Auto' },
                        { value: 'high' as const, label: 'High' },
                        { value: 'medium' as const, label: 'Medium' },
                        { value: 'low' as const, label: 'Low' },
                      ],
                      settings.data.mediaQuality,
                      (v) => handleUpdate('data', { ...settings.data, mediaQuality: v }),
                    )}
                  </div>

                  {/* Cache actions */}
                  <div className="card-surface p-3 sm:p-4 space-y-1">
                    {settingItem('Clear Cache', Eraser, undefined, handleClearCache)}
                    {settingItem('Download my data', Download, undefined, handleExportData)}
                  </div>
                </div>
              )}

              {section === 'accessibility' && (
                <div className="card-surface p-3 sm:p-4 space-y-1">
                  {settingItem('Reduce motion', Zap,
                    toggleSwitch(settings.accessibility.reducedMotion, () => handleUpdate('accessibility', { ...settings.accessibility, reducedMotion: !settings.accessibility.reducedMotion }), 'Reduce motion'))}
                  {settingItem('High contrast', Contrast,
                    toggleSwitch(settings.accessibility.highContrast, () => handleUpdate('accessibility', { ...settings.accessibility, highContrast: !settings.accessibility.highContrast }), 'High contrast'))}
                  {settingItem('Haptic feedback', Vibrate,
                    toggleSwitch(settings.accessibility.hapticFeedback, () => handleUpdate('accessibility', { ...settings.accessibility, hapticFeedback: !settings.accessibility.hapticFeedback }), 'Haptic feedback'))}
                  {settingItem('Enter key sends message', CornerDownLeft,
                    toggleSwitch(settings.accessibility.enterToSend, () => handleUpdate('accessibility', { ...settings.accessibility, enterToSend: !settings.accessibility.enterToSend }), 'Enter to send'))}
                </div>
              )}

              {section === 'security' && (
                <div className="space-y-4">
                  <div className="card-surface p-3 sm:p-4 space-y-1">
                    {settingItem('App lock (biometric)', Fingerprint,
                      toggleSwitch(settings.security.biometricLock, () => handleUpdate('security', { ...settings.security, biometricLock: !settings.security.biometricLock }), 'App lock'))}
                    {settingItem('Security alerts', ShieldCheck,
                      toggleSwitch(settings.security.showSecurityAlerts, () => handleUpdate('security', { ...settings.security, showSecurityAlerts: !settings.security.showSecurityAlerts }), 'Security alerts'))}
                  </div>

                  <div className="card-surface p-4 sm:p-5">
                    <p className="text-sm font-semibold text-foreground mb-3">Auto-lock after</p>
                    {segmented(
                      [
                        { value: '0' as const, label: 'Immediately' },
                        { value: '1' as const, label: '1 min' },
                        { value: '5' as const, label: '5 min' },
                        { value: '30' as const, label: '30 min' },
                      ],
                      String(settings.security.screenLockTimeout) as '0' | '1' | '5' | '30',
                      (v) => handleUpdate('security', { ...settings.security, screenLockTimeout: Number(v) }),
                    )}
                  </div>

                  <div className="card-surface p-3 sm:p-4 space-y-1">
                    {settingItem('Change password', KeyRound, undefined, () => setShowChangePassword(true))}
                    {settingItem('Two-step verification', Lock, undefined, () => navigate('/privacy'))}
                    {settingItem('Linked devices', MonitorSmartphone, undefined, () => toast.info('No other devices are linked to this account'))}
                  </div>
                </div>
              )}

              {section === 'account' && (
                <div className="card-surface p-3 sm:p-4 space-y-1">
                  {settingItem('Edit Profile', User, undefined, () => navigate('/profile'))}
                  {settingItem('Wallet', Wallet, <span className="text-sm text-muted-foreground">{wallet?.usdBalance?.toFixed(2) || '0.00'} USD</span>, () => navigate('/wallet'))}
                  {settingItem('Export Data', Download, undefined, handleExportData)}
                  {settingItem('Delete Account', Trash2, undefined, () => setShowDeleteConfirm(true), true)}
                </div>
              )}

              {section === 'help' && (
                <div className="card-surface p-3 sm:p-4 space-y-1">
                  {settingItem('FAQ', FileQuestion, undefined, () => navigate('/help'))}
                  {settingItem('Contact Support', LifeBuoy, undefined, () => navigate('/help'))}
                  {settingItem('Report a Bug', Bug, undefined, () => navigate('/help'))}
                </div>
              )}

              {section === 'about' && (
                <div className="card-surface p-3 sm:p-4 space-y-1">
                  <div className="flex items-center gap-3 sm:gap-4 px-3 py-3">
                    <Logo size={32} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">GaGa</p>
                      <p className="text-xs text-muted-foreground">Version {APP_VERSION}</p>
                    </div>
                  </div>
                  {settingItem('Terms of Service', FileText, undefined, () => navigate('/terms'))}
                  {settingItem('Privacy Policy', Shield, undefined, () => navigate('/privacy'))}
                  {settingItem('Open Source Licenses', Info, undefined, () => setShowLicenses(true))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showLicenses && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed top-0 right-0 bottom-0 left-0 z-[90] flex items-end justify-center bg-black/50 p-4 sm:items-center"
              onClick={() => setShowLicenses(false)}
            >
              <motion.div
                initial={{ y: 24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 24, opacity: 0 }}
                className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-popover shadow-float"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="open-source-licenses-title"
              >
                <div className="flex items-center justify-between border-b border-border p-4">
                  <div>
                    <h2 id="open-source-licenses-title" className="text-lg font-bold text-foreground">Open Source Licenses</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">Projects used to build GaGa.</p>
                  </div>
                  <button type="button" onClick={() => setShowLicenses(false)} className="rounded-full p-2 text-muted-foreground hover:bg-accent" aria-label="Close licenses">
                    <ArrowLeft size={18} className="rotate-[-90deg]" />
                  </button>
                </div>
                <div className="max-h-[60vh] divide-y divide-border overflow-y-auto">
                  {openSourceLicenses.map((item) => (
                    <a key={item.name} href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-accent">
                      <span className="text-sm font-medium text-foreground">{item.name}</span>
                      <span className="text-xs text-muted-foreground">{item.license}</span>
                    </a>
                  ))}
                </div>
                <div className="border-t border-border p-4">
                  <button type="button" onClick={() => setShowLicenses(false)} className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground">Done</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Change Password Modal */}
        <AnimatePresence>
          {showChangePassword && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed top-0 right-0 bottom-0 left-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowChangePassword(false)}>
              <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="bg-popover rounded-2xl sm:rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-float border border-border"
                onClick={e => e.stopPropagation()}>
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5">
                  <KeyRound size={26} className="text-primary" />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-foreground text-center mb-2">Change Password</h3>
                <p className="text-sm text-muted-foreground text-center mb-5 leading-relaxed">Enter your current password, then choose a new one (at least 6 characters).</p>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="Current password"
                  autoComplete="current-password"
                  className="w-full px-4 py-3 rounded-xl input-surface text-sm mb-3"
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="New password"
                  autoComplete="new-password"
                  className="w-full px-4 py-3 rounded-xl input-surface text-sm mb-3"
                />
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={e => setConfirmNewPassword(e.target.value)}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  className="w-full px-4 py-3 rounded-xl input-surface text-sm mb-5"
                />
                <div className="flex gap-3">
                  <button type="button" onClick={() => { setShowChangePassword(false); setCurrentPassword(''); setNewPassword(''); setConfirmNewPassword(''); }}
                    className="flex-1 py-2.5 sm:py-3 rounded-xl bg-accent text-sm font-semibold text-foreground press-card">
                    Cancel
                  </button>
                  <button type="button" onClick={handleChangePassword} disabled={loading || !currentPassword || !newPassword || !confirmNewPassword}
                    className="flex-1 py-2.5 sm:py-3 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    {loading ? 'Updating…' : 'Update'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Delete Confirm Modal */}
        <AnimatePresence>
          {showDeleteConfirm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed top-0 right-0 bottom-0 left-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="bg-popover rounded-2xl sm:rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-float border border-border">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center mx-auto mb-5">
                  <AlertTriangle size={28} className="text-red-500" />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-foreground text-center mb-2">Delete Account?</h3>
                <p className="text-sm text-muted-foreground text-center mb-6 leading-relaxed">This will permanently delete your account and all data. This action cannot be undone. Type DELETE and enter your password to confirm.</p>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="w-full px-4 py-3 rounded-xl input-surface text-sm mb-3 tracking-widest text-center font-bold"
                  autoFocus
                />
                <input
                  type="password"
                  value={deletePassword}
                  onChange={e => setDeletePassword(e.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                  className="w-full px-4 py-3 rounded-xl input-surface text-sm mb-5 text-center"
                />
                <div className="flex gap-3">
                  <button type="button" onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); setDeleteConfirmText(''); }}
                    className="flex-1 py-2.5 sm:py-3 rounded-xl bg-accent text-sm font-semibold text-foreground press-card">
                    Cancel
                  </button>
                  <button type="button" onClick={handleDeleteAccount} disabled={loading || deleteConfirmText !== 'DELETE' || !deletePassword}
                    className="flex-1 py-2.5 sm:py-3 rounded-xl bg-red-500 hover:bg-red-600 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    {loading ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}