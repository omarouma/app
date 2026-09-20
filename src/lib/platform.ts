/**
 * Platform detection helpers.
 *
 * GaGa Chat ships as a native Android app (Capacitor) and, historically, as a
 * web app. The native build must behave differently from the web build:
 *
 *  - Native: no marketing landing page. The app opens directly on the auth
 *    form and, once authenticated, drops straight into the main app.
 *  - Native: the onboarding carousel is skipped entirely.
 *  - Web:   keeps the landing page + onboarding flow for SEO / first-time UX.
 *
 * Detection is intentionally dependency-light: we read the Capacitor runtime
 * globals that the native bridge injects (`window.Capacitor`) and fall back to
 * a couple of well-known native markers. This keeps the helper usable even
 * before `@capacitor/core` has finished loading.
 */

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  platform?: string;
};

function getCapacitor(): CapacitorGlobal | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/**
 * True when the app is running inside a native Capacitor shell
 * (Android/iOS) rather than a regular browser tab.
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;

  const cap = getCapacitor();
  if (cap) {
    try {
      if (typeof cap.isNativePlatform === 'function') return cap.isNativePlatform();
      if (typeof cap.getPlatform === 'function') {
        const platform = cap.getPlatform();
        return platform === 'android' || platform === 'ios';
      }
      if (typeof cap.platform === 'string') {
        return cap.platform === 'android' || cap.platform === 'ios';
      }
    } catch {
      // fall through to heuristic detection
    }
  }

  // Heuristics for the native WebView before the bridge is ready.
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  if (protocol === 'capacitor:' || protocol === 'ionic:') return true;
  if (hostname === 'localhost' && protocol === 'https:' && /Android/i.test(navigator.userAgent)) {
    return true;
  }

  return false;
}

/** True specifically on the Android native shell. */
export function isAndroidApp(): boolean {
  if (!isNativeApp()) return false;
  const cap = getCapacitor();
  try {
    if (cap && typeof cap.getPlatform === 'function') return cap.getPlatform() === 'android';
  } catch {
    // ignore
  }
  return /Android/i.test(navigator.userAgent);
}

/** True specifically on the iOS native shell. */
export function isIOSApp(): boolean {
  if (!isNativeApp()) return false;
  const cap = getCapacitor();
  try {
    if (cap && typeof cap.getPlatform === 'function') return cap.getPlatform() === 'ios';
  } catch {
    // ignore
  }
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Whether the marketing landing page should be shown.
 * Never on native — native users go straight to the auth form.
 */
export function shouldShowLandingPage(): boolean {
  return !isNativeApp();
}

/**
 * Whether the onboarding carousel should be shown.
 * Never on native — native users go straight into the main app.
 */
export function shouldShowOnboarding(): boolean {
  return !isNativeApp();
}
