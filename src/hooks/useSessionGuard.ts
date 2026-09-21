import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { isSessionValid } from '@/lib/supabaseAuth';
import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * Session-expiry guard.
 *
 * Periodically verifies that the current session is still valid on the server.
 * If the session has been revoked or the refresh token has expired, the user is
 * cleared from the store, which causes the router to redirect safely to login.
 *
 * Runs only while a user is present, and re-checks whenever the app returns to
 * the foreground (visibility change) so a long-backgrounded app recovers
 * gracefully instead of showing stale authenticated UI.
 */
export function useSessionGuard(intervalMs = 5 * 60 * 1000) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const checking = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured() || !user) return;

    let cancelled = false;

    const check = async () => {
      if (checking.current || cancelled) return;
      checking.current = true;
      try {
        const valid = await isSessionValid();
        if (!valid && !cancelled) {
          // Session revoked/expired → clear user; router redirects to login.
          setUser(null);
        }
      } finally {
        checking.current = false;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };

    const timer = window.setInterval(check, intervalMs);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, setUser, intervalMs]);
}
