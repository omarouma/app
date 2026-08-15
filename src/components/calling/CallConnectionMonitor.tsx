/**
 * Call Connection Monitor
 * 
 * This component must be inside CallProvider to access CallContext.
 * It monitors call connection state and handles errors/timeouts.
 */

import { useCallConnectionManager } from '@/hooks/useCallConnectionManager';

export function CallConnectionMonitor() {
    useCallConnectionManager();
    return null; // This is a non-rendering hook component
}
