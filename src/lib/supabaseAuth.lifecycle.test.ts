import { afterEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: { user: { id: string } } | null) => unknown),
  rpc: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock('./supabase', () => ({
  getSupabaseSafe: () => ({
    rpc: fixture.rpc,
    auth: {
      onAuthStateChange: (listener: typeof fixture.listener) => {
        fixture.listener = listener;
        return { data: { subscription: { unsubscribe: fixture.unsubscribe } } };
      },
    },
  }),
}));
vi.mock('./profileCache', () => ({
  cacheUserProfile: vi.fn(),
  getCachedUserProfile: vi.fn(async () => null),
}));
import { onAuthStateChange } from './supabaseAuth';

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('auth profile lifecycle', () => {
  it('returns before profile requests and emits the resolved user', async () => {
    vi.useFakeTimers();
    fixture.rpc.mockResolvedValue({ data: { id: 'user-a', name: 'A' }, error: null });
    const callback = vi.fn();
    const stop = onAuthStateChange(callback);
    expect(fixture.listener!('SIGNED_IN', { user: { id: 'user-a' } })).toBeUndefined();
    expect(fixture.rpc).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-a' }));
    stop();
  });

  it('does not restore a profile that resolves after sign-out', async () => {
    vi.useFakeTimers();
    let resolve!: (value: unknown) => void;
    fixture.rpc.mockReturnValue(new Promise((r) => { resolve = r; }));
    const callback = vi.fn();
    const stop = onAuthStateChange(callback);
    fixture.listener!('SIGNED_IN', { user: { id: 'user-a' } });
    await vi.advanceTimersByTimeAsync(0);
    fixture.listener!('SIGNED_OUT', null);
    await vi.advanceTimersByTimeAsync(0);
    resolve({ data: { id: 'user-a', name: 'A' }, error: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(callback.mock.calls).toEqual([[null]]);
    stop();
  });

  it('cancels queued work on unsubscribe', async () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const stop = onAuthStateChange(callback);
    fixture.listener!('SIGNED_IN', { user: { id: 'user-a' } });
    stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.rpc).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
    expect(fixture.unsubscribe).toHaveBeenCalledOnce();
  });
});
