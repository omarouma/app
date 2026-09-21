/**
 * Secure auth storage adapter for Supabase.
 *
 * On native Android (Capacitor) the session is persisted through
 * `@capacitor/preferences`, which is backed by Android SharedPreferences
 * (app-private storage). On the web it falls back to `localStorage`.
 *
 * Supabase's `auth.storage` expects a synchronous-or-async object with
 * `getItem`, `setItem` and `removeItem`. Capacitor Preferences is async, which
 * Supabase supports natively, so we expose the async API directly.
 *
 * RESILIENCE (critical):
 * Supabase's `initialize()` awaits `storage.getItem()` during session recovery.
 * If that promise never settles — which can happen when a Capacitor plugin is
 * invoked before the native bridge is ready, or when the bridge call is dropped
 * — the whole auth init chain stalls and the app is stuck on the loading screen
 * forever. Every native call below is therefore:
 *   1. deferred until the native bridge is ready (`whenNativeReady`), and
 *   2. bounded by a timeout that falls back to `localStorage`.
 *
 * The adapter is intentionally resilient — if the native plugin is not
 * available (e.g. running in a plain browser during development) it degrades to
 * `localStorage` without throwing.
 */

import { isNative, whenNativeReady, withTimeout } from '@/lib/platform';

export interface AuthStorageAdapter {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

/** How long a single native storage call may take before we fall back. */
const NATIVE_STORAGE_TIMEOUT_MS = 4000;

/** Lazily import the Preferences plugin so web bundles don't hard-depend on it. */
async function getPreferences() {
  const mod = await import('@capacitor/preferences');
  return mod.Preferences;
}

const webStorage: AuthStorageAdapter = {
  getItem: (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  },
  removeItem: (key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

/**
 * Native storage with a hard timeout + localStorage fallback.
 *
 * Reads prefer the native store but fall back to `localStorage` when the bridge
 * is slow/unavailable, so a session written by an earlier build (or by the web
 * build) is still recovered. Writes go to both stores so the fallback path
 * always has a usable copy.
 */
const nativeStorage: AuthStorageAdapter = {
  getItem: async (key) => {
    await whenNativeReady();
    const nativeValue = await withTimeout(
      (async () => {
        const Preferences = await getPreferences();
        const { value } = await Preferences.get({ key });
        return value ?? null;
      })(),
      NATIVE_STORAGE_TIMEOUT_MS,
      null,
    );
    if (nativeValue != null) return nativeValue;
    // Fallback: recover from localStorage (web build / previous install).
    return webStorage.getItem(key) as string | null;
  },
  setItem: async (key, value) => {
    // Always mirror to localStorage first — it is synchronous and cannot hang.
    webStorage.setItem(key, value);
    await whenNativeReady();
    await withTimeout(
      (async () => {
        const Preferences = await getPreferences();
        await Preferences.set({ key, value });
      })(),
      NATIVE_STORAGE_TIMEOUT_MS,
      undefined,
    );
  },
  removeItem: async (key) => {
    webStorage.removeItem(key);
    await whenNativeReady();
    await withTimeout(
      (async () => {
        const Preferences = await getPreferences();
        await Preferences.remove({ key });
      })(),
      NATIVE_STORAGE_TIMEOUT_MS,
      undefined,
    );
  },
};

/**
 * Returns the platform-appropriate auth storage adapter.
 * Native Android → Capacitor Preferences (app-private SharedPreferences).
 * Web → localStorage.
 */
export function createAuthStorage(): AuthStorageAdapter {
  return isNative() ? nativeStorage : webStorage;
}

/** Clear all persisted auth keys (used on hard sign-out / account deletion). */
export async function clearAuthStorage(storageKey = 'gaga-auth-token'): Promise<void> {
  const storage = createAuthStorage();
  try {
    await storage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
}
