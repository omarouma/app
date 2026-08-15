import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { AuthProvider } from '@/context/AuthContext'
import { ThemeProvider } from '@/components/ThemeProvider'
import ErrorBoundary from '@/components/ErrorBoundary'
import { initFirebase } from '@/lib/firebase'
import { runStorageCleanup } from '@/lib/storageCleanup'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

const BLOCKED_BINANCE_TON_BRIDGE_URL = /wallet\.binance\.com\/tonbridge\/bridge\/events|tonbridge\/bridge\/events/i;

function isBlockedBinanceTonBridgeUrl(url: string): boolean {
  try {
    return BLOCKED_BINANCE_TON_BRIDGE_URL.test(new URL(url, window.location.origin).toString());
  } catch {
    return BLOCKED_BINANCE_TON_BRIDGE_URL.test(url);
  }
}

function installBinanceBridgeGuard() {
  // SECURITY: Block Binance TON bridge connections to prevent wallet hijacking attacks.
  // This is intentional security behavior, not a bug. Web3 wallet extensions may attempt
  // to connect to external bridge services; we silently block these to protect users.

  const nativeFetch = window.fetch?.bind(window);
  if (nativeFetch) {
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input instanceof Request ? input.url : '';
      if (isBlockedBinanceTonBridgeUrl(url)) {
        // Silently reject without console warning to avoid console noise
        return Promise.reject(new TypeError('Blocked external Binance TON bridge request'));
      }
      return nativeFetch(input as any, init);
    };
  }

  const NativeEventSource = window.EventSource;
  if (NativeEventSource) {
    class GuardedEventSource extends NativeEventSource {
      constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
        const target = typeof url === 'string' ? url : url.toString();
        if (isBlockedBinanceTonBridgeUrl(target)) {
          // Silently reject without throwing — return a never-connecting stub
          // instead of throwing an uncaught error that pollutes the console.
          super('data:text/plain,blocked', eventSourceInitDict);
          // Immediately close the connection so it never actually connects
          queueMicrotask(() => this.close());
          return;
        }
        super(target, eventSourceInitDict);
      }
    }
    Object.defineProperty(window, 'EventSource', {
      value: GuardedEventSource,
      configurable: true,
      writable: true,
    });
  }
}

installBinanceBridgeGuard();

// Initialize Firebase before React renders
initFirebase();

// Lock app orientation to portrait on supported mobile browsers/devices.
async function lockPortraitOrientation() {
  try {
    const orientation = (screen as Screen & { orientation?: { lock?: (orientation: 'portrait' | 'portrait-primary' | 'portrait-secondary') => Promise<void> } }).orientation;
    if (orientation && typeof orientation.lock === 'function') {
      await orientation.lock('portrait');
    }
  } catch {
    // Some browsers block orientation locking or do not support it.
  }
}

// Best-effort portrait enforcement for devices that do not allow a full lock.
const enforcePortraitLayout = () => {
  const root = document.documentElement;
  const isLandscape = window.matchMedia('(orientation: landscape)').matches;
  root.style.setProperty('overflow-x', 'hidden');
  root.style.setProperty('overflow-y', isLandscape ? 'hidden' : 'auto');
  root.style.setProperty('width', '100%');
  root.style.setProperty('height', '100%');
};

lockPortraitOrientation();
enforcePortraitLayout();
window.addEventListener('orientationchange', enforcePortraitLayout, { passive: true });
window.addEventListener('resize', enforcePortraitLayout, { passive: true });

// Clean up stale localStorage entries once on startup (non-blocking)
try { runStorageCleanup(); } catch { /* ignore */ }

// Initialize GA4 config using env var (avoids hardcoding in HTML)
// Note: gtag('config') is already called in index.html for initial page load.
// Here we only set additional runtime options if the env var is present.
if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
  const gaMeasurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
  if (gaMeasurementId) {
    window.gtag('config', gaMeasurementId, {
      send_page_view: false,
      cookie_flags: 'SameSite=None;Secure',
    });
  }
}

// Redirect non-canonical domains to the primary domain (production only)
const CANONICAL = 'gagachat.app';
const ALLOWED_HOSTS = new Set([CANONICAL, 'oumagachat.web.app', 'oumagachat.firebaseapp.com', 'localhost']);
if (
  typeof window !== 'undefined' &&
  import.meta.env.PROD &&
  !ALLOWED_HOSTS.has(window.location.hostname) &&
  !window.location.hostname.endsWith('.localhost')
) {
  window.location.replace(`https://${CANONICAL}${window.location.pathname}${window.location.search}${window.location.hash}`);
}

// Auto-reload on stale chunk errors (after new deploy)
// Guard: only reload once per session to prevent infinite reload loops.
let _chunkReloadScheduled = false;
function clearCachesAndReload() {
  if (_chunkReloadScheduled) return;
  _chunkReloadScheduled = true;
  if ('caches' in window) {
    window.caches.keys()
      .then((keys) => Promise.all(keys.map((k) => window.caches.delete(k))))
      .then(() => location.reload())
      .catch(() => location.reload());
  } else {
    location.reload();
  }
}

const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
  const msg = event.reason?.message || String(event.reason || '')
  if (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Unable to preload CSS')
  ) {
    event.preventDefault()
    clearCachesAndReload()
  }
}
window.addEventListener('unhandledrejection', handleUnhandledRejection)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <ThemeProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)
