/**
 * Exponential backoff reconnection strategy for WebSocket/real-time subscriptions.
 * Used by presence tracking, voice rooms, and any Supabase realtime channels.
 */

export interface ReconnectConfig {
  /** Initial delay in ms (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in ms (default: 30000) */
  maxDelay?: number;
  /** Multiplier per attempt (default: 2) */
  multiplier?: number;
  /** Maximum number of retries before giving up (default: 10) */
  maxRetries?: number;
  /** Jitter factor to add randomness (default: 0.3 = ±30%) */
  jitter?: number;
}

export interface ReconnectState {
  attempt: number;
  nextDelay: number;
  reset: () => void;
  getDelay: () => number;
  shouldRetry: () => boolean;
  getStatus: () => ReconnectStatus;
}

export type ReconnectStatus = 'connected' | 'reconnecting' | 'disconnected' | 'failed';

const DEFAULT_CONFIG: Required<ReconnectConfig> = {
  initialDelay: 1000,
  maxDelay: 30000,
  multiplier: 2,
  maxRetries: 10,
  jitter: 0.3,
};

export function createReconnectStrategy(config?: ReconnectConfig): ReconnectState {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let attempt = 0;
  let nextDelay = cfg.initialDelay;

  function reset() {
    attempt = 0;
    nextDelay = cfg.initialDelay;
  }

  function getDelay(): number {
    if (attempt > 0) {
      nextDelay = Math.min(nextDelay * cfg.multiplier, cfg.maxDelay);
    }
    // Apply jitter: random value between (1 - jitter) and (1 + jitter)
    const jitterRange = cfg.jitter;
    const jitterFactor = 1 + (Math.random() * 2 - 1) * jitterRange;
    const delay = Math.round(nextDelay * jitterFactor);
    attempt++;
    return delay;
  }

  function shouldRetry(): boolean {
    return attempt < cfg.maxRetries;
  }

  function getStatus(): ReconnectStatus {
    if (attempt === 0) return 'connected';
    if (shouldRetry()) return 'reconnecting';
    return 'failed';
  }

  return { attempt, nextDelay, reset, getDelay, shouldRetry, getStatus };
}

/**
 * Higher-order function that wraps a subscribe function with auto-reconnect.
 * Returns a new unsubscribe function that also stops reconnection attempts.
 * 
 * The subscribeFn must return an unsubscribe function. When the connection drops,
 * `withAutoReconnect` will attempt to re-subscribe with exponential backoff.
 * 
 * @example
 * ```ts
 * const subscribeWithReconnect = withAutoReconnect(subscribeToChannel, { maxRetries: 5 });
 * const unsub = subscribeWithReconnect(channelId, userId);
 * // Later:
 * unsub(); // Stops the subscription AND any pending reconnection attempts
 * ```
 */
export function withAutoReconnect<TArgs extends unknown[]>(
  subscribeFn: (...args: TArgs) => () => void,
  config?: ReconnectConfig,
): (...args: TArgs) => { unsubscribe: () => void; getStatus: () => ReconnectStatus } {
  return (...args: TArgs) => {
    const strategy = createReconnectStrategy(config);
    let isCancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let innerUnsub: (() => void) | null = null;

    function cleanup() {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (innerUnsub) {
        innerUnsub();
        innerUnsub = null;
      }
    }

    function connect() {
      if (isCancelled) return;
      cleanup();
      try {
        innerUnsub = subscribeFn(...args);
      } catch {
        // Subscribe threw — schedule reconnect
        scheduleReconnect();
      }
    }

    function scheduleReconnect() {
      if (isCancelled || !strategy.shouldRetry()) return;
      const delay = strategy.getDelay();
      timeoutId = setTimeout(() => {
        if (!isCancelled) {
          connect();
        }
      }, delay);
    }

    // Initial connection attempt
    connect();

    return {
      unsubscribe: () => {
        isCancelled = true;
        cleanup();
      },
      getStatus: () => strategy.getStatus(),
    };
  };
}

