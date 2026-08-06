/**
 * Network connectivity monitoring hook.
 * Provides real-time online/offline status with quality estimation.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useIsMounted } from './use-mobile';

export interface NetworkStatus {
  isOnline: boolean;
  isChecking: boolean;
  latency: number;
  wasDisconnected: boolean;
  failureCount: number;
  checkNow: () => Promise<void>;
}

const CHECK_INTERVAL = 30_000;
const PING_URL = '/ping.txt';
const GOOD_LATENCY_THRESHOLD = 200;
const FAILURE_THRESHOLD = 3;

export function useNetworkStatus(): NetworkStatus {
  const isMounted = useIsMounted();
  const [isOnline, setIsOnline] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [latency, setLatency] = useState(-1);
  const [wasDisconnected, setWasDisconnected] = useState(false);
  const [failureCount, setFailureCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const performCheck = useCallback(async () => {
    if (!isMounted) return;
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
        setIsOnline(true);
        setWasDisconnected(true);
        setTimeout(() => setWasDisconnected(false), 5000);
      }
    } catch {
      setFailureCount((prev) => prev + 1);
      if (failureCount >= FAILURE_THRESHOLD - 1 && navigator.onLine) {
        setIsOnline(false);
      }
    } finally {
      setIsChecking(false);
    }
  }, [isMounted, failureCount]);

  useEffect(() => {
    if (!isMounted) return;

    const handleOnline = () => {
      setIsOnline(true);
      setWasDisconnected(true);
      setTimeout(() => setWasDisconnected(false), 5000);
      setFailureCount(0);
      performCheck();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    setIsOnline(navigator.onLine);
    performCheck();
    intervalRef.current = setInterval(performCheck, CHECK_INTERVAL);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isMounted, performCheck]);

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