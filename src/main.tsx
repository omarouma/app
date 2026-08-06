import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './i18n'
import App from './App'
import { AuthProvider } from '@/context/AuthContext'
import { ThemeProvider } from '@/components/ThemeProvider'
import ErrorBoundary from '@/components/ErrorBoundary'
import { initFirebase } from '@/lib/firebase'
import { runStorageCleanup } from '@/lib/storageCleanup'
import env from '@/config/env'

// Sentry is optional — only loaded when DSN is configured
// Loaded via CDN script at runtime to avoid a hard build dependency on @sentry/react
if (env.PROD && env.VITE_SENTRY_DSN) {
  const script = document.createElement('script');
  script.src = 'https://browser.sentry-cdn.com/7.120.3/bundle.tracing.replay.min.js';
  script.crossOrigin = 'anonymous';
  script.onload = () => {
    try {
      const w = window as unknown as {
        Sentry?: {
          init: (opts: Record<string, unknown>) => void;
          browserTracingIntegration?: () => unknown;
          replayIntegration?: (opts: Record<string, unknown>) => unknown;
        };
      };
      const Sentry = w.Sentry;
      if (Sentry) {
        Sentry.init({
          dsn: env.VITE_SENTRY_DSN,
          integrations: [
            Sentry.browserTracingIntegration ? Sentry.browserTracingIntegration() : null,
            Sentry.replayIntegration ? Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }) : null,
          ].filter(Boolean),
          tracesSampleRate: 0.1,
          replaysSessionSampleRate: 0.05,
          replaysOnErrorSampleRate: 1.0,
        });
      }
    } catch {
      /* Sentry init failed — ignore */
    }
  };
  document.head.appendChild(script);
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
  const __APP_VERSION__: string;
}

// Initialize Firebase before React renders
try {
  initFirebase();
} catch (error) {
  console.warn('Firebase bootstrap skipped:', error);
}

// Clean up stale localStorage entries once on startup (non-blocking)
try { runStorageCleanup(); } catch { /* ignore */ }

// Initialize GA4 config using env var (avoids hardcoding in HTML)
// Note: gtag('config') is already called in index.html for initial page load.
// Here we only set additional runtime options if the env var is present.
if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
  const gaMeasurementId = env.VITE_GA_MEASUREMENT_ID;
  if (gaMeasurementId) {
    try {
      window.gtag('config', gaMeasurementId, {
        send_page_view: false,
        cookie_flags: 'SameSite=None;Secure',
      });
    } catch (error) {
      console.warn('GA bootstrap skipped:', error);
    }
  }
}

// Redirect non-canonical domains to the primary domain (production only)
// Primary hosting: oumagachat.web.app
// Custom domain (if configured): gagachat.app
const CANONICAL = 'oumagachat.web.app';
const ALLOWED_HOSTS = new Set([CANONICAL, 'oumagachat.firebaseapp.com', 'gagachat.app', 'localhost']);
if (
  typeof window !== 'undefined' &&
  env.PROD &&
  !ALLOWED_HOSTS.has(window.location.hostname) &&
  !window.location.hostname.endsWith('.localhost') &&
  !window.location.hostname.endsWith('.web.app') &&
  !window.location.hostname.endsWith('.firebaseapp.com')
) {
  try {
    window.location.replace(`https://${CANONICAL}${window.location.pathname}${window.location.search}${window.location.hash}`);
  } catch (error) {
    console.warn('Canonical redirect skipped:', error);
  }
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