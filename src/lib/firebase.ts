import { initializeApp, type FirebaseApp } from 'firebase/app';
import type { Analytics } from 'firebase/analytics';
import type { Messaging } from 'firebase/messaging';
import type { FirebasePerformance } from 'firebase/performance';
import type { Firestore } from 'firebase/firestore';
import type { Auth } from 'firebase/auth';
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
let servicesPromise: Promise<void> | null = null;

/**
 * Loads the Firebase service submodules (auth, firestore, analytics,
 * performance, messaging) in the background via dynamic imports.
 *
 * PERFORMANCE: only the small `firebase/app` core is bundled into the
 * critical path. The ~300KB of service code is split into async chunks
 * that load after first paint instead of blocking app startup.
 */
function loadServices(appInstance: FirebaseApp): Promise<void> {
  if (servicesPromise) return servicesPromise;

  servicesPromise = (async () => {
    if (typeof window === 'undefined') return;

    // Auth + Firestore are used by call signaling fallbacks — load first.
    try {
      const [{ getAuth }, { getFirestore }] = await Promise.all([
        import('firebase/auth'),
        import('firebase/firestore'),
      ]);
      try { auth = getAuth(appInstance); } catch { /* noop */ }
      try { db = getFirestore(appInstance); } catch { /* noop */ }
    } catch { /* noop */ }

    // Analytics/Performance only in production
    if (env.PROD) {
      try {
        const [{ getAnalytics }, { getPerformance }] = await Promise.all([
          import('firebase/analytics'),
          import('firebase/performance'),
        ]);
        try { analytics = getAnalytics(appInstance); } catch { /* noop */ }
        try { performance = getPerformance(appInstance); } catch { /* noop */ }
      } catch { /* noop */ }

      if ('serviceWorker' in navigator) {
        try {
          const { getMessaging } = await import('firebase/messaging');
          try { messaging = getMessaging(appInstance); } catch { /* noop */ }
        } catch { /* noop */ }
      }
    }
  })();

  return servicesPromise;
}

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
    // Kick off background loading of service submodules (non-blocking)
    void loadServices(app);

    if (env.DEV) {
      console.log('[Firebase] Initialized successfully (services loading in background)');
    }
  } catch {
    console.error('[Firebase] Initialization failed');
  }

  return app;
}

/** Resolve once Firebase service submodules have finished loading. */
export function firebaseServicesReady(): Promise<void> {
  initFirebase();
  return servicesPromise ?? Promise.resolve();
}

/** Get Firebase Auth instance (null until background services load) */
export function getFirebaseAuth(): Auth | null {
  initFirebase();
  return auth;
}

/** Get Firebase Firestore instance (null until background services load) */
export function getFirestoreDB(): Firestore | null {
  initFirebase();
  return db;
}

/** Get the Firebase Analytics instance (null until background services load) */
export function getFirebaseAnalytics(): Analytics | null {
  initFirebase();
  return analytics;
}

/** Get the Firebase Messaging instance (null until background services load) */
export function getFirebaseMessaging(): Messaging | null {
  initFirebase();
  return messaging;
}

/** Get the Firebase Performance instance (null until background services load) */
export function getFirebasePerformance(): FirebasePerformance | null {
  initFirebase();
  return performance;
}

/** Log a custom analytics event */
export function trackEvent(eventName: string, params?: Record<string, unknown>) {
  // Don't track in development
  if (env.DEV) return;
  // Buffer onto the services promise so early events aren't lost
  void firebaseServicesReady().then(async () => {
    if (!analytics) return;
    try {
      const { logEvent } = await import('firebase/analytics');
      logEvent(analytics, eventName, params as Record<string, never>);
    } catch {
      // Silently fail if analytics is blocked
    }
  });
}

/** Get the FCM token for the current device. Requires VAPID key. */
export async function getFcmToken(): Promise<string | null> {
  initFirebase();
  await firebaseServicesReady();
  if (!messaging || !env.VITE_VAPID_PUBLIC_KEY) return null;

  try {
    const { getToken } = await import('firebase/messaging');
    const token = await getToken(messaging, { vapidKey: env.VITE_VAPID_PUBLIC_KEY });
    return token || null;
  } catch {
    return null;
  }
}

/** Subscribe to foreground FCM messages */
export function onForegroundMessage(callback: (payload: { notification?: { title?: string; body?: string }; data?: Record<string, string> }) => void) {
  initFirebase();
  let unsubscribe: () => void = () => { };
  let cancelled = false;

  void firebaseServicesReady().then(async () => {
    if (cancelled || !messaging) return;
    try {
      const { onMessage } = await import('firebase/messaging');
      if (cancelled || !messaging) return;
      unsubscribe = onMessage(messaging, (payload) => {
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
    } catch { /* noop */ }
  });

  return () => {
    cancelled = true;
    unsubscribe();
  };
}

/** Delete the current FCM token (unsubscribe from push notifications) */
export async function deleteFcmToken(): Promise<void> {
  initFirebase();
  await firebaseServicesReady();
  if (!messaging) return;
  try {
    const { deleteToken } = await import('firebase/messaging');
    await deleteToken(messaging);
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
