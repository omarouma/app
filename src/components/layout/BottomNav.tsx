import { NavLink } from 'react-router-dom';
import { memo, useMemo } from 'react';
import { MessageCircle, Phone, Users, User, Flame } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { useGroupStore } from '@/store/useGroupStore';
import { useNotificationStore } from '@/store/useNotificationStore';

const tabDefs = [
  { to: '/contacts', label: 'People', icon: Users },
  { to: '/chats', label: 'Chat', icon: MessageCircle },
  { to: '/calls', label: 'Calls', icon: Phone },
  { to: '/timeline', label: 'Feed', icon: Flame, highlight: true },
  { to: '/profile', label: 'Profile', icon: User },
];

const BottomNav = memo(function BottomNav() {
  const chats = useChatStore((s) => s.chats);
  const groups = useGroupStore((s) => s.groups);
  const notifUnread = useNotificationStore((s) => s.unreadCount);
  const totalUnread = useMemo(
    () => [...chats, ...groups].reduce((s, c) => s + (c.unreadCount || 0), 0),
    [chats, groups]
  );

  const tabs = tabDefs.map(t => ({
    ...t,
    badge: t.to === '/chats' ? totalUnread : t.to === '/profile' ? notifUnread : 0,
  }));

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-[#EBEBEB] pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_0_rgba(0,0,0,0.04)]"
      aria-label="Main navigation"
    >
      <div className="flex justify-around items-center h-[58px]">
        {tabs.map(({ to, label, icon: Icon, badge, highlight }) => (
          <NavLink
            key={to}
            to={to}
            aria-label={label}
            className="flex flex-col items-center gap-0.5 flex-1 min-w-0 py-1 tap-scale"
          >
            {({ isActive }) => (
              <>
                <div className="relative flex flex-col items-center">
                  {/* Active pill indicator */}
                  {isActive && !highlight && (
                    <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-5 h-1 bg-[#00C300] rounded-full" />
                  )}
                  {highlight ? (
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center shadow-md transition-transform ${
                      isActive ? 'bg-[#FF4081] scale-105' : 'bg-[#FF4081]/85'
                    }`}>
                      <Icon size={21} className="text-white" strokeWidth={2.5} />
                    </div>
                  ) : (
                    <Icon
                      size={25}
                      className={`transition-colors ${isActive ? 'text-[#111111]' : 'text-[#ADADAD]'}`}
                      strokeWidth={isActive ? 2.5 : 1.5}
                    />
                  )}
                  {badge > 0 && (
                    <span
                      className="absolute -top-1 -right-2.5 bg-[#FF3B30] text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center border-2 border-white px-0.5 badge-pulse"
                      aria-label={`${badge} unread`}
                    >
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] transition-colors ${isActive ? 'font-semibold text-[#111111]' : 'text-[#ADADAD]'}`}>
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
});

export default BottomNav;
