/**
 * Network connectivity monitoring hook.
 * Provides real-time online/offline status with quality estimation.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export interface NetworkStatus {
  /** Whether the browser reports being online */
  isOnline: boolean;
  /** Whether we're actively checking connectivity (ping-based) */
  isChecking: boolean;
  /** Estimated connection quality (latency in ms), -1 if unknown */
  latency: number;
  /** Whether we were recently offline and reconnected */
  wasDisconnected: boolean;
  /** Number of consecutive failures since last successful check */
  failureCount: number;
  /** Trigger a manual connectivity check */
  checkNow: () => Promise<void>;
}

const CHECK_INTERVAL = 30_000; // 30s between health checks
const PING_URL = '/ping.txt';
const GOOD_LATENCY_THRESHOLD = 200;
const FAILURE_THRESHOLD = 3;

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(() => 
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isChecking, setIsChecking] = useState(false);
  const [latency, setLatency] = useState(-1);
  const [wasDisconnected, setWasDisconnected] = useState(false);
  const [failureCount, setFailureCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDestroyedRef = useRef(false);

  const performCheck = useCallback(async () => {
    if (isDestroyedRef.current) return;
    setIsChecking(true);
    const start = performance.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      await fetch(PING_URL, { 
        method: 'HEAD', 
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const measuredLatency = Math.round(performance.now() - start);
      setLatency(measuredLatency);
      setFailureCount(0);
      
      if (!navigator.onLine) {
        // Browser says offline but ping succeeded — inconsistent state
        setIsOnline(true);
        setWasDisconnected(true);
        setTimeout(() => setWasDisconnected(false), 5000);
      }
    } catch {
      setFailureCount(prev => prev + 1);
      if (failureCount >= FAILURE_THRESHOLD || !navigator.onLine) {
        setIsOnline(false);
      }
    } finally {
      setIsChecking(false);
    }
  }, [failureCount]);

  useEffect(() => {
    isDestroyedRef.current = false;

    const handleOnline = () => {
      setIsOnline(true);
      setWasDisconnected(true);
      setTimeout(() => setWasDisconnected(false), 5000);
      setFailureCount(0);
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Start health check interval
    performCheck();
    intervalRef.current = setInterval(performCheck, CHECK_INTERVAL);

    return () => {
      isDestroyedRef.current = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [performCheck]);

  return {
    isOnline,
    isChecking,
    latency,
    wasDisconnected,
    failureCount,
    checkNow: performCheck,
  };
}

/**
 * Returns a CSS class for connection indicator based on network status.
 */
export function getConnectionIndicatorClass(status: NetworkStatus): string {
  if (!status.isOnline) return 'bg-red-500';
  if (status.wasDisconnected) return 'bg-yellow-500';
  if (status.latency > 0 && status.latency < GOOD_LATENCY_THRESHOLD) return 'bg-green-500';
  if (status.latency >= GOOD_LATENCY_THRESHOLD) return 'bg-yellow-500';
  return 'bg-gray-400';
}
