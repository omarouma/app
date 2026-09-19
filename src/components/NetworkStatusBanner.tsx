import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { WifiOff, Wifi } from 'lucide-react';

/**
 * Global connectivity banner.
 *
 * Shows a slim, non-blocking bar when the device goes offline and a brief
 * "Back online" confirmation when connectivity returns. Works on web, PWA and
 * the native Capacitor shell (which also fires the standard online/offline
 * events through the WebView).
 */
export default function NetworkStatusBanner() {
  const [online, setOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    let restoredTimer: ReturnType<typeof setTimeout> | undefined;

    const handleOnline = () => {
      setOnline(true);
      setShowRestored(true);
      restoredTimer = setTimeout(() => setShowRestored(false), 2500);
    };
    const handleOffline = () => {
      setOnline(false);
      setShowRestored(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (restoredTimer) clearTimeout(restoredTimer);
    };
  }, []);

  const visible = !online || showRestored;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ duration: 0.25 }}
          role="status"
          aria-live="polite"
          className={`fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white shadow-sm ${
            online ? 'bg-[#00C300]' : 'bg-[#FF3B30]'
          }`}
          style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
        >
          {online ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span>
            {online
              ? 'Back online — syncing your messages'
              : 'You are offline — messages will send when you reconnect'}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
