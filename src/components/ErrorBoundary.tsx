import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trackError } from '@/lib/firebase';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    if (
      error.message.includes('Failed to fetch dynamically imported module') ||
      error.message.includes('Importing a module script failed') ||
      error.message.includes('Unable to preload CSS')
    ) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      if ('caches' in window) {
        w.caches.keys().then((keys: string[]) =>
          Promise.all(keys.map((k: string) => w.caches.delete(k)))
        ).then(() => w.location.reload()).catch(() => w.location.reload())
      } else {
        w.location.reload()
      }
      return { hasError: false };
    }
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    // Sanitize error message to prevent log injection
    const safe = String(error.message).replace(/[\r\n]/g, ' ');
    console.error('ErrorBoundary:', safe);

    // Track in Firebase Analytics (if available)
    trackError(safe, false);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-4">
          <div className="text-center max-w-md mx-auto">
            <div className="w-20 h-20 rounded-full bg-[#FF3B30]/10 flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={36} className="text-[#FF3B30]" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
            <p className="text-white/50 text-sm mb-6">We're sorry for the inconvenience. Please try refreshing the page.</p>
            {this.state.error && (
              <p className="text-[#FF3B30]/70 text-xs mb-6 p-3 bg-[#FF3B30]/10 rounded-lg">
                {String(this.state.error.message).replace(/[<>"'&]/g, (c) => ({ '<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;' }[c] ?? c))}
              </p>
            )}
            <Button onClick={() => window.location.reload()} className="gchat-btn rounded-full px-6">
              <RefreshCw size={16} className="mr-2" /> Refresh Page
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
