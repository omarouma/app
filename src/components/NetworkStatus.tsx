import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/** Network reachability indicator, shared by all app routes. */
export default function NetworkStatus() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  if (online) return null;
  return <div role="status" aria-live="polite" className="fixed top-0 inset-x-0 z-[100] bg-amber-100 text-amber-950 px-4 py-2 flex items-center justify-center gap-2 text-sm shadow">
    <WifiOff size={16} aria-hidden="true" />
    <span>You’re offline. Messages may stay queued; calls need an internet connection.</span>
  </div>;
}
