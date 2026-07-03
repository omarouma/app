import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { AuthProvider } from '@/context/AuthContext'
import { CallProvider } from '@/context/CallContext'
import { ThemeProvider } from '@/components/ThemeProvider'
import ErrorBoundary from '@/components/ErrorBoundary'
import { initFirebase } from '@/lib/firebase'

// Initialize Firebase before React renders
initFirebase();

// Redirect non-canonical domains to the primary domain (production only)
const CANONICAL = 'gagachat.app'
if (
  typeof window !== 'undefined' &&
  import.meta.env.PROD &&
  window.location.hostname !== CANONICAL &&
  window.location.hostname !== 'localhost'
) {
  window.location.replace(`https://${CANONICAL}${window.location.pathname}${window.location.search}${window.location.hash}`)
}

// Auto-reload on stale chunk errors (after new deploy)
function clearCachesAndReload() {
  if (self.caches) {
    self.caches.keys()
      .then((keys) => Promise.all(keys.map((k) => self.caches.delete(k))))
      .then(() => location.reload())
      .catch(() => location.reload());
  } else {
    location.reload();
  }
}

window.addEventListener('unhandledrejection', (event) => {
  const msg = event.reason?.message || String(event.reason || '')
  if (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Unable to preload CSS')
  ) {
    event.preventDefault()
    clearCachesAndReload()
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <ThemeProvider>
          <AuthProvider>
            <CallProvider>
              <App />
            </CallProvider>
          </AuthProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)
