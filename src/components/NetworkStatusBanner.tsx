import { AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

export default function NetworkStatusBanner() {
  const { isOnline, isChecking, wasDisconnected, latency } = useNetworkStatus();

  if (isOnline && !wasDisconnected && !isChecking) {
    return null;
  }

  const isSlow = isOnline && latency > 0 && latency >= 250;

  return (
    <div
      className={`w-full border-b px-3 py-2 text-sm backdrop-blur ${
        isOnline ? (isSlow ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800') : 'border-red-200 bg-red-50 text-red-800'
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2">
        {isOnline ? (
          isSlow ? <AlertTriangle size={16} /> : <Wifi size={16} />
        ) : (
          <WifiOff size={16} />
        )}
        <span className="font-medium">
          {isOnline ? (wasDisconnected ? 'Connection restored. Syncing your data…' : isSlow ? 'Connection is slow. Some features may take longer to load.' : 'You are back online.') : 'You are offline. Changes will sync when the connection returns.'}
        </span>
        {isChecking && <span className="opacity-75">Checking…</span>}
      </div>
    </div>
  );
}
