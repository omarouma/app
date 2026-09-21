/**
 * Native (Capacitor) bootstrap.
 *
 * Runs once on startup inside the native shell to:
 *  1. wait for the native bridge to be ready,
 *  2. configure the status bar to match the app chrome,
 *  3. hide the native splash screen once the React UI has painted.
 *
 * Every step is best-effort and timeout-bounded — a missing plugin or a slow
 * bridge must never block or crash startup. On web this hook is a no-op.
 */

import { useEffect } from 'react';
import { isNative, whenNativeReady, withTimeout } from '@/lib/platform';

export function useNativeBootstrap() {
  useEffect(() => {
    if (!isNative()) return;

    let cancelled = false;

    const run = async () => {
      await whenNativeReady();
      if (cancelled) return;

      // ── Status bar ────────────────────────────────────────────────────────
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        await withTimeout(
          (async () => {
            await StatusBar.setStyle({ style: Style.Light });
            await StatusBar.setBackgroundColor({ color: '#00C300' });
            await StatusBar.setOverlaysWebView({ overlay: false });
          })(),
          3000,
          undefined,
        );
      } catch {
        /* plugin unavailable — ignore */
      }

      // ── Splash screen ─────────────────────────────────────────────────────
      // Hide after the first paint so the user never sees a blank frame
      // between the native splash and the React UI.
      try {
        const { SplashScreen } = await import('@capacitor/splash-screen');
        await new Promise((r) => window.setTimeout(r, 120));
        await withTimeout(SplashScreen.hide(), 3000, undefined);
      } catch {
        /* plugin unavailable — ignore */
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);
}

export default useNativeBootstrap;
