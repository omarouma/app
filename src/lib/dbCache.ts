/**
 * Database Cache — TTL-based caching layer for frequently accessed data.
 *
 * Reduces database load by caching user profiles, chat metadata, and other
 * frequently queried data with a configurable TTL.
 */

interface CacheEntry<T> {
  data: T;
  expires: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get a cached value if it exists and hasn't expired.
 */
export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

/**
 * Set a value in the cache with a TTL.
 */
export function setCached<T>(key: string, data: T, ttlMs = DEFAULT_TTL): void {
  cache.set(key, { data, expires: Date.now() + ttlMs });
}

/**
 * Fetch data with caching — returns cached value if fresh, otherwise fetches
 * and caches the result.
 */
export async function fetchCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = DEFAULT_TTL,
): Promise<T> {
  const cached = getCached<T>(key);
  if (cached !== null) return cached;

  const data = await fetcher();
  setCached(key, data, ttlMs);
  return data;
}

/**
 * Invalidate a specific cache key.
 */
export function invalidateCache(key: string): void {
  cache.delete(key);
}

/**
 * Invalidate all cache keys matching a prefix pattern.
 */
export function invalidateCachePrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/**
 * Clear the entire cache.
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Get the current cache size.
 */
export function getCacheSize(): number {
  return cache.size;
}

/**
 * Cache key helpers for common data types.
 */
export const cacheKeys = {
  user: (userId: string) => `user_${userId}`,
  chat: (chatId: string) => `chat_${chatId}`,
  friends: (userId: string) => `friends_${userId}`,
  chatList: (userId: string) => `chat_list_${userId}`,
  messages: (chatId: string) => `messages_${chatId}`,
  notifications: (userId: string) => `notifications_${userId}`,
  callHistory: (userId: string) => `call_history_${userId}`,
};