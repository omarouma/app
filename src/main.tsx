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

// Initialize Firebase before React renders
initFirebase();

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
