/**
 * Native navigation integration.
 *
 * Wires the Android hardware/gesture back button and deep links into the
 * React Router history so the app behaves like a real native app:
 *
 *  - Back button: goes back in history when possible; on the root screen it
 *    minimises the app instead of closing it abruptly (standard Android
 *    behaviour for a top-level screen).
 *  - Deep links (`gagachat://…` and `https://gagachat.app/…`): routed through
 *    the SPA router so links open the right screen.
 *
 * Everything is best-effort and no-ops on web. The `@capacitor/app` plugin is
 * imported dynamically so it never lands on the web critical path.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isNative, whenNativeReady } from '@/lib/platform';

/** Screens where the back button should exit/minimise rather than navigate. */
const ROOT_PATHS = new Set(['/', '/chat', '/calls', '/contacts', '/settings']);

export function useNativeNavigation() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNative()) return;

    let disposed = false;
    const listeners: Array<{ remove: () => Promise<void> }> = [];

    const run = async () => {
      await whenNativeReady();
      if (disposed) return;

      try {
        const { App } = await import('@capacitor/app');

        // ── Hardware / gesture back button ──────────────────────────────
        const backListener = await App.addListener('backButton', ({ canGoBack }) => {
          const path = window.location.pathname;
          if (canGoBack && !ROOT_PATHS.has(path)) {
            navigate(-1);
          } else {
            // At a root screen: send the app to the background rather than
            // killing it, which is the expected Android behaviour.
            void App.minimizeApp();
          }
        });
        listeners.push(backListener);

        // ── Deep links ──────────────────────────────────────────────────
        const handleUrl = (rawUrl: string) => {
          try {
            const url = new URL(rawUrl);
            // gagachat://path?x=y  ->  host is the first segment
            const isCustomScheme = url.protocol === 'gagachat:';
            const path = isCustomScheme
              ? `/${url.host}${url.pathname}`
              : url.pathname;
            const target = `${path}${url.search}${url.hash}`;
            if (target && target !== '/') navigate(target);
          } catch {
            /* malformed deep link - ignore */
          }
        };

        const urlListener = await App.addListener('appUrlOpen', (event) => {
          handleUrl(event.url);
        });
        listeners.push(urlListener);

        // Cold start: when the app is launched *from* a deep link (rather than
        // already running), Android delivers the URL via getLaunchUrl() and the
        // `appUrlOpen` event does not fire. Handle it explicitly so a link that
        // opens the app cold still lands on the requested destination.
        try {
          const launch = await App.getLaunchUrl();
          if (launch?.url) handleUrl(launch.url);
        } catch {
          /* getLaunchUrl unavailable - ignore */
        }
      } catch {
        /* @capacitor/app unavailable — ignore */
      }
    };

    void run();

    return () => {
      disposed = true;
      for (const l of listeners) {
        void l.remove().catch(() => undefined);
      }
    };
  }, [navigate]);
}

export default useNativeNavigation;
