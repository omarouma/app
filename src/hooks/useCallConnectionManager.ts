import { useEffect, useRef } from 'react';
import { useCallStore } from '@/store/useCallStore';
import { useCallContext } from '@/context/CallContextBase';
import { playErrorSound } from '@/lib/sounds';

const MAX_CONNECTION_TIME_MS = 30_000;

/** Ringing has its own store timeout. Monitor media only after acceptance. */
export function useCallConnectionManager() {
  const currentCall = useCallStore(s => s.currentCall);
  const { isConnected, configuredError, mediaError, endCall } = useCallContext();
  const endRef = useRef(endCall);
  useEffect(() => { endRef.current = endCall; }, [endCall]);
  useEffect(() => {
    if (configuredError || mediaError) playErrorSound();
  }, [configuredError, mediaError]);
  useEffect(() => {
    const callId = currentCall?.id;
    const status = currentCall?.status;
    if (!callId || status !== 'connected' || isConnected) return;
    const timeout = setTimeout(() => {
      if (useCallStore.getState().currentCall?.id !== callId) return;
      playErrorSound();
      void endRef.current().catch(() => { /* Store reports persistence errors. */ });
    }, MAX_CONNECTION_TIME_MS);
    return () => clearTimeout(timeout);
  }, [currentCall?.id, currentCall?.status, isConnected]);
}
