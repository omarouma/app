import { toast } from 'sonner';
import { trackError } from '@/lib/firebase';

export const handleError = (error: unknown, defaultMessage: string) => {
    console.error(error);

    let message = defaultMessage;
    if (error instanceof Error) {
        message = error.message;
    }

    toast.error(message);
};

/**
 * Structured logger for store-level failures. Keeps a consistent shape for
 * debugging and forwards to production error tracking (no-op in dev).
 * Never throws — logging must not break the store's own error handling.
 */
export const logStoreError = (
    action: string,
    error: unknown,
    context: Record<string, unknown> = {},
) => {
    try {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[store:${action}]`, message, context);
        trackError(`store:${action}: ${message}`);
    } catch { /* logging must never throw */ }
};
