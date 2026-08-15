/**
 * Error handling utilities for GaGa Chat.
 * Provides retry logic, error classification, and user-friendly messages.
 */

export interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  timestamp?: Date;
  isVideo?: boolean;
}

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: ErrorContext,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const ErrorMessages = {
  NETWORK_OFFLINE: 'You appear to be offline. Please check your connection.',
  NETWORK_TIMEOUT: 'Network request timed out. Please try again.',
  PERMISSION_DENIED: "You don't have permission to do this.",
  RESOURCE_NOT_FOUND: "The resource you're looking for was not found.",
  VALIDATION_ERROR: 'Please check your input and try again.',
  UNKNOWN_ERROR: 'Something went wrong. Please try again later.',
} as const;

export function getErrorMessage(error: unknown, _context?: string): string {
  if (error instanceof AppError) {
    if (error.code === 'NETWORK_OFFLINE') return ErrorMessages.NETWORK_OFFLINE;
    if (error.code === 'PERMISSION_DENIED') return ErrorMessages.PERMISSION_DENIED;
    if (error.code === 'NOT_FOUND') return ErrorMessages.RESOURCE_NOT_FOUND;
    return error.message;
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('network') || msg.includes('fetch')) return ErrorMessages.NETWORK_OFFLINE;
    if (msg.includes('permission')) return ErrorMessages.PERMISSION_DENIED;
    if (msg.includes('timeout')) return ErrorMessages.NETWORK_TIMEOUT;
    if (msg.includes('validation')) return ErrorMessages.VALIDATION_ERROR;
    return error.message;
  }

  return ErrorMessages.UNKNOWN_ERROR;
}

/**
 * Retry an async operation with exponential backoff.
 * @param fn The async function to retry
 * @param maxRetries Maximum number of retries (default 3)
 * @param delayMs Initial delay in ms (default 1000)
 * @param context Optional error context for logging
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000,
  context?: ErrorContext,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries - 1) {
        const backoffDelay = delayMs * Math.pow(2, attempt);
        console.warn(
          `[Retry] Attempt ${attempt + 1}/${maxRetries} failed. Retrying in ${backoffDelay}ms...`,
          lastError.message,
        );
        await new Promise((r) => setTimeout(r, backoffDelay));
      }
    }
  }

  throw new AppError(
    `Failed after ${maxRetries} attempts: ${lastError?.message}`,
    'MAX_RETRIES_EXCEEDED',
    context,
  );
}

/**
 * Check if an error is a transient network error that should be retried.
 */
export function isTransientError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('fetch') ||
    message.includes('connection') ||
    message.includes('unavailable') ||
    message.includes('offline') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('etimedout') ||
    message.includes('socket')
  );
}

/**
 * Log an error event to console and optionally to error tracking.
 */
export function logErrorEvent(error: Error, context?: ErrorContext): void {
  // Send to error tracking service (Sentry, LogRocket, etc.)
  if (typeof window !== 'undefined' && (window as any).Sentry) {
    (window as any).Sentry.captureException(error, {
      contexts: { app: context },
    });
  }
  console.error('[ErrorEvent]', { error: error.message, context });
}

/**
 * Wrap an async function with retry logic.
 * @param fn The async function to wrap
 * @param maxRetries Maximum retries
 * @param delayMs Initial delay
 */
export function withRetryWrapper<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  maxRetries = 3,
  delayMs = 1000,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    return withRetry(() => fn(...args), maxRetries, delayMs);
  };
}