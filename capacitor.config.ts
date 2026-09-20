import type { CapacitorConfig } from '@capacitor/cli';

/**
 * GaGa Chat — native Android configuration.
 *
 * The web build is bundled into the APK/AAB (`webDir: dist`) and served from
 * the local `https://localhost` origin inside the WebView. Only the remote
 * hosts the app genuinely needs (Supabase, ZEGO, Firebase/Google) are allowed
 * to be navigated to; everything else stays inside the bundled app.
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
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
