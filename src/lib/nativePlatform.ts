/*
  nativePlatform.ts — Capacitor native bridge for the GaGa Chat Android app.

  Responsibilities:
    • Detect whether we are running inside the native shell (Capacitor).
    • Configure StatusBar / SplashScreen / Keyboard / Haptics on startup.
    • Register for FCM push notifications and persist the device token to
      Supabase (`device_tokens` + `user_devices`) so the backend can deliver
      message / call / social pushes.
    • Route notification taps to the correct in-app screen.
    • Handle the Android hardware back button.

  Everything is guarded so the web/PWA build is completely unaffected.
*/
import { Capacitor } from '@capacitor/core';
import { getSupabaseSafe } from '@/lib/supabase';

export const isNative = (): boolean => Capacitor.isNativePlatform();
export const platform = (): string => Capacitor.getPlatform();

type NavigateFn = (path: string) => void;

let _navigate: NavigateFn | null = null;
let _pushInitialised = false;
let _currentUserId: string | null = null;

/** Called from App.tsx so notification taps can navigate. */
export function setNativeNavigator(fn: NavigateFn | null) {
  _navigate = fn;
}

function routeFromNotification(data: Record<string, unknown> | undefined) {
  if (!data || !_navigate) return;
  const type = String(data.type || '');
  const chatId = data.chatId || data.chat_id;
  const callId = data.callId || data.call_id;
  const postId = data.postId || data.post_id;
  const userId = data.userId || data.user_id;

  switch (type) {
    case 'message':
      if (chatId) _navigate(`/chat/${chatId}`);
      break;
    case 'call':
      if (callId) _navigate(`/call/${callId}`);
      break;
    case 'friend_request':
      _navigate('/friends');
      break;
    case 'timeline':
    case 'like':
    case 'comment':
      if (postId) _navigate(`/timeline?post=${postId}`);
      else _navigate('/timeline');
      break;
    case 'wallet':
    case 'tip':
      _navigate('/wallet');
      break;
    default:
      if (chatId) _navigate(`/chat/${chatId}`);
      else if (userId) _navigate(`/profile/${userId}`);
      break;
  }
}

/** Persist the FCM token to Supabase so the backend can target this device. */
async function persistDeviceToken(token: string, userId: string) {
  const supabase = getSupabaseSafe();
  if (!supabase) return;
  try {
    const deviceName = `${Capacitor.getPlatform()} device`;
    const payload = {
      user_id: userId,
      token,
      fcm_token: token,
      platform: Capacitor.getPlatform(),
      device_name: deviceName,
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
    };
    // Upsert on token so re-registration doesn't create duplicates.
    const { error } = await supabase
      .from('device_tokens')
      .upsert(payload, { onConflict: 'token' });
    if (error) {
      // Fall back to a plain insert if the unique constraint differs.
      await supabase.from('device_tokens').insert(payload);
    }

    // Mirror into user_devices (used by some backend RPCs).
    await supabase.from('user_devices').upsert(
      {
        user_id: userId,
        device_id: token,
        device_name: deviceName,
        platform: Capacitor.getPlatform(),
        app_version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0',
        push_token: token,
        last_seen_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: 'device_id' },
    );
  } catch (err) {
    console.debug('[native] device token persist skipped:', err instanceof Error ? err.message : String(err));
  }
}

/** Configure native chrome (status bar, splash, keyboard, back button). */
export async function configureNativeShell() {
  if (!isNative()) return;

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#00C853' });
      await StatusBar.setOverlaysWebView({ overlay: false });
    }
  } catch { /* plugin unavailable */ }

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 300 });
  } catch { /* plugin unavailable */ }

  try {
    const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard');
    await Keyboard.setResizeMode({ mode: KeyboardResize.Body });
  } catch { /* plugin unavailable */ }

  try {
    const { App: CapApp } = await import('@capacitor/app');
    CapApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack && window.history.length > 1) {
        window.history.back();
      } else {
        CapApp.exitApp();
      }
    });
    CapApp.addListener('appUrlOpen', ({ url }) => {
      try {
        const parsed = new URL(url);
        const path = parsed.pathname + parsed.search + parsed.hash;
        if (_navigate && path && path !== '/') _navigate(path);
      } catch { /* ignore malformed deep links */ }
    });
  } catch { /* plugin unavailable */ }
}

/** Register for push notifications and wire token + tap handlers. */
export async function initNativePush(userId: string | null) {
  if (!isNative() || _pushInitialised) return;
  _currentUserId = userId;
  _pushInitialised = true;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    const perm = await PushNotifications.checkPermissions();
    let receive = perm.receive;
    if (receive === 'prompt' || receive === 'prompt-with-rationale') {
      const req = await PushNotifications.requestPermissions();
      receive = req.receive;
    }
    if (receive !== 'granted') return;

    await PushNotifications.addListener('registration', (token) => {
      if (_currentUserId) void persistDeviceToken(token.value, _currentUserId);
    });

    await PushNotifications.addListener('registrationError', (err) => {
      console.debug('[native] push registration error:', err?.error);
    });

    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      // Foreground: the in-app notification system already handles display.
      console.debug('[native] push received:', notification?.title);
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      routeFromNotification(action?.notification?.data as Record<string, unknown>);
    });

    await PushNotifications.register();
  } catch (err) {
    console.debug('[native] push init skipped:', err instanceof Error ? err.message : String(err));
  }
}

/** Update the cached user id (e.g. after login) and re-register if needed. */
export async function setNativeUser(userId: string | null) {
  _currentUserId = userId;
  if (userId && isNative()) {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      await PushNotifications.register();
    } catch { /* ignore */ }
  }
}

/** Light haptic feedback helper (no-op on web). */
export async function hapticTap() {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch { /* ignore */ }
}
