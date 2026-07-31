export type FirestoreLikeTimestamp =
  | { toDate: () => Date }
  | { seconds?: number; nanoseconds?: number };

function isToDateTimestamp(x: unknown): x is { toDate: () => Date } {
  return typeof x === 'object' &&
    x !== null &&
    'toDate' in x &&
    typeof (x as { toDate?: unknown }).toDate === 'function';
}

function isSecondsNanoseconds(x: unknown): x is { seconds?: number; nanoseconds?: number } {
  return typeof x === 'object' &&
    x !== null &&
    ('seconds' in x || 'nanoseconds' in x);
}

export function mapFirestoreTimestamp(ts: unknown): Date { 
  if (!ts) return new Date();

  if (ts instanceof Date) return ts;

  if (isToDateTimestamp(ts)) {
    try {
      return ts.toDate();
    } catch {
      return new Date();
    }
  }

  if (isSecondsNanoseconds(ts)) {
    const seconds = typeof ts.seconds === 'number' ? ts.seconds : 0;
    const nanos = typeof ts.nanoseconds === 'number' ? ts.nanoseconds : 0;
    const ms = seconds * 1000 + Math.floor(nanos / 1_000_000);
    return new Date(ms);
  }

  // Fallback: try parsing as string/number
  if (typeof ts === 'string' || typeof ts === 'number') {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }

  return new Date();
}

