import env from '@/config/env';

/** Fail before creating an invitation when the signaling gateway cannot serve calls. */
export async function verifyCallingAvailability(): Promise<void> {
  if (!env.VITE_CALLING_API_URL) throw new Error('Calling service is not configured yet.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('You are offline. Reconnect before calling.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(new URL('/healthz', env.VITE_CALLING_API_URL), {
      cache: 'no-store', signal: controller.signal, credentials: 'omit', redirect: 'error',
    });
    if (!response.ok || (await response.text()).trim() !== 'ok') throw new Error('Gateway unavailable');
  } catch {
    throw new Error('Calling is temporarily unavailable. Please try again later.');
  } finally { clearTimeout(timer); }
}
