import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { toast } from 'sonner';

/** How often the shared location is refreshed (ms). */
const REFRESH_INTERVAL = 30_000;

export interface LiveLocationState {
  /** True while a live-location session is running. */
  active: boolean;
  /** Epoch ms when the session auto-expires (null = until turned off). */
  expiresAt: number | null;
  /** The id of the chat message that carries the live location. */
  messageId: string | null;
  /** Last known coordinates. */
  lastPosition: { latitude: number; longitude: number } | null;
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 5_000,
    });
  });
}

function buildContent(lat: number, lng: number, expiresAt: number | null): string {
  const coords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  if (expiresAt) {
    const mins = Math.max(0, Math.round((expiresAt - Date.now()) / 60_000));
    return `📍 Live location · ${coords} · updates every 30s · ${mins} min left`;
  }
  return `📍 Live location · ${coords} · updates every 30s`;
}

/**
 * Manages a "live location" sharing session inside a chat.
 *
 * Sends a `location` message carrying a Google Maps URL, then refreshes the
 * message content every 30 seconds via `editMessage` so the recipient always
 * sees the latest coordinates. The session auto-stops at the chosen expiry.
 */
export function useLiveLocation(chatId: string, userId: string) {
  const [state, setState] = useState<LiveLocationState>({
    active: false,
    expiresAt: null,
    messageId: null,
    lastPosition: null,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messageIdRef = useRef<string | null>(null);
  const expiresAtRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const stop = useCallback(
    async (reason: 'manual' | 'expired' = 'manual') => {
      clearTimer();
      const msgId = messageIdRef.current;
      if (msgId) {
        try {
          await useChatStore
            .getState()
            .editMessage(chatId, msgId, reason === 'expired' ? '📍 Live location ended' : '📍 Live location stopped');
        } catch {
          /* best-effort */
        }
      }
      messageIdRef.current = null;
      expiresAtRef.current = null;
      setState({ active: false, expiresAt: null, messageId: null, lastPosition: null });
    },
    [chatId, clearTimer],
  );

  const refresh = useCallback(async () => {
    try {
      const pos = await getPosition();
      const { latitude, longitude } = pos.coords;
      const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
      const content = buildContent(latitude, longitude, expiresAtRef.current);
      const msgId = messageIdRef.current;
      if (msgId) {
        await useChatStore.getState().editMessage(chatId, msgId, content);
      }
      setState((s) => ({ ...s, lastPosition: { latitude, longitude } }));
      void mapsUrl;
    } catch {
      /* transient GPS failure — keep the session alive and retry next tick */
    }
  }, [chatId]);

  const start = useCallback(
    async (minutes: number): Promise<boolean> => {
      if (!userId) return false;
      if (state.active) return true;
      try {
        const pos = await getPosition();
        const { latitude, longitude } = pos.coords;
        const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
        const expiresAt = minutes > 0 ? Date.now() + minutes * 60_000 : null;
        const content = buildContent(latitude, longitude, expiresAt);

        const result = await useChatStore
          .getState()
          .sendMessage(chatId, userId, content, 'location', mapsUrl);
        const msgId = result?.id ?? null;

        messageIdRef.current = msgId;
        expiresAtRef.current = expiresAt;
        setState({
          active: true,
          expiresAt,
          messageId: msgId,
          lastPosition: { latitude, longitude },
        });

        clearTimer();
        intervalRef.current = setInterval(() => {
          if (expiresAtRef.current && Date.now() >= expiresAtRef.current) {
            void stop('expired');
            return;
          }
          void refresh();
        }, REFRESH_INTERVAL);

        toast.success(minutes > 0 ? `Sharing live location for ${minutes} min.` : 'Sharing live location.');
        return true;
      } catch (err) {
        const denied =
          err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 1;
        toast.error(denied ? 'Location permission denied.' : 'Failed to start live location.');
        return false;
      }
    },
    [chatId, userId, state.active, clearTimer, refresh, stop],
  );

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return { ...state, start, stop };
}

export default useLiveLocation;
