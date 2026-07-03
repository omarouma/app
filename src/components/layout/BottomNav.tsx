import { NavLink } from 'react-router-dom';
import { MessageCircle, Phone, Users, Settings, Flame } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { useGroupStore } from '@/store/useGroupStore';

const tabDefs = [
  { to: '/contacts', label: 'People', icon: Users },
  { to: '/chats', label: 'Chat', icon: MessageCircle },
  { to: '/calls', label: 'Calls', icon: Phone },
  { to: '/timeline', label: 'Feed', icon: Flame, highlight: true },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function BottomNav() {
  const { chats } = useChatStore();
  const { groups } = useGroupStore();
  const totalUnread = [...chats, ...groups].reduce((s, c) => s + (c.unreadCount || 0), 0);

  const tabs = tabDefs.map(t => ({ ...t, badge: t.to === '/chats' ? totalUnread : 0 }));

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#EBEBEB] pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around items-center h-14">
        {tabs.map(({ to, label, icon: Icon, badge, highlight }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 flex-1 min-w-0 py-1 transition-colors ${
                isActive ? 'text-[#111111]' : 'text-[#8D8D8D]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className="relative">
                  {highlight ? (
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isActive ? 'bg-[#FF4081]' : 'bg-[#FF4081]/80'}`}>
                      <Icon size={20} className="text-white" strokeWidth={2.5} />
                    </div>
                  ) : (
                    <Icon
                      size={26}
                      strokeWidth={isActive ? 2 : 1.5}
                      className={isActive ? 'fill-current' : ''}
                    />
                  )}
                  {badge !== undefined && badge > 0 && (
                    <span className="absolute -top-1 -right-2 bg-[#FF3B30] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center border-2 border-white">
                      {badge}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] ${isActive ? 'font-medium' : ''}`}>
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
