import type { CapacitorConfig } from '@capacitor/cli';

/**
 * GaGa Chat — Capacitor configuration
 *
 * Wraps the production Vite build (dist/) in a native Android shell.
 * The web app talks to Supabase (Postgres + Realtime + Auth + Storage)
 * and ZEGO Cloud for audio/video calling, so no local server is required.
 */
const config: CapacitorConfig = {
  appId: 'gagachat.app',
  appName: 'GaGa Chat',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#0B0B0F',
  },
  server: {
    androidScheme: 'https',
    // Allow the WebView to reach Supabase + ZEGO over https/wss.
    allowNavigation: [
      '*.supabase.co',
      '*.zegocloud.com',
      '*.zegocdn.com',
      '*.firebaseapp.com',
      '*.googleapis.com',
      'accounts.google.com',
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#0B0B0F',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
