import { useEffect, lazy, Suspense, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useAuthStore } from '@/store/useAuthStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePageTracking, useEngagementTracking } from '@/hooks/useFirebaseAnalytics';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useGATracking } from '@/hooks/useGATracking';
import { useForegroundNotifications } from '@/hooks/useForegroundNotifications';
import { MessageCircle, Phone, Users, Settings, Flame } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import CallOverlay from '@/components/calling/CallOverlay';
import PWAPrompt from '@/components/PWAPrompt';
import Logo from '@/components/Logo';
import { toast } from 'sonner';
import { getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
import ErrorBoundary from '@/components/ErrorBoundary';
import ScrollToTop from '@/components/ScrollToTop';

// Eagerly loaded (critical path)
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
const HelpCenterPage = lazy(() => import('@/pages/HelpCenterPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const CreatorCenterPage = lazy(() => import('@/pages/CreatorCenterPage'));
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage'));
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
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="text-center"
    >
      <div className="mx-auto mb-4">
        <Logo size={72} />
      </div>
      <p className="text-[#8D8D8D] text-sm">Loading...</p>
    </motion.div>
  </div>
);

function DesktopNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const desktopNavItems = [
    { to: '/chat', icon: MessageCircle, label: 'Chats' },
    { to: '/calls', icon: Phone, label: 'Calls' },
    { to: '/contacts', icon: Users, label: 'People' },
    { to: '/timeline', icon: Flame, label: 'Feed' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

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
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors mb-1 ${
              isActive
                ? 'bg-[#00C300]/10 text-[#00C300]'
                : 'text-[#8D8D8D] hover:text-[#111111] hover:bg-[#F5F5F5]'
            }`}
            title={item.label}
          >
            <item.icon size={22} strokeWidth={isActive ? 2 : 1.5} />
          </button>
        );
      })}
      <div className="mt-auto">
        <button type="button" onClick={() => navigate('/profile')}
          className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-[#00C300] transition-all"
        >
          {sanitizeMediaUrl(user?.avatar) ? (
            <img src={sanitizeMediaUrl(user?.avatar)} className="w-full h-full object-cover" alt="User avatar" />
          ) : (
            <img src={getDefaultAvatar(user?.id || user?.name || 'U')} className="w-full h-full object-cover" alt="User avatar" />
          )}
        </button>
      </div>
    </div>
  );
}

function AppContent() {
  const location = useLocation();
  const isMobile = useIsMobile();
  const { isAuthenticated, loading } = useAuth();
  const { user } = useAuthStore();
  const [, setUpdateAvailable] = useState(false);

  const navigate = useNavigate();
  const onboardingComplete = localStorage.getItem('gaga-onboarding-complete') === 'true';

  // Firebase Analytics tracking
  usePageTracking();
  useEngagementTracking();

  // Google Analytics 4 tracking
  useGATracking();

  // Push notifications initialization
  usePushNotifications();

  // Foreground notification bridge (Supabase realtime → browser notification)
  useForegroundNotifications();

  // Redirect to onboarding for first-time users
  useEffect(() => {
    const publicPaths = ['/privacy', '/terms', '/help'];
    const isPublicPath = publicPaths.some(p => location.pathname.startsWith(p));
    if (isAuthenticated && !onboardingComplete && location.pathname !== '/onboarding' && !location.pathname.startsWith('/auth') && !isPublicPath) {
      navigate('/onboarding');
    }
  }, [isAuthenticated, onboardingComplete, location.pathname, navigate]);

  // Global scheduled message checker (runs even when not in a chat room)
  useEffect(() => {
    const checkGlobalScheduled = async () => {
      const { getOverdueScheduledMessages, removeScheduledMessage } = await import('@/hooks/useScheduledMessages');
      const overdue = getOverdueScheduledMessages();
      const { useChatStore } = await import('@/store/useChatStore');
      const sendMessage = useChatStore.getState().sendMessage;
      for (const msg of overdue) {
        try {
          await sendMessage(msg.chatId, msg.senderId, msg.content, msg.type || 'text', msg.mediaUrl, msg.replyTo);
          removeScheduledMessage(msg.id);
        } catch { /* retry next interval */ }
      }
    };
    checkGlobalScheduled();
    const interval = setInterval(checkGlobalScheduled, 10000);
    return () => clearInterval(interval);
  }, []);

  // Register service worker with update handling
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          // Register background sync for messages
          if ('sync' in registration) {
            (registration as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync.register('sync-messages').catch(() => {});
          }

          // Check for updates on page load
          registration.update();

          // Watch for new service worker waiting
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New version available
                setUpdateAvailable(true);
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
            });
          });
        })
        .catch(() => {
          // SW registration failed, app still works
        });

      // Listen for controller changes (new SW activated)
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    }
  }, []);

  if (loading) return <PageLoader />;

  const isPublicRoute = location.pathname === '/' || location.pathname === '/auth' || location.pathname === '/privacy' || location.pathname === '/terms' || location.pathname === '/onboarding' || location.pathname === '/creators';

  return (
    <div className={`w-screen bg-white ${isPublicRoute ? 'min-h-[100dvh]' : 'h-[100dvh] overflow-hidden'}`}>
      <Suspense fallback={<PageLoader />}>
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            {/* Public routes */}
            <Route
              path="/"
              element={
                isAuthenticated
                  ? (isMobile ? <Navigate to="/contacts" /> : <Navigate to="/chat" />)
                  : <LandingView />
              }
            />
            <Route
              path="/auth"
              element={
                isAuthenticated
                  ? (isMobile ? <Navigate to="/contacts" /> : <Navigate to="/chat" />)
                  : <AuthView />
              }
            />
            <Route path="/privacy" element={isMobile ? <PrivacyPage /> : <PrivacyView />} />
            <Route path="/terms" element={isMobile ? <TermsPage /> : <TermsView />} />
            <Route path="/creators" element={<CreatorCenterPage />} />

            <Route path="/onboarding" element={<OnboardingPage />} />

            {/* Mobile routes */}
            {isMobile && (
              <>
                <Route path="/chats" element={!isAuthenticated ? <Navigate to="/auth" /> : <ChatsPage />} />
                <Route path="/chat/:userId" element={!isAuthenticated ? <Navigate to="/auth" /> : <ChatRoomPage />} />
                <Route path="/group/:groupId" element={!isAuthenticated ? <Navigate to="/auth" /> : <GroupChatPage />} />
                <Route path="/create-group" element={!isAuthenticated ? <Navigate to="/auth" /> : <CreateGroupPage />} />
                <Route path="/calls" element={!isAuthenticated ? <Navigate to="/auth" /> : <CallsPage />} />
                <Route path="/call" element={!isAuthenticated ? <Navigate to="/auth" /> : <CallPage />} />
                <Route path="/contacts" element={!isAuthenticated ? <Navigate to="/auth" /> : <ContactsPage />} />
                <Route path="/timeline" element={!isAuthenticated ? <Navigate to="/auth" /> : <TimelinePage />} />
                <Route path="/profile" element={!isAuthenticated ? <Navigate to="/auth" /> : <ProfilePage />} />
                <Route path="/profile/:userId" element={!isAuthenticated ? <Navigate to="/auth" /> : <ProfilePage />} />
                <Route path="/settings" element={!isAuthenticated ? <Navigate to="/auth" /> : <SettingsPage />} />
                <Route path="/notifications" element={!isAuthenticated ? <Navigate to="/auth" /> : <NotificationsPage />} />
                <Route path="/qr-scanner" element={!isAuthenticated ? <Navigate to="/auth" /> : <QRScannerPage />} />
                <Route path="/wallet" element={!isAuthenticated ? <Navigate to="/auth" /> : <WalletPage />} />
                <Route path="/rewards" element={!isAuthenticated ? <Navigate to="/auth" /> : <GagaRewardsPage />} />
                <Route path="/add-friends" element={!isAuthenticated ? <Navigate to="/auth" /> : <AddFriendsPage />} />
                <Route path="/sent-requests" element={!isAuthenticated ? <Navigate to="/auth" /> : <SentRequestsPage />} />
                <Route path="/blocked-users" element={!isAuthenticated ? <Navigate to="/auth" /> : <BlockedUsersPage />} />
                <Route path="/admin" element={!isAuthenticated ? <Navigate to="/auth" /> : (user?.isAdmin ? <AdminPage /> : <Navigate to="/" />)} />
                <Route path="/chat-info/:chatId" element={!isAuthenticated ? <Navigate to="/auth" /> : <ChatInfoPage />} />
                <Route path="/saved-messages" element={!isAuthenticated ? <Navigate to="/auth" /> : <SavedMessagesPage />} />
                <Route path="/premium" element={!isAuthenticated ? <Navigate to="/auth" /> : <PremiumPage />} />
                <Route path="/reels" element={!isAuthenticated ? <Navigate to="/auth" /> : <ReelsPage />} />
                <Route path="/more" element={!isAuthenticated ? <Navigate to="/auth" /> : <MorePage />} />
                <Route path="/share" element={!isAuthenticated ? <Navigate to="/auth" /> : <ShareTargetPage />} />
                <Route path="/events" element={!isAuthenticated ? <Navigate to="/auth" /> : <EventsPage />} />
                <Route path="/marketplace" element={!isAuthenticated ? <Navigate to="/auth" /> : <MarketplacePage />} />
                <Route path="/bookmarks" element={!isAuthenticated ? <Navigate to="/auth" /> : <BookmarksPage />} />
                <Route path="/hashtags" element={!isAuthenticated ? <Navigate to="/auth" /> : <HashtagsPage />} />
                <Route path="/analytics" element={!isAuthenticated ? <Navigate to="/auth" /> : <AnalyticsPage />} />
                <Route path="/search" element={!isAuthenticated ? <Navigate to="/auth" /> : <SearchPage />} />
                <Route path="/help" element={!isAuthenticated ? <Navigate to="/auth" /> : <HelpCenterPage />} />
                <Route path="/broadcast-lists" element={!isAuthenticated ? <Navigate to="/auth" /> : <BroadcastListsPage />} />
                <Route path="/create-reel" element={!isAuthenticated ? <Navigate to="/auth" /> : <CreateReelsPage />} />
                <Route path="/creators" element={!isAuthenticated ? <Navigate to="/auth" /> : <CreatorCenterPage />} />
                <Route path="/voice-rooms" element={!isAuthenticated ? <Navigate to="/auth" /> : <VoiceRoomsPage />} />
                <Route path="/voice-room/:roomId" element={!isAuthenticated ? <Navigate to="/auth" /> : <VoiceRoomPage />} />
                <Route path="/challenges" element={!isAuthenticated ? <Navigate to="/auth" /> : <DailyChallengesPage />} />
                <Route path="/ai-chat" element={!isAuthenticated ? <Navigate to="/auth" /> : <AIChatPage />} />
                <Route path="/live-streams" element={!isAuthenticated ? <Navigate to="/auth" /> : <LiveStreamsPage />} />
                <Route path="/live/:streamId" element={!isAuthenticated ? <Navigate to="/auth" /> : <LiveStreamPage />} />
                <Route path="/creator-dashboard" element={!isAuthenticated ? <Navigate to="/auth" /> : <CreatorDashboardPage />} />
                <Route path="/cookies" element={<CookiePolicyPage />} />
                <Route path="/community-guidelines" element={<CommunityGuidelinesPage />} />
              </>
            )}

            {/* Desktop routes */}
            {!isMobile && (
              <Route
                path="/*"
                element={
                  !isAuthenticated ? (
                    <Navigate to="/auth" />
                  ) : (
                    <div className="h-full flex">
                      <DesktopNav />
                      <div className="flex-1 overflow-hidden bg-white">
                        <Routes>
                          <Route path="/chat" element={<DesktopChatView />} />
                          <Route path="/chat/:userId" element={<DesktopChatView />} />
                          <Route path="/group/:groupId" element={<GroupChatPage />} />
                          <Route path="/create-group" element={<CreateGroupPage />} />
                          <Route path="/calls" element={<DesktopCallsView />} />
                          <Route path="/contacts" element={<DesktopContactsView />} />
                          <Route path="/timeline" element={<DesktopTimelineView />} />
                          <Route path="/call" element={<CallPage />} />
                          <Route path="/profile" element={<ProfilePage />} />
                          <Route path="/profile/:userId" element={<ProfilePage />} />
                          <Route path="/wallet" element={<WalletPage />} />
                          <Route path="/notifications" element={<NotificationsPage />} />
                          <Route path="/qr-scanner" element={<QRScannerPage />} />
                          <Route path="/add-friends" element={<AddFriendsPage />} />
                          <Route path="/sent-requests" element={<SentRequestsPage />} />
                          <Route path="/blocked-users" element={<BlockedUsersPage />} />
                          <Route path="/admin" element={user?.isAdmin ? <AdminPage /> : <Navigate to="/" />} />
                          <Route path="/rewards" element={<GagaRewardsPage />} />
                          <Route path="/more" element={<MorePage />} />
                          <Route path="/reels" element={<ReelsPage />} />
                          <Route path="/share" element={<ShareTargetPage />} />
                          <Route path="/settings" element={<SettingsPage />} />
                          <Route path="/chat-info/:chatId" element={<ChatInfoPage />} />
                          <Route path="/saved-messages" element={<SavedMessagesPage />} />
                          <Route path="/premium" element={<PremiumPage />} />
                          <Route path="/events" element={<EventsPage />} />
                          <Route path="/marketplace" element={<MarketplacePage />} />
                          <Route path="/bookmarks" element={<BookmarksPage />} />
                          <Route path="/hashtags" element={<HashtagsPage />} />
                          <Route path="/analytics" element={<AnalyticsPage />} />
                          <Route path="/search" element={<SearchPage />} />
                          <Route path="/help" element={<HelpCenterPage />} />
                          <Route path="/broadcast-lists" element={<BroadcastListsPage />} />
                          <Route path="/creators" element={<CreatorCenterPage />} />
                          <Route path="/live-streams" element={<LiveStreamsPage />} />
                          <Route path="/live/:streamId" element={<LiveStreamPage />} />
                          <Route path="/creator-dashboard" element={<CreatorDashboardPage />} />
                          <Route path="/create-reel" element={<CreateReelsPage />} />
                          <Route path="/cookies" element={<CookiePolicyPage />} />
                          <Route path="/community-guidelines" element={<CommunityGuidelinesPage />} />
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
        </AnimatePresence>
      </Suspense>

      <ScrollToTop />
      <CallOverlay />
      <PWAPrompt />
      <Toaster position="top-center" />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
