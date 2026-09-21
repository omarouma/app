import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useIsMounted } from './use-mobile';
import env from '@/config/env';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

// Read once at module load — never changes at runtime
const GA_MEASUREMENT_ID = env.VITE_GA_MEASUREMENT_ID as string | undefined;

export function useGATracking() {
  const location = useLocation();
  const isMounted = useIsMounted();

  useEffect(() => {
    if (!isMounted || !window.gtag || !GA_MEASUREMENT_ID) return;
    window.gtag('event', 'page_view', {
      page_path: location.pathname + location.search,
      page_location: window.location.href,
      page_title: document.title,
      send_to: GA_MEASUREMENT_ID,
    });
  }, [location, isMounted]);
}

export function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean | undefined>
) {
  if (typeof window === 'undefined' || !window.gtag || !GA_MEASUREMENT_ID) return;
  window.gtag('event', eventName, { send_to: GA_MEASUREMENT_ID, ...params });
}

/**
 * Track user engagement events.
 */
export const gaEvents = {
  /** User signed up */
  signUp: (method: string) => trackEvent('sign_up', { method }),

  /** User logged in */
  login: (method: string) => trackEvent('login', { method }),

  /** User sent a message */
  messageSent: (type: 'text' | 'image' | 'video' | 'voice' | 'file' | 'sticker') =>
    trackEvent('message_sent', { message_type: type }),

  /** User started a call */
  callStarted: (type: 'voice' | 'video') =>
    trackEvent('call_started', { call_type: type }),













  /** User chatted with AI */
  aiChatUsed: (category: string) =>
    trackEvent('ai_chat_used', { category }),


  /** User made a transaction */
  transaction: (type: string, amount: number, currency: string) =>
    trackEvent('purchase', { transaction_type: type, value: amount, currency }),

  /** User searched */
  search: (query: string, category: string) =>
    trackEvent('search', { search_term: query, search_category: category }),

  /** User invited a friend */
  inviteSent: (method: string) => trackEvent('invite_sent', { method }),






  /** User opened wallet */
  walletOpened: () => trackEvent('wallet_opened'),

  /** User opened premium page */
  premiumViewed: () => trackEvent('premium_viewed'),

  /** User subscribed to premium */
  premiumSubscribed: (plan: string, price: number) =>
    trackEvent('premium_subscribed', { plan, price }),

  /** User opened settings */
  settingsOpened: () => trackEvent('settings_opened'),

  /** User changed language */
  languageChanged: (lang: string) =>
    trackEvent('language_changed', { language: lang }),

  /** App opened via PWA */
  pwaOpened: () => trackEvent('pwa_opened'),

  /** Notification received */
  notificationReceived: (type: string) =>
    trackEvent('notification_received', { notification_type: type }),

  /** Notification clicked */
  notificationClicked: (type: string) =>
    trackEvent('notification_clicked', { notification_type: type }),
};

export default useGATracking;