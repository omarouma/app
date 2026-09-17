import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/config/env', () => ({ default: { VITE_CALLING_API_URL: 'https://calls.example.test' } }));
import { verifyCallingAvailability } from './callingAvailability';
afterEach(() => vi.unstubAllGlobals());
it('rejects a gateway error and an HTML fallback', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, text: async () => '<html>SPA</html>' }));
  await expect(verifyCallingAvailability()).rejects.toThrow('temporarily unavailable');
  await expect(verifyCallingAvailability()).rejects.toThrow('temporarily unavailable');
});
it('allows the expected health response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => 'ok' }));
  await expect(verifyCallingAvailability()).resolves.toBeUndefined();
});
it('does not request the gateway while offline', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); vi.stubGlobal('navigator', { onLine: false });
  await expect(verifyCallingAvailability()).rejects.toThrow('offline');
  expect(fetcher).not.toHaveBeenCalled();
});
