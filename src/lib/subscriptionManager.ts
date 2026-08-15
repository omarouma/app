/**
 * Subscription Manager — deduplicates real-time subscriptions.
 *
 * Multiple components may subscribe to the same collection/filter. Instead of
 * creating a new Supabase Realtime channel for each, this manager uses
 * ref-counting so only ONE channel is opened per unique key. When the last
 * subscriber unsubscribes, the channel is closed.
 */

type UnsubscribeFn = () => void;

interface SubscriptionEntry {
  unsub: UnsubscribeFn;
  count: number;
}

const subscriptions = new Map<string, SubscriptionEntry>();

/**
 * Subscribe to a data source with deduplication.
 *
 * @param key Unique key identifying the subscription (e.g. `chats:user-123`)
 * @param subscribeFn Function that creates the actual subscription and returns an unsubscribe function
 * @returns An unsubscribe function that decrements the ref count
 */
export function subscribeDeduped(
  key: string,
  subscribeFn: () => UnsubscribeFn,
): UnsubscribeFn {
  const existing = subscriptions.get(key);
  if (existing) {
    existing.count++;
    return () => unsubscribeDeduped(key);
  }

  const unsub = subscribeFn();
  subscriptions.set(key, { unsub, count: 1 });
  return () => unsubscribeDeduped(key);
}

function unsubscribeDeduped(key: string): void {
  const entry = subscriptions.get(key);
  if (!entry) return;

  entry.count--;
  if (entry.count <= 0) {
    try {
      entry.unsub();
    } catch {
      // ignore cleanup errors
    }
    subscriptions.delete(key);
  }
}

/**
 * Get the current number of active subscriptions.
 */
export function getActiveSubscriptionCount(): number {
  return subscriptions.size;
}

/**
 * Clear all subscriptions (useful for tests or logout).
 */
export function clearAllSubscriptions(): void {
  for (const [, entry] of subscriptions) {
    try {
      entry.unsub();
    } catch {
      // ignore cleanup errors
    }
  }
  subscriptions.clear();
}