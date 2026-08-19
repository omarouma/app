import { useEffect, useLayoutEffect, lazy, Suspense, useRef, memo, type ReactElement } from 'react';

import { Routes, Route, Navigate, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';

import { useAuth } from '@/context/AuthContext';
import { useAuthStore } from '@/store/useAuthStore';
import { useCallStore } from '@/store/useCallStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import { useChatStore } from '@/store/useChatStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePageTracking, useEngagementTracking } from '@/hooks/useFirebaseAnalytics';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useGATracking } from '@/hooks/useGATracking';
import { useForegroundNotifications } from '@/hooks/useForegroundNotifications';
import { useIncomingCallNotifications } from '@/hooks/useIncomingCallNotifications';
import { useMessageNotifications } from '@/hooks/useMessageNotifications';
import { useTrackPresence } from '@/hooks/usePresence';
import { MessageCircle, Phone, Users, Flame, Settings } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import { CallProvider } from '@/context/CallContext';
import { VoicePlayerProvider } from '@/context/VoicePlayerContext';
import CallOverlay from '@/components/calling/CallOverlay';
import PWAPrompt from '@/components/PWAPrompt';
import Logo from '@/components/Logo';
import { toast } from 'sonner';
import { getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
import { initAudioOnInteraction } from '@/lib/sounds';
import { startOfflineQueueSync } from '@/lib/offlineSync';
import { getPostAuthPath } from '@/lib/onboarding';
import { safeGetBooleanStorageItem, safeGetStorageItem, safeSetStorageItem } from '@/lib/safeStorage';
import ErrorBoundary from '@/components/ErrorBoundary';
import ScrollToTop from '@/components/ScrollToTop';
import BottomNav from '@/components/layout/BottomNav';
import '@/styles/dark-mode.css';

function usePortraitLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    const lockOrientation = async (): Promise<void> => {
      try {
        const w = window as unknown as {
          screen?: {
            orientation?: { lock?: (o: string) => Promise<void> };
            lockOrientation?: (o: string) => boolean;
            mozLockOrientation?: (o: string) => boolean;
            msLockOrientation?: (o: string) => boolean;
          };
        };
        const s = w.screen;
        if (!s) return;
        if (s.orientation?.lock) {
          try {
            await s.orientation.lock('portrait');
          } catch {
            // ignore
          }
        } else if (s.lockOrientation) {
          s.lockOrientation('portrait');
        } else if (s.mozLockOrientation) {
          s.mozLockOrientation('portrait');
        } else if (s.msLockOrientation) {
          s.msLockOrientation('portrait');
        }
      } catch {
        // ignore
      }
    };

    const onFirstInteraction = () => { void lockOrientation(); };
    const enforcePortraitLayout = () => {
      const isSmallLandscape = window.matchMedia('(orientation: landscape) and (max-width: 900px)').matches;
      document.documentElement.style.setProperty('overflow-x', 'hidden');
      document.documentElement.style.setProperty('overflow-y', isSmallLandscape ? 'hidden' : 'auto');
      document.body.style.overflow = isSmallLandscape ? 'hidden' : 'auto';
      document.body.style.width = '100%';
      document.body.style.maxWidth = '100vw';
      document.body.style.touchAction = isSmallLandscape ? 'none' : 'manipulation';
      document.body.dataset.portraitLock = isSmallLandscape ? 'true' : 'false';
    };

    enforcePortraitLayout();
    void lockOrientation();

    const interactionEvents = ['touchstart', 'pointerdown', 'mousedown', 'click', 'keydown', 'orientationchange', 'resize'] as const;
    interactionEvents.forEach((evt) => {
      window.addEventListener(evt, onFirstInteraction as EventListener, { once: true, passive: true });
    });

    const reLock = () => {
      enforcePortraitLayout();
      void lockOrientation();
    };
    window.addEventListener('orientationchange', reLock);
    window.addEventListener('resize', reLock);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void lockOrientation();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const safetyInterval = window.setInterval(reLock, 8000);

    return () => {
      interactionEvents.forEach((evt) => {
        window.removeEventListener(evt, onFirstInteraction as EventListener);
      });
      window.removeEventListener('orientationchange', reLock);
      window.removeEventListener('resize', reLock);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(safetyInterval);
      document.documentElement.style.removeProperty('overflow-x');
      document.documentElement.style.removeProperty('overflow-y');
      document.body.style.removeProperty('overflow');
      document.body.style.removeProperty('width');
      document.body.style.removeProperty('max-width');
      document.body.style.removeProperty('touch-action');
      delete document.body.dataset.portraitLock;
    };
  }, [enabled]);
}

const LandingView = lazy(() => import('@/views/LandingView'));
const AuthView = lazy(() => import('@/views/AuthView'));

// Desktop views
const DesktopChatView = lazy(() => import('@/views/DesktopChatView'));
const DesktopCallsView = lazy(() => import('@/views/DesktopCallsView'));
const DesktopContactsView = lazy(() => import('@/views/DesktopContactsView'));
const DesktopTimelineView = lazy(() => import('@/views/DesktopTimelineView'));
const PrivacyView = lazy(() => import('@/views/PrivacyView'));
const TermsView = lazy(() => import('@/views/TermsView'));

// Mobile pages
const ChatsPage = lazy(() => import('@/pages/ChatsPage'));
const ChatRoomPage = lazy(() => import('@/pages/ChatRoomPage'));
const CallsPage = lazy(() => import('@/pages/CallsPage'));
const CallPage = lazy(() => import('@/pages/CallPage'));
const ContactsPage = lazy(() => import('@/pages/ContactsPage'));
const TimelinePage = lazy(() => import('@/pages/TimelinePage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'));
const QRScannerPage = lazy(() => import('@/pages/QRScannerPage'));
const WalletPage = lazy(() => import('@/pages/WalletPage'));
const AddFriendsPage = lazy(() => import('@/pages/AddFriendsPage'));
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage'));
const TermsPage = lazy(() => import('@/pages/TermsPage'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const CreateGroupPage = lazy(() => import('@/pages/CreateGroupPage'));
const GroupChatPage = lazy(() => import('@/pages/GroupChatPage'));
const GagaRewardsPage = lazy(() => import('@/pages/GagaRewardsPage'));
const SentRequestsPage = lazy(() => import('@/pages/SentRequestsPage'));
const BlockedUsersPage = lazy(() => import('@/pages/BlockedUsersPage'));
const AdminPage = lazy(() => import('@/pages/AdminPage'));
const ChatInfoPage = lazy(() => import('@/pages/ChatInfoPage'));
const SavedMessagesPage = lazy(() => import('@/pages/SavedMessagesPage'));
const PremiumPage = lazy(() => import('@/pages/PremiumPage'));
const EventsPage = lazy(() => import('@/pages/EventsPage'));
const MarketplacePage = lazy(() => import('@/pages/MarketplacePage'));
const BookmarksPage = lazy(() => import('@/pages/BookmarksPage'));
const HashtagsPage = lazy(() => import('@/pages/HashtagsPage'));
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'));
const SearchPage = lazy(() => import('@/pages/SearchPage'));
const PostPage = lazy(() => import('@/pages/PostPage'));
const HelpCenterPage = lazy(() => import('@/pages/HelpCenterPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const CreatorCenterPage = lazy(() => import('@/pages/CreatorCenterPage'));
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage'));
const AboutPage = lazy(() => import('@/pages/AboutPage'));
const BlogPage = lazy(() => import('@/pages/BlogPage'));
const CareersPage = lazy(() => import('@/pages/CareersPage'));
const BroadcastListsPage = lazy(() => import('@/pages/BroadcastListsPage'));
const CreateReelsPage = lazy(() => import('@/pages/CreateReelsPage'));
const CookiePolicyPage = lazy(() => import('@/pages/CookiePolicyPage'));
const CommunityGuidelinesPage = lazy(() => import('@/pages/CommunityGuidelinesPage'));
const MorePage = lazy(() => import('@/pages/MorePage'));
const ReelsPage = lazy(() => import('@/pages/ReelsPage'));
const ShareTargetPage = lazy(() => import('@/pages/ShareTargetPage'));
const VoiceRoomsPage = lazy(() => import('@/pages/VoiceRoomsPage'));
const VoiceRoomPage = lazy(() => import('@/pages/VoiceRoomPage'));
const DailyChallengesPage = lazy(() => import('@/pages/DailyChallengesPage'));
const AIChatPage = lazy(() => import('@/pages/AIChatPage'));
const LiveStreamsPage = lazy(() => import('@/pages/LiveStreamsPage'));
const LiveStreamPage = lazy(() => import('@/pages/LiveStreamPage'));
const CreatorDashboardPage = lazy(() => import('@/pages/CreatorDashboardPage'));

const PageLoader = () => (
  <div className="h-screen w-screen bg-white flex items-center justify-center">
    <div className="text-center animate-pulse">
      <div className="mx-auto mb-4">
        <Logo size={72} />
      </div>
      <p className="text-[#8D8D8D] text-sm">Loading...</p>
    </div>
  </div>
);

const desktopNavItems = [
  { to: '/chat', icon: MessageCircle, label: 'Chats' },
  { to: '/calls', icon: Phone, label: 'Calls' },
  { to: '/contacts', icon: Users, label: 'People' },
  { to: '/timeline', icon: Flame, label: 'Feed' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

// Routes where BottomNav should be hidden on mobile (full-screen experiences)
const HIDE_BOTTOM_NAV_PATHS = ['/chat/', '/group/', '/onboarding', '/auth', '/qr-scanner', '/live/', '/voice-room/'];

function shouldHideBottomNav(pathname: string): boolean {
  return pathname === '/call' || HIDE_BOTTOM_NAV_PATHS.some((path) => pathname.startsWith(path));
}

// Public paths accessible without authentication on desktop
const DESKTOP_PUBLIC_PATHS = ['/privacy', '/terms', '/cookies', '/community-guidelines'];

const MOBILE_PROTECTED_ROUTE_PATHS: string[] = [
  '/chats', '/chat/:userId', '/group/:groupId', '/create-group', '/calls', '/call',
  '/contacts', '/timeline', '/profile', '/profile/:userId', '/settings', '/notifications',
  '/qr-scanner', '/wallet', '/rewards', '/add-friends', '/sent-requests', '/blocked-users',
  '/chat-info/:chatId', '/saved-messages', '/premium', '/reels', '/more', '/share',
  '/events', '/marketplace', '/bookmarks', '/hashtags', '/analytics', '/search',
  '/broadcast-lists', '/create-reel', '/creators', '/voice-rooms', '/voice-room/:roomId',
  '/challenges', '/ai-chat', '/live-streams', '/live/:streamId', '/creator-dashboard',
  '/post/:postId',
];

function getMobileRouteElement(path: string) {
  switch (path) {
    case '/chats': return <ErrorBoundary key="chats"><ChatsPage /></ErrorBoundary>;
    case '/chat/:userId': return <ErrorBoundary key="chat"><ChatRoomPage /></ErrorBoundary>;
    case '/group/:groupId': return <ErrorBoundary key="group"><GroupChatPage /></ErrorBoundary>;
    case '/calls': return <ErrorBoundary key="calls"><CallsPage /></ErrorBoundary>;
    case '/call': return <ErrorBoundary key="call"><CallPage /></ErrorBoundary>;
    case '/timeline': return <ErrorBoundary key="timeline"><TimelinePage /></ErrorBoundary>;
    case '/voice-room/:roomId': return <ErrorBoundary key="voice-room"><VoiceRoomPage /></ErrorBoundary>;
    case '/live/:streamId': return <ErrorBoundary key="live"><LiveStreamPage /></ErrorBoundary>;
    case '/create-group': return <ErrorBoundary key="create-group"><CreateGroupPage /></ErrorBoundary>;
    case '/contacts': return <ErrorBoundary key="contacts"><ContactsPage /></ErrorBoundary>;
    case '/profile': return <ErrorBoundary key="profile"><ProfilePage /></ErrorBoundary>;
    case '/profile/:userId': return <ErrorBoundary key="profile-id"><ProfilePage /></ErrorBoundary>;
    case '/settings': return <ErrorBoundary key="settings"><SettingsPage /></ErrorBoundary>;
    case '/notifications': return <ErrorBoundary key="notifications"><NotificationsPage /></ErrorBoundary>;
    case '/qr-scanner': return <ErrorBoundary key="qr-scanner"><QRScannerPage /></ErrorBoundary>;
    case '/wallet': return <ErrorBoundary key="wallet"><WalletPage /></ErrorBoundary>;
    case '/rewards': return <ErrorBoundary key="rewards"><GagaRewardsPage /></ErrorBoundary>;
    case '/add-friends': return <ErrorBoundary key="add-friends"><AddFriendsPage /></ErrorBoundary>;
    case '/sent-requests': return <ErrorBoundary key="sent-requests"><SentRequestsPage /></ErrorBoundary>;
    case '/blocked-users': return <ErrorBoundary key="blocked-users"><BlockedUsersPage /></ErrorBoundary>;
    case '/chat-info/:chatId': return <ErrorBoundary key="chat-info"><ChatInfoPage /></ErrorBoundary>;
    case '/saved-messages': return <ErrorBoundary key="saved-messages"><SavedMessagesPage /></ErrorBoundary>;
    case '/premium': return <ErrorBoundary key="premium"><PremiumPage /></ErrorBoundary>;
    case '/reels': return <ErrorBoundary key="reels"><ReelsPage /></ErrorBoundary>;
    case '/more': return <ErrorBoundary key="more"><MorePage /></ErrorBoundary>;
    case '/share': return <ErrorBoundary key="share"><ShareTargetPage /></ErrorBoundary>;
    case '/events': return <ErrorBoundary key="events"><EventsPage /></ErrorBoundary>;
    case '/marketplace': return <ErrorBoundary key="marketplace"><MarketplacePage /></ErrorBoundary>;
    case '/bookmarks': return <ErrorBoundary key="bookmarks"><BookmarksPage /></ErrorBoundary>;
    case '/hashtags': return <ErrorBoundary key="hashtags"><HashtagsPage /></ErrorBoundary>;
    case '/analytics': return <ErrorBoundary key="analytics"><AnalyticsPage /></ErrorBoundary>;
    case '/search': return <ErrorBoundary key="search"><SearchPage /></ErrorBoundary>;
    case '/post/:postId': return <ErrorBoundary key="post"><PostPage /></ErrorBoundary>;
    case '/help': return <ErrorBoundary key="help"><HelpCenterPage /></ErrorBoundary>;
    case '/broadcast-lists': return <ErrorBoundary key="broadcast-lists"><BroadcastListsPage /></ErrorBoundary>;
    case '/create-reel': return <ErrorBoundary key="create-reel"><CreateReelsPage /></ErrorBoundary>;
    case '/creators': return <ErrorBoundary key="creators"><CreatorCenterPage /></ErrorBoundary>;
    case '/voice-rooms': return <ErrorBoundary key="voice-rooms"><VoiceRoomsPage /></ErrorBoundary>;
    case '/challenges': return <ErrorBoundary key="challenges"><DailyChallengesPage /></ErrorBoundary>;
    case '/ai-chat': return <ErrorBoundary key="ai-chat"><AIChatPage /></ErrorBoundary>;
    case '/live-streams': return <ErrorBoundary key="live-streams"><LiveStreamsPage /></ErrorBoundary>;
    case '/creator-dashboard': return <ErrorBoundary key="creator-dashboard"><CreatorDashboardPage /></ErrorBoundary>;
    default: return <NotFound />;
  }
}

const DesktopNav = memo(function DesktopNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const avatarSrc = (user?.avatar ? sanitizeMediaUrl(user.avatar) : null) ?? getDefaultAvatar(user?.id || user?.name || 'U');

  return (
    <div className="w-[72px] border-r border-[#EBEBEB] flex flex-col items-center py-4 gap-1 bg-white shrink-0">
      <div className="mb-6 mt-1 cursor-pointer" onClick={() => navigate('/chat')}>
        <Logo size={42} />
      </div>
      {desktopNavItems.map((item) => {
        const isActive = location.pathname === item.to || (location.pathname.startsWith(item.to + '/') && item.to !== '/');
        return (
          <button type="button" key={item.to}
            onClick={() => navigate(item.to)}
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors mb-1 ${isActive
              ? 'bg-[#00C300]/10 text-[#00C300]'
              : 'text-[#8D8D8D] hover:text-[#111111] hover:bg-[#F5F5F5]'
              }`}
            title={item.label}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
          >
            <item.icon size={22} strokeWidth={isActive ? 2 : 1.5} />
          </button>
        );
      })}
      <div className="mt-auto">
        <button
          type="button"
          onClick={() => navigate('/profile')}
          className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-[#00C300] transition-all"
          aria-label="Go to profile"
        >
          <img src={avatarSrc} className="w-full h-full object-cover" alt="User avatar" />
        </button>
      </div>
    </div>
  );
});

function useServiceWorker() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;
    let lastSwVersion = safeGetStorageItem('gaga_sw_last_version') || '';

    const handleUpdateFound = () => {
      if (!registration) return;
      const newWorker = registration.installing;
      if (!newWorker) return;
      const handleStateChange = () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          toast.info('App update available', {
            description: 'Refresh to get the latest version',
            action: {
              label: 'Update Now',
              onClick: () => {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
                window.location.reload();
              },
            },
            duration: 10000,
          });
        }
      };
      newWorker.addEventListener('statechange', handleStateChange);
    };

    const handleMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; version?: string } | null;
      if (!data || data.type !== 'SW_VERSION') return;
      const next = String(data.version || '');
      if (!next || next === lastSwVersion) return;
      const shouldReload = !!lastSwVersion && lastSwVersion !== next;
      lastSwVersion = next;
      safeSetStorageItem('gaga_sw_last_version', next);
      if (shouldReload) window.location.reload();
    };

    const handleNavigate = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      if (data?.type === 'NAVIGATE' && data.url) (navigate as NavigateFunction)(data.url);
    };

    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        registration = reg;
        if ('sync' in registration) {
          (registration as unknown as { sync: { register: (tag: string) => Promise<void> } })
            .sync.register('sync-messages').catch(() => { });
        }
        registration.update().catch(() => { });
        registration.addEventListener('updatefound', handleUpdateFound);
      })
      .catch(() => { });

    const handleSWMessage = (event: MessageEvent) => {
      handleMessage(event);
      handleNavigate(event);
    };
    navigator.serviceWorker.addEventListener('message', handleSWMessage);

    return () => {
      if (registration) registration.removeEventListener('updatefound', handleUpdateFound);
      navigator.serviceWorker.removeEventListener('message', handleSWMessage);
    };
  }, [navigate]);
}

function ProtectedRoute({ element, adminOnly = false, isAuthenticated, isAdmin = false }: {
  element: ReactElement;
  adminOnly?: boolean;
  isAuthenticated: boolean;
  isAdmin?: boolean;
}) {
  if (!isAuthenticated) return <Navigate to="/auth" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return element;
}

function AppContent() {
  const location = useLocation();
  const isMobile = useIsMobile();
  const { isAuthenticated, loading } = useAuth();
  const { user } = useAuthStore();
  const didOnboardingRedirectRef = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    const publicSeo: Record<string, { title: string; description: string }> = {
      '/': {
        title: 'GaGa Chat - Free Global Messaging, HD Voice & Video Calls',
        description: 'GaGa Chat is a free global messaging app with secure chat, HD voice and video calls, group chat, live streaming, reels, and more.',
      },
      '/about': { title: 'About GaGa Chat - Global Messaging and Community', description: 'Learn about GaGa Chat, a global messaging and community platform for secure conversations, calls, and social sharing.' },
      '/blog': { title: 'GaGa Chat Blog - Messaging, Community, and Safety', description: 'Read the latest GaGa Chat news, product updates, messaging tips, and community guidance.' },
      '/careers': { title: 'Careers at GaGa Chat', description: 'Explore opportunities to help build a faster, safer, and more connected global communication platform.' },
      '/privacy': { title: 'Privacy Policy - GaGa Chat', description: 'Read the GaGa Chat privacy policy and learn how account and service data is handled.' },
      '/terms': { title: 'Terms of Service - GaGa Chat', description: 'Review the terms that apply when using GaGa Chat services.' },
      '/cookies': { title: 'Cookie Policy - GaGa Chat', description: 'Learn how GaGa Chat uses cookies and related browser technologies.' },
      '/community-guidelines': { title: 'Community Guidelines - GaGa Chat', description: 'Learn how to keep GaGa Chat welcoming, safe, and respectful for everyone.' },
    };
    const path = location.pathname.replace(/\/$/, '') || '/';
    const seo = publicSeo[path];
    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (seo) {
      document.title = seo.title;
      if (robots) robots.content = 'index, follow, max-image-preview:large';
      if (canonical) canonical.href = `https://gagachat.app${path === '/' ? '/' : path}`;
      const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (description) description.content = seo.description;
    } else {
      if (robots) robots.content = 'noindex, nofollow, noarchive';
      if (canonical) canonical.removeAttribute('href');
    }
  }, [location.pathname]);

  const onboardingComplete = isAuthenticated
    ? safeGetBooleanStorageItem('gaga-onboarding-complete', false)
    : false;

  // Reset onboarding redirect flag when user logs out so re-login triggers it again
  useEffect(() => {
    if (!isAuthenticated) didOnboardingRedirectRef.current = false;
  }, [isAuthenticated]);

  usePageTracking();
  useEngagementTracking();
  useGATracking();
  usePushNotifications();
  useForegroundNotifications();
  useIncomingCallNotifications();  // NEW: Handle incoming call notifications & sounds
  useMessageNotifications();       // NEW: WeChat-style message sounds + background notifications

  useEffect(() => {
    // These public pages must be visible even when onboarding is incomplete
    const publicPaths = ['/privacy', '/terms', '/help', '/cookies', '/community-guidelines', '/about', '/blog', '/careers'];
    const isPublicPath = publicPaths.some((p) => location.pathname.startsWith(p));
    if (!isAuthenticated) return;
    if (onboardingComplete) return;
    if (location.pathname === '/onboarding') return;
    if (location.pathname.startsWith('/auth')) return;
    if (isPublicPath) return;
    if (didOnboardingRedirectRef.current) return;
    didOnboardingRedirectRef.current = true;
    navigate('/onboarding', { replace: true });
  }, [isAuthenticated, onboardingComplete, location.pathname, navigate]);

  const { subscribeCalls } = useCallStore();
  const { subscribe: subscribeNotifications } = useNotificationStore();
  const { subscribeChats } = useChatStore();

  // Stable refs to avoid re-subscription on every render
  const subscribeCallsRef = useRef(subscribeCalls);
  const subscribeNotificationsRef = useRef(subscribeNotifications);
  const subscribeChatsRef = useRef(subscribeChats);
  useLayoutEffect(() => {
    subscribeCallsRef.current = subscribeCalls;
    subscribeNotificationsRef.current = subscribeNotifications;
    subscribeChatsRef.current = subscribeChats;
  });

  useEffect(() => {
    if (!user?.id) return;
    const unsubCalls = subscribeCallsRef.current(user.id);
    const unsubNotifs = subscribeNotificationsRef.current(user.id);
    const unsubChats = subscribeChatsRef.current(user.id);
    return () => { unsubCalls(); unsubNotifs(); unsubChats(); };
  }, [user?.id]);

  useTrackPresence(user?.id);

  useEffect(() => { initAudioOnInteraction(); }, []);

  // Start the global offline-queue flusher (singleton, idempotent)
  useEffect(() => { startOfflineQueueSync(); }, []);

  useServiceWorker();

  usePortraitLock(isMobile);

  if (loading) return <PageLoader />;

  // Determine if BottomNav should be shown on mobile
  const showBottomNav = isMobile && isAuthenticated &&
    !shouldHideBottomNav(location.pathname) &&
    location.pathname !== '/onboarding' &&
    location.pathname !== '/auth' &&
    location.pathname !== '/';

  return (
    <div className="w-full max-w-[100vw] bg-white" style={{ minHeight: '100dvh' }}>
      <Suspense fallback={<PageLoader />}>
        <Routes location={location}>
          {/* Public routes */}
          <Route
            path="/"
            element={
              isAuthenticated
                ? <Navigate to={getPostAuthPath(isMobile)} replace />
                : <LandingView />
            }
          />
          <Route
            path="/auth"
            element={
              isAuthenticated
                ? <Navigate to={getPostAuthPath(isMobile)} replace />
                : <AuthView />
            }
          />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/careers" element={<CareersPage />} />
          <Route path="/privacy" element={isMobile ? <PrivacyPage /> : <PrivacyView />} />
          <Route path="/terms" element={isMobile ? <TermsPage /> : <TermsView />} />
          <Route path="/help" element={<HelpCenterPage />} />
          <Route path="/onboarding" element={
            <ProtectedRoute element={<OnboardingPage />} isAuthenticated={isAuthenticated} />
          } />

          {/* Mobile routes */}
          {isMobile && (
            <>
              {MOBILE_PROTECTED_ROUTE_PATHS.map((path) => (
                <Route key={path} path={path} element={
                  <ProtectedRoute element={getMobileRouteElement(path)} isAuthenticated={isAuthenticated} />
                } />
              ))}
              <Route path="/admin" element={
                <ProtectedRoute element={<AdminPage />} adminOnly isAuthenticated={isAuthenticated} isAdmin={user?.isAdmin} />
              } />
              <Route path="/cookies" element={<CookiePolicyPage />} />
              <Route path="/community-guidelines" element={<CommunityGuidelinesPage />} />
            </>
          )}

          {/* Desktop routes */}
          {!isMobile && (
            <Route
              path="/*"
              element={
                !isAuthenticated && !DESKTOP_PUBLIC_PATHS.some((p) => location.pathname.startsWith(p)) ? (
                  <Navigate to="/auth" replace />
                ) : (
                  <div className="h-screen flex overflow-hidden">
                    <DesktopNav />
                    <div className="flex-1 overflow-hidden bg-white">
                      <Routes>
                        <Route path="chat" element={<DesktopChatView />} />
                        <Route path="chats" element={<DesktopChatView />} />
                        <Route path="chat/:userId" element={<DesktopChatView />} />
                        <Route path="group/:groupId" element={<GroupChatPage />} />
                        <Route path="create-group" element={<CreateGroupPage />} />
                        <Route path="calls" element={<DesktopCallsView />} />
                        <Route path="contacts" element={<DesktopContactsView />} />
                        <Route path="timeline" element={<DesktopTimelineView />} />
                        <Route path="call" element={<CallPage />} />
                        <Route path="profile" element={<ProfilePage />} />
                        <Route path="profile/:userId" element={<ProfilePage />} />
                        <Route path="wallet" element={<WalletPage />} />
                        <Route path="notifications" element={<NotificationsPage />} />
                        <Route path="qr-scanner" element={<QRScannerPage />} />
                        <Route path="add-friends" element={<AddFriendsPage />} />
                        <Route path="sent-requests" element={<SentRequestsPage />} />
                        <Route path="blocked-users" element={<BlockedUsersPage />} />
                        <Route path="admin" element={user?.isAdmin ? <AdminPage /> : <Navigate to="/" replace />} />
                        <Route path="rewards" element={<GagaRewardsPage />} />
                        <Route path="more" element={<MorePage />} />
                        <Route path="reels" element={<ReelsPage />} />
                        <Route path="share" element={<ShareTargetPage />} />
                        <Route path="settings" element={<SettingsPage />} />
                        <Route path="chat-info/:chatId" element={<ChatInfoPage />} />
                        <Route path="saved-messages" element={<SavedMessagesPage />} />
                        <Route path="premium" element={<PremiumPage />} />
                        <Route path="events" element={<EventsPage />} />
                        <Route path="marketplace" element={<MarketplacePage />} />
                        <Route path="bookmarks" element={<BookmarksPage />} />
                        <Route path="hashtags" element={<HashtagsPage />} />
                        <Route path="analytics" element={<AnalyticsPage />} />
                        <Route path="search" element={<SearchPage />} />
                        <Route path="post/:postId" element={<PostPage />} />
                        <Route path="help" element={<HelpCenterPage />} />
                        <Route path="broadcast-lists" element={<BroadcastListsPage />} />
                        <Route path="creators" element={<CreatorCenterPage />} />
                        <Route path="voice-rooms" element={<VoiceRoomsPage />} />
                        <Route path="voice-room/:roomId" element={<VoiceRoomPage />} />
                        <Route path="challenges" element={<DailyChallengesPage />} />
                        <Route path="ai-chat" element={<AIChatPage />} />
                        <Route path="live-streams" element={<LiveStreamsPage />} />
                        <Route path="live/:streamId" element={<LiveStreamPage />} />
                        <Route path="creator-dashboard" element={<CreatorDashboardPage />} />
                        <Route path="create-reel" element={<CreateReelsPage />} />
                        <Route path="cookies" element={<CookiePolicyPage />} />
                        <Route path="community-guidelines" element={<CommunityGuidelinesPage />} />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </div>
                  </div>
                )
              }
            />
          )}

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>

      {showBottomNav && <BottomNav />}
      <ScrollToTop />
      <CallOverlay />
      <PWAPrompt />
      <Toaster position="top-center" />
    </div>
  );
}

export default function App() {
  return <AppWithCallProvider />;
}

function AppWithCallProvider() {
  const location = useLocation();
  return (
    <VoicePlayerProvider>
      <CallProvider>
        <ErrorBoundary resetKey={location.pathname}>
          <AppContent />
        </ErrorBoundary>
      </CallProvider>
    </VoicePlayerProvider>
  );
}
