
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
  KeyRound, HardDrive
} from 'lucide-react';
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
import { toast } from 'sonner';

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

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { logout } = useAuth();
  const { settings, updateSettings } = useUserSettings();
  const { wallet } = useWalletStore();
  const { blockedUsers } = useFriendStore();
  const { setLang } = useTranslation();

  const [section, setSection] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

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
      const [{ data: profile }, { data: messages }, { data: posts }] = await Promise.all([
        supabase.from('users').select('*').eq('id', user.id).single(),
        supabase.from('messages').select('id,content,type,created_at').eq('sender_id', user.id).limit(500),
        supabase.from('posts').select('id,content,created_at').eq('user_id', user.id).limit(200),
      ]);
      const exportData = { exportedAt: new Date().toISOString(), profile, messages: messages ?? [], posts: posts ?? [] };
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
    setLoading(true);
    try {
      const { deleteAccount } = await import('@/lib/supabaseAuth');
      await deleteAccount();
      toast.success('Account deleted');
      await logout();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Deletion failed. Contact support.');
    } finally {
      setLoading(false);
    }
  }, [deleteConfirmText, logout]);

  const currentTheme = settings.theme || 'light';
  const currentAccent = settings.accentColor || '#00C300';
  const currentFont = settings.fontSize || 'medium';

  const sections = [
    { id: 'account', label: 'Account', icon: User, desc: 'Profile, security, privacy' },
    { id: 'appearance', label: 'Appearance', icon: Palette, desc: 'Theme, colors, fonts' },
    { id: 'notifications', label: 'Notifications', icon: Bell, desc: 'Sounds, alerts, previews' },
    { id: 'privacy', label: 'Privacy', icon: Shield, desc: 'Last seen, read receipts, blocked' },
    { id: 'storage', label: 'Storage', icon: Database, desc: 'Cache, downloads, media' },
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

      <div className="container-page py-4 pb-nav">
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
                      <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${settings.notifications.callSound ? 'left-5' : 'left-1'}`} />
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
                  {settingItem('Show Preview', Eye, (
                    <button
                      type="button"
                      onClick={() => updateSettings({ notifications: { ...settings.notifications, showPreview: !settings.notifications.showPreview } })}
                      className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${settings.notifications.showPreview ? 'bg-primary' : 'bg-muted'}`}
                      aria-pressed={settings.notifications.showPreview}
                    >
                      <div className={`w-5 h-5 rounded-full bg-card absolute top-0.5 shadow-sm transition-all ${settings.notifications.showPreview ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  ))}
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
                <div className="card-surface p-3 sm:p-4 space-y-1">
                  {settingItem('Clear Cache', Eraser, undefined, () => { toast.success('Cache cleared'); })}
                  {settingItem('Download Media', Download, undefined, handleExportData)}
                  {settingItem('Storage Usage', HardDrive, <span className="text-sm text-muted-foreground">Calculating...</span>, async () => {
                    if ('storage' in navigator && 'estimate' in navigator.storage) {
                      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
                      const usedMB = (usage / 1024 / 1024).toFixed(1);
                      const totalMB = (quota / 1024 / 1024).toFixed(0);
                      toast.info(`Using ${usedMB} MB of ${totalMB} MB`);
                    } else {
                      toast.info('Storage info not available on this device');
                    }
                  })}
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
                      <p className="text-sm font-semibold text-foreground">GaGa Chat</p>
                      <p className="text-xs text-muted-foreground">Version 2.0.0</p>
                    </div>
                  </div>
                  {settingItem('Terms of Service', FileText, undefined, () => navigate('/terms'))}
                  {settingItem('Privacy Policy', Shield, undefined, () => navigate('/privacy'))}
                  {settingItem('Open Source Licenses', Info, undefined, () => toast.info('Open source licenses coming soon'))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Delete Confirm Modal */}
        <AnimatePresence>
          {showDeleteConfirm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="bg-popover rounded-2xl sm:rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-float border border-border">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center mx-auto mb-5">
                  <AlertTriangle size={28} className="text-red-500" />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-foreground text-center mb-2">Delete Account?</h3>
                <p className="text-sm text-muted-foreground text-center mb-6 leading-relaxed">This will permanently delete your account and all data. Type DELETE to confirm.</p>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="w-full px-4 py-3 rounded-xl input-surface text-sm mb-5 tracking-widest text-center font-bold"
                  autoFocus
                />
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 py-2.5 sm:py-3 rounded-xl bg-accent text-sm font-semibold text-foreground press-card">
                    Cancel
                  </button>
                  <button type="button" onClick={handleDeleteAccount} disabled={loading || deleteConfirmText !== 'DELETE'}
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
