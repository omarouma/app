import { useEffect, useState } from 'react';
import { AlertTriangle, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { getRealtimeStatus, onRealtimeStatusChange } from '@/lib/firestore';
import type { RealtimeStatus } from '@/lib/supabaseDb';

export default function NetworkStatusBanner() {
  const { isOnline, isChecking, wasDisconnected, latency } = useNetworkStatus();
  // Realtime socket status — independent of browser online/offline. A Supabase
  // channel uses a WebSocket/SSE transport that can drop even while the browser
  // is "online", so we surface that separately here.
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>(() => getRealtimeStatus());

  useEffect(() => {
    const unsub = onRealtimeStatusChange((s) => setRealtimeStatus(s));
    return unsub;
  }, []);

  const realtimeDown = !isOnline || realtimeStatus !== 'connected';

  if (isOnline && !wasDisconnected && !isChecking && realtimeStatus === 'connected') {
    return null;
  }

  const isSlow = isOnline && latency > 0 && latency >= 250;
  const isRealtimeReconnecting = isOnline && realtimeStatus === 'reconnecting';

  const bannerClass = realtimeDown
    ? 'border-red-200 bg-red-50 text-red-800'
    : isRealtimeReconnecting
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : isSlow
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-emerald-200 bg-emerald-50 text-emerald-800';

  const icon = realtimeDown ? <WifiOff size={16} /> : isRealtimeReconnecting ? <RefreshCw size={16} className="animate-spin" /> : isSlow ? <AlertTriangle size={16} /> : <Wifi size={16} />;

  const message = realtimeDown
    ? 'You are offline. Changes will sync when the connection returns.'
    : isRealtimeReconnecting
      ? 'Reconnecting to live updates…'
      : wasDisconnected
        ? 'Connection restored. Syncing your data…'
        : isSlow
          ? 'Connection is slow. Some features may take longer to load.'
          : 'You are back online.';

  return (
    <div
      className={`w-full border-b px-3 py-2 text-sm backdrop-blur ${bannerClass}`}
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2">
        {icon}
        <span className="font-medium">{message}</span>
        {isChecking && <span className="opacity-75">Checking…</span>}
      </div>
    </div>
  );
}
