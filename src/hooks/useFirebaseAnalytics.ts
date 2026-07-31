import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  getFirebaseAnalytics,
  trackPageView,
  trackEvent,
  trackUserEngagement,
} from '@/lib/firebase';

/** Track page views automatically on route changes */
export function usePageTracking() {
  const location = useLocation();

  useEffect(() => {
    const analytics = getFirebaseAnalytics();
    if (!analytics) return;
    const pagePath = location.pathname + location.search;
    const pageTitle = document.title || 'GaGa Chat';
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
