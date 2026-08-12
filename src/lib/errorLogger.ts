interface LogContext {
    [key: string]: unknown;
}

interface ErrorLogEntry {
    timestamp: string;
    scope: string;
    message: string;
    context?: LogContext;
    stack?: string;
}

const MAX_BUFFER = 50;
const buffer: ErrorLogEntry[] = [];

function push(entry: ErrorLogEntry) {
    buffer.push(entry);
    if (buffer.length > MAX_BUFFER) buffer.shift();
}

export function logStoreError(
    scope: string,
    error: unknown,
    context: LogContext = {},
): void {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    const entry: ErrorLogEntry = {
        timestamp: new Date().toISOString(),
        scope,
        message,
        context: Object.keys(context).length > 0 ? context : undefined,
        stack,
    };

    push(entry);

    if (typeof window !== 'undefined' && (window as any).__GAGA_ERROR_BUFFER__) {
        (window as any).__GAGA_ERROR_BUFFER__.push(entry);
    }

    if (import.meta.env?.DEV) {
        console.error(`[store:${scope}]`, message, context, error);
    }
}

export function getErrorBuffer(): ErrorLogEntry[] {
    return [...buffer];
}

export function clearErrorBuffer(): void {
    buffer.length = 0;
}

if (typeof window !== 'undefined') {
    (window as any).__GAGA_ERROR_BUFFER__ = buffer;
}
