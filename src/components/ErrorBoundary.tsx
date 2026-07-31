import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props { children: ReactNode; resetKey?: string; }
interface State { hasError: boolean; error?: Error; prevResetKey?: string; }

function safeTrackError(description: string) {
  try {
    import('@/lib/firebase').then(({ trackError }) => trackError(description, false)).catch(() => {});
  } catch { /* ignore */ }
}

function clearCachesAndReload() {
  const reload = () => { (window as Window & typeof globalThis).location.reload(); };
  if ('caches' in window) {
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(reload)
      .catch(reload);
  } else {
    reload();
  }
}

const CHUNK_ERROR_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'Importing a module script failed',
  'Unable to preload CSS',
];

// Errors that should be silently ignored rather than crashing the UI
const NON_FATAL_PATTERNS = [
  'cannot add postgres_changes callbacks',
  'after subscribe()',
];

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Don't crash the UI for known non-fatal Supabase realtime errors
    if (NON_FATAL_PATTERNS.some((p) => error.message.includes(p))) {
      return {};
    }
    return { hasError: true, error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (state.hasError && props.resetKey !== state.prevResetKey) {
      return { hasError: false, error: undefined, prevResetKey: props.resetKey };
    }
    if (props.resetKey !== state.prevResetKey) {
      return { prevResetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error) {
    const safe = String(error.message).replace(/[\r\n]/g, ' ');
    // Skip logging/tracking for known non-fatal errors
    if (NON_FATAL_PATTERNS.some((p) => error.message.includes(p))) return;
    console.error('ErrorBoundary:', safe);
    safeTrackError(safe);
    if (CHUNK_ERROR_PATTERNS.some((p) => error.message.includes(p))) {
      clearCachesAndReload();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-white flex items-center justify-center p-4">
          <div className="text-center max-w-md mx-auto">
            <div className="w-20 h-20 rounded-full bg-[#FF3B30]/10 flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={36} className="text-[#FF3B30]" />
            </div>
            <h1 className="text-2xl font-bold text-[#111111] mb-2">Something went wrong</h1>
            <p className="text-[#8D8D8D] text-sm mb-6">We're sorry for the inconvenience. Please try refreshing the page.</p>
            {this.state.error && (
              <p className="text-[#FF3B30]/70 text-xs mb-6 p-3 bg-[#FF3B30]/10 rounded-lg">
                {String(this.state.error.message).replace(/[<>"'&]/g, (c) => ({ '<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;' }[c] ?? c))}
              </p>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#00C300] text-white rounded-full text-sm font-bold active:bg-[#00A300] transition-colors"
            >
              <RefreshCw size={16} /> Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
