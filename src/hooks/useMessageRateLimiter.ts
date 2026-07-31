/**
 * Sliding-window rate limiter for messages and friend requests.
 * 
 * Usage:
 * ```ts
 * const messageLimiter = createRateLimiter(20, 10_000); // 20 messages per 10 seconds
 * const friendLimiter = createRateLimiter(3, 60_000);   // 3 requests per minute
 * 
 * if (messageLimiter.canProceed()) {
 *   // send message
 * } else {
 *   // show rate limit error
 * }
 * ```
 */

export interface RateLimiter {
  /** Returns true if the action is allowed, false if rate limited */
  canProceed: () => boolean;
  /** Returns the number of remaining actions in the current window */
  remaining: () => number;
  /** Returns the time in ms until the next action can be taken */
  timeUntilNextSlot: () => number;
  /** Records an action (called automatically by canProceed when it returns true) */
  recordAction: () => void;
  /** Resets the limiter state */
  reset: () => void;
}

interface RateLimitEntry {
  timestamp: number;
}

/**
 * Creates a sliding-window rate limiter.
 * @param maxActions - Maximum number of actions allowed in the window
 * @param windowMs - Time window in milliseconds
 * @param storageKey - Optional localStorage key for persistence across page loads
 */
export function createRateLimiter(
  maxActions: number,
  windowMs: number,
  storageKey?: string,
): RateLimiter {
  let entries: RateLimitEntry[] = loadEntries(storageKey);

  function loadEntries(key?: string): RateLimitEntry[] {
    if (!key) return [];
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as RateLimitEntry[];
      // Filter out expired entries
      const now = Date.now();
      return parsed.filter(e => now - e.timestamp < windowMs);
    } catch {
      return [];
    }
  }

  function saveEntries(key?: string) {
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(entries));
    } catch {
      // Ignore storage errors
    }
  }

  function prune() {
    const now = Date.now();
    const before = entries.length;
    entries = entries.filter(e => now - e.timestamp < windowMs);
    if (entries.length !== before) {
      saveEntries(storageKey);
    }
  }

  function canProceed(): boolean {
    prune();
    if (entries.length < maxActions) {
      recordAction();
      return true;
    }
    return false;
  }

  function remaining(): number {
    prune();
    return Math.max(0, maxActions - entries.length);
  }

  function timeUntilNextSlot(): number {
    prune();
    if (entries.length < maxActions) return 0;
    // Find the oldest entry — it will expire first, freeing a slot
    const oldest = entries.reduce((min, e) => Math.min(min, e.timestamp), Infinity);
    const expiresAt = oldest + windowMs;
    return Math.max(0, expiresAt - Date.now());
  }

  function recordAction() {
    entries.push({ timestamp: Date.now() });
    // Keep only the last maxActions entries to bound memory
    if (entries.length > maxActions * 2) {
      entries = entries.slice(-maxActions);
    }
    saveEntries(storageKey);
  }

  function reset() {
    entries = [];
    saveEntries(storageKey);
  }

  return { canProceed, remaining, timeUntilNextSlot, recordAction, reset };
}

/**
 * Pre-configured rate limiters for the app.
 * These are created once at module load and shared across the app.
 */

export const messageRateLimiter10s = createRateLimiter(20, 10_000, 'gaga_rate_limit_message_10s');
export const messageRateLimiter60s = createRateLimiter(100, 60_000, 'gaga_rate_limit_message_60s');
export const friendRequestRateLimiterDay = createRateLimiter(30, 86_400_000, 'gaga_rate_limit_fr_day');
export const friendRequestRateLimiterMin = createRateLimiter(3, 60_000, 'gaga_rate_limit_fr_min');

/**
 * Check if a message can be sent based on all rate limiters.
 * If rate limited, returns an error message. Otherwise returns null.
 */
export function checkMessageRateLimit(): string | null {
  if (!messageRateLimiter10s.canProceed()) {
    const wait10s = Math.ceil(messageRateLimiter10s.timeUntilNextSlot() / 1000);
    return `Slow down! You can send another message in ${wait10s}s.`;
  }
  if (!messageRateLimiter60s.canProceed()) {
    const wait60s = Math.ceil(messageRateLimiter60s.timeUntilNextSlot() / 1000);
    return `You've sent too many messages. Try again in ${wait60s}s.`;
  }
  return null;
}

/**
 * Check if a friend request can be sent based on all rate limiters.
 * Returns an error message if rate limited, otherwise null.
 */
export function checkFriendRequestRateLimit(): string | null {
  if (!friendRequestRateLimiterMin.canProceed()) {
    return 'Too many friend requests. Please wait a moment.';
  }
  if (!friendRequestRateLimiterDay.canProceed()) {
    return 'You\'ve reached the daily limit of 30 friend requests.';
  }
  return null;
}
