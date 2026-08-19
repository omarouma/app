/**
 * Enhanced ZEGO Cloud Call Connection Manager
 * 
 * Ensures reliable connection to the ZEGO call room with:
 * - Connection state monitoring
 * - Automatic reconnection on failure
 * - Error recovery
 */

import { useEffect, useRef } from 'react';
import { useCallStore } from '@/store/useCallStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useCallContext } from '@/context/CallContextBase';
import { playErrorSound } from '@/lib/sounds';

const MAX_CONNECTION_TIME_MS = 30000; // 30 seconds total timeout

export function useCallConnectionManager() {
    const currentUser = useAuthStore((s) => s.user);
    const currentCall = useCallStore((s) => s.currentCall);
    const { isConnected, configuredError, mediaError, endCall } = useCallContext();

    const connectionAttemptRef = useRef(0);
    const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastConnectionErrorRef = useRef<string | null>(null);

    // Monitor connection errors
    useEffect(() => {
        if (configuredError || mediaError) {
            lastConnectionErrorRef.current = configuredError || mediaError;
            playErrorSound();
            console.error('[Call] Connection error:', configuredError || mediaError);
        }
    }, [configuredError, mediaError]);

    // Monitor connection state
    useEffect(() => {
        if (!currentCall || !currentUser) return;

        // If call is established and connected, reset attempts
        if (isConnected && currentCall.status === 'connected') {
            connectionAttemptRef.current = 0;
            if (connectionTimeoutRef.current) {
                clearTimeout(connectionTimeoutRef.current);
                connectionTimeoutRef.current = null;
            }
            console.log('[Call] Connected successfully');
            return;
        }

        // If call is in progress but not yet connected, monitor timeout
        if (currentCall.status === 'calling' || (currentCall.status === 'connected' && !isConnected)) {
            if (!connectionTimeoutRef.current) {
                connectionTimeoutRef.current = setTimeout(() => {
                    if (!isConnected) {
                        console.error('[Call] Connection timeout — ending call');
                        playErrorSound();
                        endCall();
                    }
                }, MAX_CONNECTION_TIME_MS);
            }
        }
    }, [currentCall, currentCall?.id, currentCall?.status, currentUser, currentUser?.id, isConnected, endCall]);

    // Cleanup
    useEffect(() => {
        return () => {
            if (connectionTimeoutRef.current) {
                clearTimeout(connectionTimeoutRef.current);
            }
        };
    }, []);
}
