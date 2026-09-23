/**
 * Platform detection helpers.
 *
 * GaGa ships as a native Android app (Capacitor) and is also served as a
 * web app. Several features are web-only (service worker, PWA install prompt,
 * Google Tag Manager / GA4 / AdSense, canonical-domain redirects, SEO meta) and
 * must be disabled inside the native shell — otherwise they can wedge the
 * WebView (e.g. a service worker intercepting navigations) or waste bandwidth.
 *
 * All checks are defensive: they never throw, even when the Capacitor bridge is
 * unavailable (plain browser, SSR, tests).
 */

import { Capacitor } from '@capacitor/core';

/** True when running inside the native Android/iOS Capacitor shell. */
export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** True when running in a normal browser (web build). */
export function isWeb(): boolean {
  return !isNative();
}

/**
 * Resolves once the native bridge is ready.
 *
 * On native, Capacitor plugins are only usable after the `deviceready` event.
 * Calling a plugin before that can leave the returned promise pending forever,
 * which is exactly the class of bug that hangs app startup. On web this
 * resolves immediately.
 *
 * Always resolves — never rejects — and is bounded by a timeout so a missing
 * event can never block startup.
 */
export function whenNativeReady(timeoutMs = 3000): Promise<void> {
  if (!isNative()) return Promise.resolve();
  if (typeof document === 'undefined') return Promise.resolve();

  return new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      document.removeEventListener('deviceready', done);
      resolve();
    };

    // Capacitor fires `deviceready` on document. If it already fired (or the
    // bridge is ready), the listener simply never runs and the timeout wins.
    document.addEventListener('deviceready', done, { once: true });
    window.setTimeout(done, timeoutMs);
  });
}

/**
 * Races a promise against a timeout. Resolves with `fallback` when the timeout
 * elapses first, so a hung native bridge call can never block the caller.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const finish = (value: T) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    window.setTimeout(() => finish(fallback), timeoutMs);
    promise.then(
      (value) => finish(value),
      () => finish(fallback),
    );
  });
}
