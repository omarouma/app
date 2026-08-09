import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAnalytics, logEvent, type Analytics } from 'firebase/analytics';
import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging';
import { getPerformance, type FirebasePerformance } from 'firebase/performance';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';
import env from '@/config/env';

// Firebase config - populated from the validated env object
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
  // databaseURL is optional in the schema
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
};

// Re-export for internal use
export { firebaseConfig };

/** 
 * Check if Firebase is configured. 
 * With env.ts, we only need to check for the core API key.
 */
export function isFirebaseConfigured(): boolean {
  return !!firebaseConfig.apiKey;
}

let app: FirebaseApp | null = null;
let analytics: Analytics | null = null;
let messaging: Messaging | null = null;
let performance: FirebasePerformance | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

/** Initialize Firebase lazily. Safe to call multiple times. */
export function initFirebase() {
  if (!isFirebaseConfigured()) {
    if (env.DEV) {
      console.warn('[Firebase] Not configured. Core Firebase env vars are missing.');
    }
    return null;
  }
  if (app) return app;

  try {
    app = initializeApp(firebaseConfig);

    if (typeof window !== 'undefined') {
      try { auth = getAuth(app); } catch { /* noop */ }
      try { db = getFirestore(app); } catch { /* noop */ }

      // Only initialize Analytics/Performance in production
      if (env.PROD) {
        try { analytics = getAnalytics(app); } catch { /* noop */ }
        try { performance = getPerformance(app); } catch { /* noop */ }
      }
    }

    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && env.PROD) {
      try { messaging = getMessaging(app); } catch { /* noop */ }
    }

    if (env.DEV) {
      console.log('[Firebase] Initialized successfully (Analytics/Performance disabled in dev)');
    }
  } catch {
    console.error('[Firebase] Initialization failed');
  }

  return app;
}

/** Get Firebase Auth instance */
export function getFirebaseAuth(): Auth | null {
  initFirebase();
  return auth;
}

/** Get Firebase Firestore instance */
export function getFirestoreDB(): Firestore | null {
  initFirebase();
  return db;
}



/** Get the Firebase Analytics instance */
export function getFirebaseAnalytics(): Analytics | null {
  initFirebase();
  return analytics;
}

/** Get the Firebase Messaging instance */
export function getFirebaseMessaging(): Messaging | null {
  initFirebase();
  return messaging;
}

/** Get the Firebase Performance instance */
export function getFirebasePerformance(): FirebasePerformance | null {
  initFirebase();
  return performance;
}

/** Log a custom analytics event */
export function trackEvent(eventName: string, params?: Record<string, unknown>) {
  // Don't track in development
  if (env.DEV) return;
  if (!analytics) return;
  try {
    logEvent(analytics, eventName, params as Record<string, never>);
  } catch {
    // Silently fail if analytics is blocked
  }
}

/** Get the FCM token for the current device. Requires VAPID key. */
export async function getFcmToken(): Promise<string | null> {
  const msg = getFirebaseMessaging();
  if (!msg || !env.VITE_VAPID_PUBLIC_KEY) return null;

  try {
    const token = await getToken(msg, { vapidKey: env.VITE_VAPID_PUBLIC_KEY });
    return token || null;
  } catch {
    return null;
  }
}

/** Subscribe to foreground FCM messages */
export function onForegroundMessage(callback: (payload: { notification?: { title?: string; body?: string }; data?: Record<string, string> }) => void) {
  const msg = getFirebaseMessaging();
  if (!msg) return () => { };

  const unsubscribe = onMessage(msg, (payload) => {
    callback({
      notification: payload.notification
        ? {
          title: payload.notification.title,
          body: payload.notification.body,
        }
        : undefined,
      data: payload.data as Record<string, string> | undefined,
    });
  });

  return unsubscribe;
}

/** Delete the current FCM token (unsubscribe from push notifications) */
export async function deleteFcmToken(): Promise<void> {
  const msg = getFirebaseMessaging();
  if (!msg) return;
  try {
    const { deleteToken } = await import('firebase/messaging');
    await deleteToken(msg);
  } catch {
    // Ignore errors during deletion
  }
}

/** Track a page view in Firebase Analytics */
export function trackPageView(pageTitle: string, pagePath: string) {
  // Don't track in development
  if (env.DEV) return;
  trackEvent('page_view', {
    page_title: pageTitle,
    page_path: pagePath,
    page_location: typeof window !== 'undefined' ? window.location.href : undefined,
  });
}

/** Track user engagement time */
export function trackUserEngagement(engagementTimeMsec: number) {
  // Don't track in development
  if (env.DEV) return;
  trackEvent('user_engagement', { engagement_time_msec: engagementTimeMsec });
}

/** Track exceptions/errors */
export function trackError(description: string, fatal: boolean = false) {
  // Don't track in development
  if (env.DEV) return;
  trackEvent('exception', { description, fatal });
}