/**
 * Imperative navigation bridge.
 *
 * React Router's `navigate()` is only available inside React components via the
 * `useNavigate()` hook. Some non-React modules (native push handlers, service
 * worker messages, notification taps) need to trigger navigation too. This tiny
 * registry lets `App.tsx` publish the live `navigate` function once, and any
 * module can then call `navigateTo(path)` without importing router internals.
 *
 * Using the real router (instead of mutating `window.location.hash`) is
 * important because the app uses `BrowserRouter`, where hash changes do NOT
 * trigger a route change.
 */

import type { NavigateFunction } from 'react-router-dom';

let navigateFn: NavigateFunction | null = null;

/** Called once from a component that has access to `useNavigate()`. */
export function registerNavigate(fn: NavigateFunction | null): void {
  navigateFn = fn;
}

/**
 * Navigate to an in-app path. Falls back to a hard location change when the
 * router has not registered yet (e.g. very early native cold-start events).
 */
export function navigateTo(path: string, opts?: { replace?: boolean }): void {
  if (!path) return;
  if (navigateFn) {
    navigateFn(path, opts?.replace ? { replace: true } : undefined);
    return;
  }
  // Fallback: push a history entry and let the router pick it up.
  try {
    if (opts?.replace) {
      window.history.replaceState({}, '', path);
    } else {
      window.history.pushState({}, '', path);
    }
    window.dispatchEvent(new PopStateEvent('popstate'));
  } catch {
    /* ignore */
  }
}
