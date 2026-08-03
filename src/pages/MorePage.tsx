
import { useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Settings, Bell, Shield, UserCircle, HelpCircle, LogOut,
  ChevronRight, Gift, Coins, Info, QrCode,
  Clock, BarChart3, Hash, Bookmark, Play,
  UserPlus, Calendar, Crown, ShoppingBag, Star, Ban, Search, Users,
  Radio, Trophy, Sparkles, Mic,
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useAuth } from '@/context/AuthContext';
import { useWalletStore } from '@/store/useWalletStore';
import { useUserSettings } from '@/store/useSettingsStore';
import Logo from '@/components/Logo';
import { toast } from 'sonner';

type NavItem = {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  subtitle: string;
  color: string;
  bg: string;
} & ({ to: string; action?: never } | { to?: never; action: () => void });

export default function MorePage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { logout } = useAuth();
  const { wallet } = useWalletStore();
  const [showAbout, setShowAbout] = useState(false);
  useUserSettings();

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to log out?')) {
      await logout();
      toast.success('Logged out successfully');
      navigate('/auth');
    }
  };

  const sections: Array<{ title: string; items: NavItem[] }> = [
    {
      title: 'New & Exciting',
      items: [
        { icon: Radio, label: 'Voice Rooms', subtitle: 'Join live audio conversations', to: '/voice-rooms', color: 'text-[#00C300]', bg: 'bg-[#00C300]/10' },
        { icon: Mic, label: 'Live Streams', subtitle: 'Go live or watch broadcasts', to: '/live-streams', color: 'text-[#FF3B30]', bg: 'bg-[#FF3B30]/10' },
        { icon: Trophy, label: 'Daily Challenges', subtitle: 'Complete tasks, earn rewards & XP', to: '/challenges', color: 'text-[#FF4081]', bg: 'bg-[#FF4081]/10' },
        { icon: Sparkles, label: 'GaGa AI', subtitle: 'Your AI assistant for content & ideas', to: '/ai-chat', color: 'text-[#8B5CF6]', bg: 'bg-[#8B5CF6]/10' },
      ],
    },
    {
      title: 'Social & Discover',
      items: [
        { icon: Search, label: 'Search', subtitle: 'Find people, posts, and more', to: '/search', color: 'text-[#2196F3]', bg: 'bg-[#2196F3]/10' },
        { icon: Clock, label: 'Timeline', subtitle: 'Your social feed', to: '/timeline', color: 'text-[#00C300]', bg: 'bg-[#00C300]/10' },
        { icon: Play, label: 'Reels', subtitle: 'Short videos', to: '/reels', color: 'text-[#FF4081]', bg: 'bg-[#FF4081]/10' },
        { icon: Calendar, label: 'Events', subtitle: 'Discover events near you', to: '/events', color: 'text-[#FF9800]', bg: 'bg-[#FF9800]/10' },
        { icon: ShoppingBag, label: 'Marketplace', subtitle: 'Buy & sell items', to: '/marketplace', color: 'text-[#4CAF50]', bg: 'bg-[#4CAF50]/10' },
        { icon: Hash, label: 'Hashtags', subtitle: 'Trending topics', to: '/hashtags', color: 'text-[#00BCD4]', bg: 'bg-[#00BCD4]/10' },
        { icon: Bookmark, label: 'Bookmarks', subtitle: 'Saved posts & collections', to: '/bookmarks', color: 'text-[#FFD700]', bg: 'bg-[#FFD700]/10' },
        { icon: Users, label: 'Broadcast Lists', subtitle: 'Send messages to multiple contacts', to: '/broadcast-lists', color: 'text-[#9C27B0]', bg: 'bg-[#9C27B0]/10' },
      ],
    },
    {
      title: 'Creator Tools',
      items: [
        { icon: BarChart3, label: 'Analytics', subtitle: 'Track your performance', to: '/analytics', color: 'text-[#8B5CF6]', bg: 'bg-[#8B5CF6]/10' },
        { icon: Crown, label: 'Premium', subtitle: user?.isPremium ? 'Active subscription' : 'Unlock premium features', to: '/premium', color: 'text-[#FF9800]', bg: 'bg-[#FF9800]/10' },
      ],
    },
    {
      title: 'Wallet & Rewards',
      items: [
        {
          icon: Coins,
          label: 'My Wallet',
          subtitle: `${(wallet?.coins || 0).toLocaleString()} GAGA · $${(wallet?.usdBalance || wallet?.bdtBalance || 0).toFixed(2)}`,
          to: '/wallet',
          color: 'text-[#00C300]',
          bg: 'bg-[#00C300]/10',
        },
        {
          icon: Gift,
          label: 'Gaga Rewards',
          subtitle: 'Earn free Gaga Coins',
          to: '/rewards',
          color: 'text-[#FF9800]',
          bg: 'bg-[#FF9800]/10',
        },
        {
          icon: Star,
          label: 'Staking',
          subtitle: 'Earn interest in your wallet',
          to: '/wallet',
          color: 'text-[#8B5CF6]',
          bg: 'bg-[#8B5CF6]/10',
        },
      ],
    },
    {
      title: 'Account',
      items: [
        { icon: UserCircle, label: 'Profile', subtitle: 'Edit your profile', to: '/profile', color: 'text-[#2196F3]', bg: 'bg-[#2196F3]/10' },
        { icon: QrCode, label: 'My QR Code', subtitle: 'Share and scan', to: '/qr-scanner', color: 'text-[#00C300]', bg: 'bg-[#00C300]/10' },
        { icon: Bell, label: 'Notifications', subtitle: 'Notification preferences', to: '/notifications', color: 'text-[#FF3B30]', bg: 'bg-[#FF3B30]/10' },
        { icon: Shield, label: 'Security', subtitle: 'Privacy, login, and app lock', to: '/settings', color: 'text-[#8B5CF6]', bg: 'bg-[#8B5CF6]/10' },
        { icon: Bookmark, label: 'Saved Messages', subtitle: 'Your bookmarked messages', to: '/saved-messages', color: 'text-[#FFD700]', bg: 'bg-[#FFD700]/10' },
        { icon: UserPlus, label: 'Sent Requests', subtitle: 'Pending friend requests', to: '/sent-requests', color: 'text-[#00C3C3]', bg: 'bg-[#00C3C3]/10' },
        { icon: Ban, label: 'Blocked Users', subtitle: 'Manage blocked accounts', to: '/blocked-users', color: 'text-[#FF3B30]', bg: 'bg-[#FF3B30]/10' },
        ...(user?.isAdmin ? [{ icon: Shield, label: 'Admin Dashboard', subtitle: 'Moderation & reports', to: '/admin', color: 'text-[#FF9800]', bg: 'bg-[#FF9800]/10' }] : []),
      ],
    },
    {
      title: 'Settings',
      items: [
        {
          icon: Settings,
          label: 'All Settings',
          subtitle: 'Theme, language, privacy, data & more',
          to: '/settings',
          color: 'text-[#111111]',
          bg: 'bg-[#F5F5F5]',
        },
      ],
    },
    {
      title: 'About',
      items: [
        { icon: Info, label: 'About GaGa Chat', subtitle: 'Version 2.0.0', action: () => setShowAbout(true), color: 'text-[#8D8D8D]', bg: 'bg-[#F5F5F5]' },
        { icon: HelpCircle, label: 'Help Center', subtitle: 'FAQs and support', action: () => navigate('/help'), color: 'text-[#2196F3]', bg: 'bg-[#2196F3]/10' },
        { icon: Info, label: 'Privacy Policy', subtitle: 'How we protect your data', to: '/privacy', color: 'text-[#8B5CF6]', bg: 'bg-[#8B5CF6]/10' },
        { icon: Info, label: 'Terms of Service', subtitle: 'User agreement', to: '/terms', color: 'text-[#8B5CF6]', bg: 'bg-[#8B5CF6]/10' },
      ],
    },
  ];

  return (
    <div className="h-[100dvh] bg-white flex flex-col">
      {/* Profile Header */}
      <div className="shrink-0 p-5">
        <h1 className="text-2xl font-bold text-[#111111] mb-4">More</h1>
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => navigate('/profile')}
          className="w-full flex items-center gap-4 p-4 bg-[#F5F5F5] rounded-2xl active:bg-[#EBEBEB] transition-colors text-left"
        >
          <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0 border border-[#EBEBEB]">
            {user?.avatar ? (
              <img src={user.avatar} className="w-full h-full object-cover" alt="User avatar" />
            ) : (
              <Logo size={40} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[#111111] text-base font-semibold truncate">{user?.name || 'User'}</h3>
            <p className="text-[#8D8D8D] text-xs truncate">{user?.statusMessage || 'Tap to view profile'}</p>
          </div>
          <ChevronRight size={20} className="text-[#C7C7CC] shrink-0" />
        </motion.button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide pb-20">
        {sections.map((section, si) => (
          <div key={si} className="px-5 mb-4">
            <h2 className="text-[#8D8D8D] text-xs font-medium uppercase tracking-wider mb-2 px-1">
              {section.title}
            </h2>
            <div className="bg-[#F5F5F5] rounded-2xl overflow-hidden">
              {section.items.map((item, ii) => (
                <motion.button
                  key={ii}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: ii * 0.03 }}
onClick={() => {
                    if ('action' in item && item.action) item.action();
                    else if ('to' in item && item.to) navigate(item.to);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[#EBEBEB] transition-colors text-left border-b border-white/50 last:border-b-0"
                >
                  <div className={`w-9 h-9 rounded-xl ${item.bg} flex items-center justify-center shrink-0`}>
                    <item.icon size={18} className={item.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[#111111] text-sm font-medium">{item.label}</p>
                    <p className="text-[#8D8D8D] text-[11px]">{item.subtitle}</p>
                  </div>
                  <ChevronRight size={18} className="text-[#C7C7CC] shrink-0" />
                </motion.button>
              ))}
            </div>
          </div>
        ))}

        {/* Logout Button */}
        <div className="px-5 mt-2 mb-8">
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-[#FF3B30]/10 text-[#FF3B30] rounded-2xl font-medium text-sm active:bg-[#FF3B30]/20 transition-colors"
          >
            <LogOut size={18} /> Log Out
          </motion.button>
          <p className="text-center text-[#C7C7CC] text-[10px] mt-2">GaGa Chat v2.0.0 &bull; Built with care</p>
        </div>
</div>

      {/* About Dialog */}
      {showAbout && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowAbout(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-2xl p-6 max-w-sm w-full text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-16 h-16 rounded-2xl bg-[#00C300]/10 flex items-center justify-center mx-auto mb-4">
              <Logo size={48} />
            </div>
            <h3 className="text-xl font-bold text-[#111111] mb-1">GaGa Chat</h3>
            <p className="text-[#8D8D8D] text-sm mb-4">Version 2.0.0</p>
            <div className="space-y-2 text-sm text-[#8D8D8D]">
              <p>Free messaging & video calls</p>
              <p>End-to-end encryption for your privacy</p>
              <p>© 2026 GaGa Chat. All rights reserved.</p>
            </div>
            <button type="button" onClick={() => setShowAbout(false)} className="w-full mt-6 py-3 bg-[#00C300] text-white rounded-xl text-sm font-bold">
              Close
            </button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
