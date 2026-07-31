import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAnalytics, logEvent, type Analytics } from 'firebase/analytics';
import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging';
import { getPerformance, type FirebasePerformance } from 'firebase/performance';
import { getStorage, type FirebaseStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';

// Firebase config — all values are public and safe for the frontend
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Re-export for internal use
export { firebaseConfig };

/** Check if Firebase is configured (all required env vars present) */
export function isFirebaseConfigured(): boolean {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  );
}

let app: FirebaseApp | null = null;
let analytics: Analytics | null = null;
let messaging: Messaging | null = null;
let performance: FirebasePerformance | null = null;
let storage: FirebaseStorage | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

/** Initialize Firebase lazily. Safe to call multiple times. */
export function initFirebase() {
  if (!isFirebaseConfigured()) {
    if (import.meta.env.DEV) {
      console.warn('[Firebase] Not configured. Set VITE_FIREBASE_* env vars to enable Firebase services.');
    }
    return null;
  }
  if (app) return app;

  try {
    app = initializeApp(firebaseConfig);

    if (typeof window !== 'undefined') {
      try { auth = getAuth(app); } catch { /* noop */ }
      try { db = getFirestore(app); } catch { /* noop */ }
      try { storage = getStorage(app); } catch { /* noop */ }
      
      // Only initialize Analytics/Performance in production
      if (import.meta.env.PROD) {
        try { analytics = getAnalytics(app); } catch { /* noop */ }
        try { performance = getPerformance(app); } catch { /* noop */ }
      }
    }

    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.PROD) {
      try { messaging = getMessaging(app); } catch { /* noop */ }
    }

    if (import.meta.env.DEV) {
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

/** Get Firebase Storage instance */
export function getFirebaseStorage(): FirebaseStorage | null {
  initFirebase();
  return storage;
}

/** Upload a file to Firebase Storage. Returns the public download URL. */
export async function uploadToFirebaseStorage(
  filePath: string,
  file: File | Blob,
  contentType?: string
): Promise<string> {
  const fbStorage = getFirebaseStorage();
  if (!fbStorage) {
    throw new Error('Firebase Storage is not configured. Set VITE_FIREBASE_STORAGE_BUCKET in .env');
  }
  const fileRef = ref(fbStorage, filePath);
  await uploadBytes(fileRef, file, contentType ? { contentType } : undefined);
  return getDownloadURL(fileRef);
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
  if (import.meta.env.DEV) return;
  if (!analytics) return;
  try {
    logEvent(analytics, eventName, params as Record<string, never>);
  } catch {
    // Silently fail if analytics is blocked
  }
}

/** Get the FCM token for the current device. Requires VAPID key. */
export async function getFcmToken(vapidKey: string): Promise<string | null> {
  const msg = getFirebaseMessaging();
  if (!msg) return null;

  try {
    const token = await getToken(msg, { vapidKey });
    return token || null;
  } catch {
    return null;
  }
}

/** Subscribe to foreground FCM messages */
export function onForegroundMessage(callback: (payload: { notification?: { title?: string; body?: string }; data?: Record<string, string> }) => void) {
  const msg = getFirebaseMessaging();
  if (!msg) return () => {};

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
  if (import.meta.env.DEV) return;
  trackEvent('page_view', {
    page_title: pageTitle,
    page_path: pagePath,
    page_location: typeof window !== 'undefined' ? window.location.href : undefined,
  });
}

/** Track user engagement time */
export function trackUserEngagement(engagementTimeMsec: number) {
  // Don't track in development
  if (import.meta.env.DEV) return;
  trackEvent('user_engagement', { engagement_time_msec: engagementTimeMsec });
}

/** Track exceptions/errors */
export function trackError(description: string, fatal: boolean = false) {
  // Don't track in development
  if (import.meta.env.DEV) return;
  trackEvent('exception', { description, fatal });
}
