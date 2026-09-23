/**
 * Last-known user profile cache.
 *
 * Requirement: "offline startup → cached Home".
 *
 * When the app is launched without a network connection, Supabase can still
 * recover the persisted session locally (the JWT + refresh token live in
 * app-private storage), but the profile fetch (`get_my_profile` RPC /
 * `public_profiles` query) fails. Without a fallback the app would treat the
 * user as signed out and bounce them to the login screen — even though they
 * have a perfectly valid session.
 *
 * This module persists the last successfully-fetched profile so the app can
 * restore the Home experience offline. The cache is:
 *   - keyed per user id (never mixes accounts),
 *   - written on every successful profile fetch,
 *   - cleared on sign-out / account deletion (see `resetUserStores`).
 *
 * It reuses the same resilient storage adapter as the auth session, so it works
 * on native (Capacitor Preferences / SharedPreferences) and web (localStorage).
 */

import { createAuthStorage } from './authStorage';
import type { User } from '@/types';

const CACHE_PREFIX = 'gaga-profile-cache:';

/** Serialise a User for storage (Dates → ISO strings). */
function serialize(user: User): string {
  try {
    return JSON.stringify(user, (_key, value) => {
      if (value instanceof Date) return { __date: value.toISOString() };
      return value;
    });
  } catch {
    return '';
  }
}

/** Revive a stored User (ISO strings → Dates). */
function deserialize(raw: string): User | null {
  try {
    const parsed = JSON.parse(raw, (_key, value) => {
      if (value && typeof value === 'object' && typeof value.__date === 'string') {
        return new Date(value.__date);
      }
      return value;
    });
    if (parsed && typeof parsed === 'object' && typeof parsed.id === 'string') {
      return parsed as User;
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist the last-known profile for a user. Best-effort. */
export async function cacheUserProfile(user: User | null | undefined): Promise<void> {
  if (!user?.id) return;
  try {
    const storage = createAuthStorage();
    await storage.setItem(`${CACHE_PREFIX}${user.id}`, serialize(user));
  } catch {
    /* best-effort */
  }
}

/** Read the cached profile for a user, or null when absent/corrupt. */
export async function getCachedUserProfile(userId: string): Promise<User | null> {
  if (!userId) return null;
  try {
    const storage = createAuthStorage();
    const raw = await storage.getItem(`${CACHE_PREFIX}${userId}`);
    if (!raw) return null;
    return deserialize(raw);
  } catch {
    return null;
  }
}

/** Remove the cached profile for a user (sign-out / account deletion). */
export async function clearCachedUserProfile(userId: string): Promise<void> {
  if (!userId) return;
  try {
    const storage = createAuthStorage();
    await storage.removeItem(`${CACHE_PREFIX}${userId}`);
  } catch {
    /* best-effort */
  }
}
