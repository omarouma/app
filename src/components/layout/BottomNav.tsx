import { NavLink } from 'react-router-dom';
import { memo, useMemo } from 'react';
import { MessageCircle, Users, User, Flame, Search } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { useGroupStore } from '@/store/useGroupStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import { useIsMounted, useIsSmallPhone, useIsTablet } from '@/hooks/use-mobile';

const tabDefs = [
  { to: '/contacts', label: 'People', icon: Users },
  { to: '/chats', label: 'Chat', icon: MessageCircle },
  { to: '/timeline', label: 'Feed', icon: Flame, highlight: true },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/profile', label: 'Profile', icon: User },
];

const BottomNav = memo(function BottomNav() {
  const isMounted = useIsMounted();
  const isSmallPhone = useIsSmallPhone(480);
  const isTablet = useIsTablet();
  const chats = useChatStore((s) => s.chats);
  const groups = useGroupStore((s) => s.groups);
  const notifUnread = useNotificationStore((s) => s.unreadCount);
  const totalUnread = useMemo(
    () => [...chats, ...groups].reduce((s, c) => s + (c.unreadCount || 0), 0),
    [chats, groups]
  );

  const tabs = useMemo(() => tabDefs.map(t => ({
    ...t,
    badge: t.to === '/chats' ? totalUnread : t.to === '/profile' ? notifUnread : 0,
  })), [totalUnread, notifUnread]);

  if (!isMounted) return null;

  if (isTablet) {
    return (
      <nav
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-[22px] nav-surface border shadow-float"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        aria-label="Main navigation"
      >
        <div className="flex items-center gap-0.5 px-2.5 py-2">
          {tabs.map(({ to, label, icon: Icon, badge, highlight }) => (
            <NavLink
              key={to}
              to={to}
              aria-label={label}
              end={to === '/chats'}
              className="relative flex flex-col items-center gap-0.5 tap-scale min-h-[52px] justify-center px-3.5 rounded-2xl"
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute inset-x-1.5 inset-y-0.5 rounded-2xl bg-primary/10 -z-10" />
                  )}
                  <div className="relative flex flex-col items-center">
                    {highlight ? (
                      <div className={`w-11 h-11 rounded-full flex items-center justify-center shadow-sm transition-all duration-200 ${
                        isActive ? 'scale-105 bg-primary' : 'bg-primary/90'
                      }`}>
                        <Icon size={21} className="text-primary-foreground" strokeWidth={2.5} />
                      </div>
                    ) : (
                      <Icon
                        size={24}
                        className={`transition-colors duration-200 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
                        strokeWidth={isActive ? 2.5 : 1.75}
                      />
                    )}
                    {badge > 0 && (
                      <span
                        className="absolute -top-1 -right-2.5 text-white text-[10px] font-bold rounded-full min-w-[17px] h-[17px] flex items-center justify-center px-1 badge-pulse"
                        style={{
                          backgroundColor: 'hsl(var(--destructive))',
                          border: `2px solid hsl(var(--card))`,
                        }}
                        aria-label={`${badge} unread`}
                        role="status"
                      >
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </div>
                  <span className={`text-[11px] transition-colors duration-200 ${isActive ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    );
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 nav-surface border-t shadow-nav"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Main navigation"
    >
      <div className="flex justify-around items-center"
           style={{ height: isSmallPhone ? '56px' : '60px' }}>
        {tabs.map(({ to, label, icon: Icon, badge, highlight }) => (
          <NavLink
            key={to}
            to={to}
            aria-label={label}
            end={to === '/chats'}
            className="relative flex flex-col items-center gap-0.5 flex-1 min-w-0 py-1 tap-scale min-h-[48px] justify-center"
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full bg-primary" />
                )}
                <div className="relative flex flex-col items-center">
                  {highlight ? (
                    <div className={`${isSmallPhone ? 'w-10 h-10' : 'w-11 h-11'} rounded-full flex items-center justify-center shadow-sm transition-all duration-200 ${
                      isActive ? 'scale-105 bg-primary' : 'bg-primary/90'
                    }`}>
                      <Icon size={isSmallPhone ? 19 : 21} className="text-primary-foreground" strokeWidth={2.5} />
                    </div>
                  ) : (
                    <Icon
                      size={isSmallPhone ? 22 : 24}
                      className={`transition-colors duration-200 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
                      strokeWidth={isActive ? 2.5 : 1.75}
                    />
                  )}
                  {badge > 0 && (
                    <span
                      className="absolute -top-1 -right-2.5 text-white text-[10px] font-bold rounded-full min-w-[17px] h-[17px] flex items-center justify-center px-1 badge-pulse"
                      style={{
                        backgroundColor: 'hsl(var(--destructive))',
                        border: `2px solid hsl(var(--card))`,
                      }}
                      aria-label={`${badge} unread`}
                      role="status"
                    >
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </div>
                <span className={`${isSmallPhone ? 'text-[10px]' : 'text-[11px]'} transition-colors duration-200 ${isActive ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
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
