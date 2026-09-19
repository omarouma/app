import type { CapacitorConfig } from '@capacitor/cli';

/**
 * GaGa Chat — Capacitor configuration
 *
 * The web app (Vite `dist/`) is bundled into the native Android shell.
 * `appId` MUST match the Android client registered in Firebase
 * (google-services.json → package_name) so FCM / Google Sign-In work.
 */
const config: CapacitorConfig = {
  appId: 'gagachat.app',
  appName: 'GaGa Chat',
  webDir: 'dist',
  bundledWebRuntime: false,
  backgroundColor: '#00C853',
  android: {
    backgroundColor: '#00C853',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#00C853',
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
      style: 'dark',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#00C853',
      overlaysWebView: false,
    },
  },
};

export default config;
