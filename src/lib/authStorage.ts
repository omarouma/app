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
 * NOTE: This adapter is intentionally resilient — if the native plugin is not
 * available (e.g. running in a plain browser during development) it degrades to
 * `localStorage` without throwing.
 */

import { Capacitor } from '@capacitor/core';

export interface AuthStorageAdapter {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

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

const nativeStorage: AuthStorageAdapter = {
  getItem: async (key) => {
    const Preferences = await getPreferences();
    const { value } = await Preferences.get({ key });
    return value ?? null;
  },
  setItem: async (key, value) => {
    const Preferences = await getPreferences();
    await Preferences.set({ key, value });
  },
  removeItem: async (key) => {
    const Preferences = await getPreferences();
    await Preferences.remove({ key });
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
