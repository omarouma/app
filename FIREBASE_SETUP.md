# GaGa Chat — Firebase Hybrid Setup Guide

This guide walks you through configuring Firebase services to work alongside your existing Supabase backend.

**What you're adding:**
- **Firebase Cloud Messaging (FCM)** — Push notifications (replaces custom Web Push)
- **Firebase Analytics** — User behavior insights, page views, events
- **Firebase Performance Monitoring** — App performance tracking

**What stays on Supabase:**
- Authentication (email, phone, Google OAuth)
- PostgreSQL database (chats, messages, friends, wallets, etc.)
- Realtime subscriptions
- Storage (avatars, posts, media, voice)
- WebRTC signaling

---

## Step 1: Create a Firebase Web App

1. Go to **https://console.firebase.google.com/project/oumagachat**
2. In the Project Overview, click the **settings gear** → **Project settings**
3. Under **Your apps**, click **Add app** → **Web**
4. Register the app with a nickname (e.g., `GaGa Chat Web`)
5. **Check the box** for "Also set up Firebase Hosting" (or skip it — you already have Firebase Hosting configured)
6. Click **Register app**

You'll see a `firebaseConfig` object. Copy these values — you'll need them in the next step.

---

## Step 2: Add Firebase Config to Your .env File

Copy `.env.example` to `.env` and fill in the Firebase values from Step 1:

```env
# ============================================
# Firebase Configuration (Hybrid Setup)
# ============================================

VITE_FIREBASE_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_FIREBASE_AUTH_DOMAIN=oumagachat.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=oumagachat
VITE_FIREBASE_STORAGE_BUCKET=oumagachat.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef1234567890
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX

# FCM VAPID Key (see Step 3 below)
VITE_FIREBASE_VAPID_KEY=BLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> **Security Note:** All Firebase web config values are **public** and safe to expose in the frontend. The API key is restricted to your domain by default in Firebase Console.

---

## Step 3: Get the FCM VAPID Key (Required for Push Notifications)

1. In Firebase Console, go to **Project Settings** → **Cloud Messaging** tab
2. Scroll to **Web Push certificates**
3. Click **Generate key pair** (if none exists)
4. Copy the **Key pair** value (starts with `BL`...)
5. Paste it into your `.env` as `VITE_FIREBASE_VAPID_KEY`

---

## Step 4: Enable Firebase Services

### 4a. Firebase Analytics
1. In Firebase Console, go to **Analytics** → **Dashboard**
2. Click **Get started** / **Enable Analytics**
3. Select your **Google Analytics account** or create a new one
4. Accept the terms
5. Analytics will start collecting data automatically

### 4b. Firebase Performance Monitoring
1. In Firebase Console, go to **Performance** → **Dashboard**
2. Click **Get started**
3. Performance monitoring will begin automatically once the app is deployed

### 4c. Firebase Cloud Messaging
1. In Firebase Console, go to **Cloud Messaging** → **Notifications**
2. Click **Send your first message** (or just verify the tab is accessible)
3. FCM is now ready to receive tokens from your app

---

## Step 5: Build and Deploy

After filling in the `.env` file:

```bash
npm run build
firebase deploy --only hosting
```

The post-build script will automatically inject the Firebase config into the service worker (`dist/sw.js`), so FCM background notifications work.

---

## Step 6: Test Firebase Integration

### Test Analytics
1. Open your deployed app: **https://oumagachat.web.app**
2. Navigate to a few pages
3. In Firebase Console, go to **Analytics** → **Realtime** — you should see active users within a few minutes

### Test FCM Push Notifications
1. Open the app in a browser
2. Go to **Settings → Notifications** (or wherever your app requests notification permission)
3. Allow notifications when prompted
4. In Firebase Console, go to **Cloud Messaging** → **Notifications** → **New notification**
5. Target: Select **Test on device**
6. Add the FCM token from the browser (you can get it from the console in DevTools — look for `[FCM] Token:`)
7. Send a test notification
8. You should see a notification even if the app is in the background

### Test Performance Monitoring
1. Use the app normally
2. In Firebase Console, go to **Performance** → **Dashboard**
3. Data should appear within a few hours

---

## How It Works

### Architecture
```
┌─────────────────┐
│   GaGa Chat     │  React 19 + Vite PWA
│   (Frontend)    │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───┴───┐ ┌───┴──────────┐
│Supabase│ │   Firebase   │
│ Auth   │ │  Analytics   │
│ DB     │ │  FCM (Push)  │
│ Storage│ │  Performance │
│Realtime│ └──────────────┘
└────────┘
```

### File Changes Summary

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/firebase.ts` | **New** | Firebase initialization, analytics, FCM, performance |
| `src/hooks/usePushNotifications.ts` | **Rewritten** | Now uses FCM (with Web Push fallback) |
| `src/hooks/useFirebaseAnalytics.ts` | **New** | Page tracking, engagement tracking, custom events |
| `public/sw.js` | **Updated** | Added FCM background handler + legacy fallback |
| `scripts/post-build.cjs` | **Updated** | Injects Firebase config into service worker at build |
| `src/main.tsx` | **Updated** | Calls `initFirebase()` before React renders |
| `src/App.tsx` | **Updated** | Uses `usePageTracking()` and `useEngagementTracking()` |
| `src/components/ErrorBoundary.tsx` | **Updated** | Tracks errors in Firebase Analytics |
| `vite.config.ts` | **Updated** | Added `firebase` vendor chunk for optimal loading |
| `.env.example` | **Updated** | Added Firebase config variables |

### What Happens When Firebase Is Not Configured?

If the Firebase env vars are missing, the app **gracefully degrades**:
- Push notifications fall back to the legacy Web Push API
- Analytics simply doesn't track (no errors)
- Performance monitoring is skipped
- All Supabase features continue to work normally

This means you can deploy the app **without Firebase** and it will still function. Firebase is an enhancement, not a requirement.

---

## Custom Events Tracked

The app automatically tracks these events via Firebase Analytics:

| Event | When Fired | Parameters |
|-------|-----------|------------|
| `page_view` | On every route change | `page_title`, `page_path`, `page_location` |
| `user_engagement` | When user leaves page | `engagement_time_msec` |
| `login` | When user logs in | `method` (email, phone, google) |
| `sign_up` | When user signs up | `method` (email, phone) |
| `push_notification_subscribed` | When user enables notifications | `method` (fcm, web_push) |
| `message_sent` | When a message is sent | `message_type` (text, image, etc.) |
| `call` | When a voice/video call starts | `call_type`, `duration_sec` |
| `friend_request` | When a friend request is sent/accepted/rejected | `action` |
| `wallet_action` | When a wallet action occurs | `action`, `currency` |
| `exception` | When a React error boundary catches an error | `description`, `fatal` |

You can also use the `useAnalytics()` hook anywhere in your app to track custom events:

```tsx
import { useAnalytics } from '@/hooks/useFirebaseAnalytics';

function MyComponent() {
  const { logEvent, logCall } = useAnalytics();

  const handleSomething = () => {
    logEvent('custom_event', { my_param: 'value' });
  };
}
```

---

## Troubleshooting

### "Firebase config not found" in console
- Make sure `.env` has the Firebase values
- Restart the dev server after editing `.env`
- Verify variable names start with `VITE_` (required for Vite)

### Push notifications not working
- Check that `VITE_FIREBASE_VAPID_KEY` is set correctly
- Verify the service worker is registered (`/sw.js` loads without errors)
- Ensure you're using HTTPS (required for notifications)
- Check browser permissions for notifications
- Test on a real device — some desktop browsers block notifications

### Analytics not showing data
- Analytics data can take a few minutes to appear in Firebase Console
- Ad blockers may block analytics — test with extensions disabled
- Verify the `measurementId` is correct

### Service worker not updating
- The app already handles this: it shows a toast when a new version is available
- Click "Update Now" to activate the new service worker
- Or manually unregister the SW in DevTools → Application → Service Workers

---

## Next Steps After Setup

1. **Set up a server-side FCM sender** (optional but recommended for production)
   - Use Firebase Admin SDK in a Cloud Function or your own backend
   - Send notifications programmatically when messages are received, calls come in, etc.
   - This requires the Firebase Admin SDK (Node.js) and service account credentials

2. **Add Firebase Remote Config** (optional)
   - Feature flags without redeploying
   - A/B testing for UI changes

3. **Add Firebase App Check** (optional, recommended for security)
   - Protect your backend APIs from abuse
   - Verify requests are coming from your authentic app

---

## Firebase Console Quick Links

| Service | Console URL |
|---------|------------|
| Project Settings | https://console.firebase.google.com/project/oumagachat/settings/general |
| Cloud Messaging | https://console.firebase.google.com/project/oumagachat/cloudmessaging |
| Analytics | https://console.firebase.google.com/project/oumagachat/analytics |
| Performance | https://console.firebase.google.com/project/oumagachat/performance |
| Hosting | https://console.firebase.google.com/project/oumagachat/hosting |

---

**Done!** Once you complete Steps 1-5, your GaGa Chat app will have Firebase Analytics, FCM Push Notifications, and Performance Monitoring running alongside your existing Supabase backend.
