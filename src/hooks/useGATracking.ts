import { useEffect, useRef } from 'react';
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

// Debounce page_view beacons so rapid route churn doesn't flood GA with
// concurrent analytics requests. This keeps GA functional while reducing the
// beacon flood that contributed to net::ERR_INSUFFICIENT_RESOURCES.
const PAGE_VIEW_DEBOUNCE_MS = 500;
const lastPageViewRef: { path: string; at: number } = { path: '', at: 0 };

export function useGATracking() {
  const location = useLocation();
  const isMounted = useIsMounted();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isMounted || !window.gtag || !GA_MEASUREMENT_ID) return;

    const path = location.pathname + location.search;
    const now = Date.now();

    // Guard: skip if the same page_view was already sent very recently.
    if (lastPageViewRef.path === path && now - lastPageViewRef.at < PAGE_VIEW_DEBOUNCE_MS) {
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      lastPageViewRef.path = path;
      lastPageViewRef.at = Date.now();
      window.gtag?.('event', 'page_view', {
        page_path: path,
        page_location: window.location.href,
        page_title: document.title,
        send_to: GA_MEASUREMENT_ID,
      });
    }, PAGE_VIEW_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
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

  /** User created a post */
  postCreated: (hasMedia: boolean, visibility: string) =>
    trackEvent('post_created', { has_media: hasMedia, visibility }),

  /** User liked a post */
  postLiked: () => trackEvent('post_liked'),

  /** User commented on a post */
  postCommented: () => trackEvent('post_commented'),

  /** User shared a post */
  postShared: () => trackEvent('post_shared'),

  /** User viewed reels */
  reelViewed: (durationSeconds?: number) =>
    trackEvent('reel_viewed', { duration_seconds: durationSeconds }),

  /** User created a reel */
  reelCreated: () => trackEvent('reel_created'),

  /** User opened YouTube videos tab */
  youtubeTabOpened: () => trackEvent('youtube_tab_opened'),

  /** User watched a YouTube video */
  youtubeVideoPlayed: (videoId: string) =>
    trackEvent('youtube_video_played', { video_id: videoId }),

  /** User joined a voice room */
  voiceRoomJoined: (roomId: string) =>
    trackEvent('voice_room_joined', { room_id: roomId }),

  /** User created a voice room */
  voiceRoomCreated: () => trackEvent('voice_room_created'),

  /** User completed a daily challenge */
  challengeCompleted: (challengeId: string) =>
    trackEvent('challenge_completed', { challenge_id: challengeId }),

  /** User checked in daily */
  dailyCheckIn: (streak: number) =>
    trackEvent('daily_checkin', { streak_days: streak }),

  /** User chatted with AI */
  aiChatUsed: (category: string) =>
    trackEvent('ai_chat_used', { category }),

  /** User tipped a creator */
  tipSent: (amount: number, currency: string) =>
    trackEvent('tip_sent', { amount, currency }),

  /** User made a transaction */
  transaction: (type: string, amount: number, currency: string) =>
    trackEvent('purchase', { transaction_type: type, value: amount, currency }),

  /** User searched */
  search: (query: string, category: string) =>
    trackEvent('search', { search_term: query, search_category: category }),

  /** User invited a friend */
  inviteSent: (method: string) => trackEvent('invite_sent', { method }),

  /** User opened a story */
  storyViewed: (userId: string) =>
    trackEvent('story_viewed', { story_owner_id: userId }),

  /** User opened marketplace */
  marketplaceViewed: () => trackEvent('marketplace_viewed'),

  /** User listed an item */
  itemListed: () => trackEvent('item_listed'),

  /** User opened events */
  eventsViewed: () => trackEvent('events_viewed'),

  /** User created an event */
  eventCreated: () => trackEvent('event_created'),

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