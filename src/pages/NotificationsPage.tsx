import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Bell, Trash2, Check, MessageCircle, Phone, Heart,
  UserPlus, AtSign, Users, CheckCheck, Filter, X, ChevronRight, BellRing,
  Wallet, UserMinus, Ban, Settings, VolumeX, Volume2
} from 'lucide-react';
import { useNotificationStore } from '@/store/useNotificationStore';
import { useAuthStore } from '@/store/useAuthStore';
import { usePageTitle } from '@/hooks/useDocumentTitle';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { formatTime } from '@/lib/timeUtils';
import { toast } from 'sonner';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import { safeGetJsonStorageItem, safeSetStorageItem } from '@/lib/safeStorage';

const iconMap: Record<string, typeof MessageCircle> = {
  message: MessageCircle,
  call: Phone,
  reaction: Heart,
  mention: AtSign,
  group_invite: Users,
  friend_request: UserPlus,
  money_received: Wallet,
  group_call: Phone,
  post_like: Heart,
  comment: MessageCircle,
  friend_removed: UserMinus,
  blocked_interaction: Ban,
};

const iconColors: Record<string, string> = {
  message: 'bg-[#00C300]/10 text-[#00C300]',
  call: 'bg-[#2196F3]/10 text-[#2196F3]',
  reaction: 'bg-[#FF3B30]/10 text-[#FF3B30]',
  mention: 'bg-[#8B5CF6]/10 text-[#8B5CF6]',
  group_invite: 'bg-[#FF9800]/10 text-[#FF9800]',
  friend_request: 'bg-[#00C3C3]/10 text-[#00C3C3]',
  money_received: 'bg-[#00C300]/10 text-[#00C300]',
  group_call: 'bg-[#2196F3]/10 text-[#2196F3]',
  post_like: 'bg-[#FF3B30]/10 text-[#FF3B30]',
  comment: 'bg-[#8B5CF6]/10 text-[#8B5CF6]',
  friend_removed: 'bg-[#FF9800]/10 text-[#FF9800]',
  blocked_interaction: 'bg-[#FF3B30]/10 text-[#FF3B30]',
};

const typeLabels: Record<string, string> = {
  message: 'Messages',
  call: 'Calls',
  reaction: 'Reactions',
  mention: 'Mentions',
  group_invite: 'Groups',
  friend_request: 'Friends',
  money_received: 'Money',
  group_call: 'Group Calls',
  post_like: 'Likes',
  comment: 'Comments',
  friend_removed: 'Unfriended',
  blocked_interaction: 'Security',
};

function toDate(v: Date | string | number): Date {
  if (v instanceof Date) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

function isToday(date: Date) {
  const d = toDate(date);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function isYesterday(date: Date) {
  const d = toDate(date);
  const now = new Date();
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  return d.toDateString() === yest.toDateString();
}

function isThisWeek(date: Date) {
  const d = toDate(date);
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  return d >= weekAgo && !isToday(date) && !isYesterday(date);
}

export default function NotificationsPage() {
  usePageTitle('Notifications');

  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { notifications, markRead, markAllRead, deleteNotification, subscribe, loading } = useNotificationStore();
  const [filterType, setFilterType] = useState<string | 'all'>('all');
  const [showFilter, setShowFilter] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const changeFilter = (type: string | 'all') => { setFilterType(type); setSelectedIds([]); };
  const [selectMode, setSelectMode] = useState(false);
  const { requestPermission, isSupported } = usePushNotifications();

  const [showSettings, setShowSettings] = useState(false);
  const [mutedTypes, setMutedTypes] = useState<string[]>(() => safeGetJsonStorageItem<string[]>('gaga-muted-notif-types', []));

  const toggleMuteType = (type: string) => {
    setMutedTypes(prev => {
      const next = prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type];
      safeSetStorageItem('gaga-muted-notif-types', JSON.stringify(next));
      return next;
    });
  };

  const isMuted = (type: string) => mutedTypes.includes(type);

  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribe(user.id);
    return () => { if (typeof unsub === 'function') unsub(); };
  }, [user?.id, subscribe]);

  const filtered = useMemo(() => {
    let list = [...notifications];
    if (filterType !== 'all') list = list.filter(n => n.type === filterType);
    if (mutedTypes.length > 0) list = list.filter(n => !mutedTypes.includes(n.type));
    return list;
  }, [notifications, filterType, mutedTypes]);

  const grouped = useMemo(() => {
    const today: typeof filtered = [];
    const yesterday: typeof filtered = [];
    const thisWeek: typeof filtered = [];
    const earlier: typeof filtered = [];
    for (const n of filtered) {
      const d = new Date(n.timestamp);
      if (isToday(d)) today.push(n);
      else if (isYesterday(d)) yesterday.push(n);
      else if (isThisWeek(d)) thisWeek.push(n);
      else earlier.push(n);
    }
    return { today, yesterday, thisWeek, earlier };
  }, [filtered]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const handleDeleteSelected = async () => {
    await Promise.all(selectedIds.map(id => deleteNotification(id)));
    setSelectedIds([]);
    setSelectMode(false);
    toast.success('Notifications deleted');
  };

  const handleMarkSelectedRead = () => {
    selectedIds.forEach(id => markRead(id));
    setSelectedIds([]);
    setSelectMode(false);
  };

  const renderGroup = (title: string, items: typeof filtered, showDivider: boolean) => {
    if (items.length === 0) return null;
    return (
      <div className={showDivider ? 'border-t border-[#EBEBEB]' : ''}>
        <div className="px-4 py-2 bg-[#F5F5F5]">
          <p className="text-[#8D8D8D] text-xs font-medium uppercase tracking-wider">{title}</p>
        </div>
        {items.map((notif, i) => {
          const Icon = iconMap[notif.type] || Bell;
          const colorClass = iconColors[notif.type] || 'bg-[#F5F5F5] text-[#8D8D8D]';
          const isSelected = selectedIds.includes(notif.id);
          return (
            <motion.div
              key={notif.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => {
                if (selectMode) {
                  toggleSelect(notif.id);
                } else {
                  markRead(notif.id);
                  if (notif.data?.chatId) navigate(`/chat/${notif.data.chatId}`);
                  else if (notif.data?.groupId) navigate(`/group/${notif.data.groupId}`);
                  else if (notif.data?.userId) navigate(`/profile/${notif.data.userId}`);
                  else if (notif.data?.fromUserId) navigate(`/profile/${notif.data.fromUserId}`);
                  else if (notif.type === 'friend_request') navigate('/add-friends');
                }
              }}
              className={`flex items-start gap-3 p-4 active:bg-gray-50 transition-colors cursor-pointer relative ${!notif.read ? 'bg-[#00C300]/5' : 'bg-white'
                } ${isSelected ? 'bg-[#00C300]/10' : ''}`}
            >
              {selectMode && (
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-2 ${isSelected ? 'bg-[#00C300] border-[#00C300]' : 'border-[#C7C7CC]'
                  }`}>
                  {isSelected && <Check size={12} className="text-white" />}
                </div>
              )}
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${colorClass}`}>
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[#111111] text-sm font-medium">{notif.title}</p>
                <p className="text-[#8D8D8D] text-xs mt-0.5">{notif.body}</p>
                <p className="text-[#C7C7CC] text-[10px] mt-1">{formatTime(notif.timestamp)}</p>
              </div>
              {!notif.read && !selectMode && <div className="w-2 h-2 rounded-full bg-[#00C300] shrink-0 mt-2" />}
              {!selectMode && (
                <ChevronRight size={16} className="text-[#C7C7CC] shrink-0 mt-2" />
              )}
            </motion.div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen-safe bg-[#F5F5F5]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-[#EBEBEB]">
        <div className="flex items-center justify-between px-4 pb-4" style={{ paddingTop: 'max(16px, env(safe-area-inset-top, 0px))' }}>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate(-1)} className="w-11 h-11 flex items-center justify-center text-[#111111] hover:text-[#8D8D8D] -ml-2">
              <ArrowLeft size={22} />
            </button>
            <div>
              <h1 className="text-lg font-bold text-[#111111]">Notifications</h1>
              {unreadCount > 0 && <p className="text-[#00C300] text-xs font-medium">{unreadCount} unread</p>}
            </div>
          </div>
          <div className="flex gap-2">
            {notifications.length > 0 && (
              <>
                <button type="button" onClick={() => setShowSettings(true)}
                  className="w-11 h-11 flex items-center justify-center rounded-full text-[#8D8D8D] hover:text-[#111111] transition-colors"
                >
                  <Settings size={18} />
                </button>
                <button type="button" onClick={() => { setSelectMode(s => !s); setSelectedIds([]); }}
                  className={`text-xs font-medium px-3 py-2 rounded-full transition-colors min-h-[36px] ${selectMode ? 'bg-[#00C300] text-white' : 'text-[#00C300]'
                    }`}
                >
                  {selectMode ? 'Done' : 'Select'}
                </button>
                <button type="button" onClick={() => setShowFilter(!showFilter)}
                  className={`w-11 h-11 flex items-center justify-center rounded-full transition-colors ${showFilter ? 'bg-[#00C300]/10 text-[#00C300]' : 'text-[#8D8D8D]'}`}
                >
                  <Filter size={18} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Push Notification Permission Banner */}
        {isSupported && typeof Notification !== 'undefined' && Notification.permission === 'default' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#00C300]/10 border-b border-[#00C300]/20 px-4 py-3 flex items-center gap-3"
          >
            <BellRing size={18} className="text-[#00C300] shrink-0" />
            <div className="flex-1">
              <p className="text-[#111111] text-sm font-medium">Enable push notifications</p>
              <p className="text-[#8D8D8D] text-xs">Get notified about messages and calls</p>
            </div>
            <button type="button" onClick={requestPermission}
              className="px-3 py-1.5 bg-[#00C300] text-white text-xs rounded-full font-medium active:bg-[#00A300] transition-colors"
            >
              Enable
            </button>
          </motion.div>
        )}

        {/* Filter Bar */}
        <AnimatePresence>
          {showFilter && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-[#EBEBEB]"
            >
              <div className="flex gap-2 p-3 overflow-x-auto scrollbar-hide">
                <button type="button" onClick={() => changeFilter('all')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${filterType === 'all' ? 'bg-[#00C300] text-white' : 'bg-[#F5F5F5] text-[#8D8D8D]'
                    }`}
                >
                  All
                </button>
                {Object.entries(typeLabels).map(([type, label]) => (
                  <button type="button" key={type}
                    onClick={() => changeFilter(type)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${filterType === type ? 'bg-[#00C300] text-white' : 'bg-[#F5F5F5] text-[#8D8D8D]'
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bulk Actions */}
        <AnimatePresence>
          {selectMode && selectedIds.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-[#EBEBEB]"
            >
              <div className="flex gap-2 p-3">
                <button type="button" onClick={handleMarkSelectedRead}
                  className="flex items-center gap-1 px-3 py-1.5 bg-[#00C300]/10 text-[#00C300] text-xs rounded-full font-medium"
                >
                  <CheckCheck size={12} /> Mark Read
                </button>
                <button type="button" onClick={handleDeleteSelected}
                  className="flex items-center gap-1 px-3 py-1.5 bg-[#FF3B30]/10 text-[#FF3B30] text-xs rounded-full font-medium"
                >
                  <Trash2 size={12} /> Delete
                </button>
                <button type="button" onClick={() => { setSelectedIds([]); setSelectMode(false); }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-[#F5F5F5] text-[#8D8D8D] text-xs rounded-full font-medium ml-auto"
                >
                  <X size={12} /> Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Notification List */}
      <div className="divide-y divide-[#EBEBEB] pb-16">
        {loading ? (
          <div className="p-4">
            <LoadingSkeleton count={6} variant="list" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-[#8D8D8D]">
            <div className="w-16 h-16 rounded-full bg-[#F5F5F5] flex items-center justify-center mb-4">
              <Bell size={32} className="text-[#C7C7CC]" />
            </div>
            <p className="text-sm font-medium">No notifications</p>
            <p className="text-xs mt-1">You are all caught up!</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-[#8D8D8D]">
            <Filter size={32} className="mb-3 text-[#C7C7CC]" />
            <p className="text-sm">No notifications match this filter</p>
          </div>
        ) : (
          <>
            {renderGroup('Today', grouped.today, false)}
            {renderGroup('Yesterday', grouped.yesterday, true)}
            {renderGroup('This Week', grouped.thisWeek, true)}
            {renderGroup('Earlier', grouped.earlier, true)}
          </>
        )}
      </div>

      {/* Floating Mark All Read */}
      {unreadCount > 0 && !selectMode && (
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={markAllRead}
          className="fixed bottom-[calc(80px+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 bg-[#00C300] text-white rounded-full text-sm font-medium shadow-lg hover:bg-[#00A300] transition-colors z-20"
        >
          <CheckCheck size={16} /> Mark all as read ({unreadCount})
        </motion.button>
      )}

      {/* Notification Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm max-h-[80vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-[#EBEBEB]">
                <h2 className="text-lg font-bold text-[#111111]">Notification Settings</h2>
                <button type="button" onClick={() => setShowSettings(false)} className="p-1 text-[#8D8D8D]">
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <p className="text-[#8D8D8D] text-xs">Mute notification types you don&apos;t want to receive</p>
                {Object.entries(typeLabels).map(([type, label]) => {
                  const Icon = iconMap[type] || Bell;
                  const muted = isMuted(type);
                  return (
                    <div key={type} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${iconColors[type] || 'bg-[#F5F5F5] text-[#8D8D8D]'}`}>
                          <Icon size={14} />
                        </div>
                        <span className="text-sm text-[#111111]">{label}</span>
                      </div>
                      <button type="button" onClick={() => toggleMuteType(type)}
                        className={`p-1.5 rounded-full transition-colors ${muted ? 'bg-[#FF3B30]/10 text-[#FF3B30]' : 'bg-[#00C300]/10 text-[#00C300]'}`}
                      >
                        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="p-4 border-t border-[#EBEBEB]">
                <button type="button" onClick={() => setShowSettings(false)}
                  className="w-full py-3 bg-[#00C300] text-white rounded-xl text-sm font-bold hover:bg-[#00A300] transition-colors"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}