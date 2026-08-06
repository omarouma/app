import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  getFirebaseAnalytics,
  trackPageView,
  trackEvent,
  trackUserEngagement,
} from '@/lib/firebase';

// Guard to avoid double-tracking page_views: GA4 (via GTM/useGATracking) is the
// primary page-view tracker. If GA4 is configured, skip Firebase's page_view
// to prevent redundant, concurrent analytics beacons (a contributor to
// net::ERR_INSUFFICIENT_RESOURCES). Custom events/engagement are still tracked.
// Read once at module load.
const GA_MEASUREMENT_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined) || '';

/** Track page views automatically on route changes */
export function usePageTracking() {
  const location = useLocation();
  const lastTrackedRef = useRef<{ path: string; at: number }>({ path: '', at: 0 });

  useEffect(() => {
    const analytics = getFirebaseAnalytics();
    if (!analytics) return;

    // If GA4 is present, it already handles page_view — skip Firebase's to
    // avoid double-counting each route. Custom events below are unaffected.
    if (GA_MEASUREMENT_ID) return;

    const pagePath = location.pathname + location.search;
    const pageTitle = document.title || 'GaGa Chat';
    const now = Date.now();

    // Light debounce for the Firebase fallback path too.
    if (lastTrackedRef.current.path === pagePath && now - lastTrackedRef.current.at < 500) return;
    lastTrackedRef.current = { path: pagePath, at: now };

    trackPageView(pageTitle, pagePath);
  }, [location]);
}

/** Track user engagement time (send when user leaves page) */
export function useEngagementTracking() {
  const startTime = useRef<number>(0);

  useEffect(() => {
    startTime.current = Date.now();
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const engagementTime = Date.now() - startTime.current;
      if (engagementTime > 1000) {
        trackUserEngagement(engagementTime);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        const engagementTime = Date.now() - startTime.current;
        if (engagementTime > 1000) {
          trackUserEngagement(engagementTime);
        }
      } else {
        startTime.current = Date.now();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);
}

/** Track a custom event */
export function useAnalytics() {
  return {
    logEvent: (name: string, params?: Record<string, unknown>) => {
      trackEvent(name, params);
    },
    logLogin: (method: string) => {
      trackEvent('login', { method });
    },
    logSignUp: (method: string) => {
      trackEvent('sign_up', { method });
    },
    logShare: (contentType: string, itemId: string) => {
      trackEvent('share', { content_type: contentType, item_id: itemId });
    },
    logSearch: (searchTerm: string) => {
      trackEvent('search', { search_term: searchTerm });
    },
    logSelectContent: (contentType: string, itemId: string) => {
      trackEvent('select_content', { content_type: contentType, item_id: itemId });
    },
    logCall: (type: 'voice' | 'video', duration?: number) => {
      trackEvent('call', { call_type: type, duration_sec: duration });
    },
    logMessageSent: (type: string) => {
      trackEvent('message_sent', { message_type: type });
    },
    logFriendRequest: (action: 'send' | 'accept' | 'reject') => {
      trackEvent('friend_request', { action });
    },
    logWalletAction: (action: 'deposit' | 'withdraw' | 'transfer' | 'convert', currency: string) => {
      trackEvent('wallet_action', { action, currency });
    },
  };
}
