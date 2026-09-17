import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useCallStore } from '@/store/useCallStore';
import { useAppPermissions } from '@/hooks/useAppPermissions';
import { PhoneOff, RotateCw, ShieldAlert } from 'lucide-react';
import { withRetry, logErrorEvent } from '@/lib/errorHandling';

/**
 * CallPage is the *initiator* for a call started from a route (e.g. tapping a
 * contact). It owns exactly three responsibilities:
 *
 *   1. Request camera/microphone permission before dialling.
 *   2. Kick off `startCall` once, with retry on transient failures.
 *   3. Show a permission/error state with Retry + Cancel.
 *
 * It deliberately renders **no** in-call controls. `CallOverlay` is mounted
 * globally in App.tsx and takes over the moment `currentCall` exists, so any
 * controls here would be a second, conflicting set (the previous version had a
 * no-op Speaker button and a Keypad that only ever sent DTMF '1').
 */
export default function CallPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const navState = (location.state || {}) as {
    userId?: string;
    mode?: 'voice' | 'video';
    callType?: 'voice' | 'video';
    isOutgoing?: boolean;
  };
  const userId = navState.userId;
  const mode = navState.mode ?? navState.callType;
  const { user: currentUser } = useAuthStore();
  const { friends } = useFriendStore();
  const { startCall, endCall, currentCall, cancelCallIfStale } = useCallStore();
  const { ensureCallPermissions } = useAppPermissions();
  const initiatedRef = useRef(false);
  const hadCallRef = useRef(false);
  const switchingToUserIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep the latest endCall in a ref so the dialling effect never needs it as a
  // dependency (it is recreated on every store update).
  const endCallRef = useRef(endCall);
  endCallRef.current = endCall;

  const friend = friends.find((f) => f.id === userId);
  const isVideo = mode === 'video';

  useEffect(() => {
    if (!userId || !currentUser) return;
    if (initiatedRef.current) return;
    // If a call is already active with someone else, end it first and then dial.
    if (currentCall && !currentCall.participantIds.includes(userId)) {
      switchingToUserIdRef.current = userId;
      void endCallRef.current().then(() => {
        initiatedRef.current = false;
      });
      return;
    }
    if (currentCall) return;
    initiatedRef.current = true;
    switchingToUserIdRef.current = null;
    setError(null);
    void (async () => {
      const allowed = await ensureCallPermissions(isVideo);
      if (!allowed) {
        initiatedRef.current = false;
        setError(isVideo
          ? 'Camera and microphone access are required for video calls. Please allow access in your browser settings and try again.'
          : 'Microphone access is required for voice calls. Please allow access in your browser settings and try again.');
        return;
      }
      try {
        await startCall(userId, currentUser.id, isVideo ? 'video' : 'voice');
      } catch (err) {
        initiatedRef.current = false;
        setError(err instanceof Error ? err.message : 'Failed to start the call.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, currentUser?.id, isVideo, currentCall, ensureCallPermissions]);

  // Track that a call was established so we only auto-navigate away afterwards.
  useEffect(() => {
    if (currentCall) {
      hadCallRef.current = true;
      switchingToUserIdRef.current = null;
    }
  }, [currentCall]);

  // Leave the page once the call has ended (but not while switching calls).
  useEffect(() => {
    if (hadCallRef.current && !currentCall && switchingToUserIdRef.current !== userId) {
      navigate('/calls', { replace: true });
    }
  }, [currentCall, navigate, userId]);

  // Clear any pending call timeout when the page unmounts.
  useEffect(() => {
    return () => {
      cancelCallIfStale();
    };
  }, [cancelCallIfStale]);

  const handleEndCall = async () => {
    await endCallRef.current();
    navigate('/calls', { replace: true });
  };

  const handleRetry = async () => {
    try {
      initiatedRef.current = false;
      setError(null);
      if (userId && currentUser) {
        const allowed = await ensureCallPermissions(isVideo);
        if (!allowed) {
          setError(isVideo
            ? 'Camera and microphone access are required for video calls. Please allow access in your browser settings and try again.'
            : 'Microphone access is required for voice calls. Please allow access in your browser settings and try again.');
          return;
        }
        initiatedRef.current = true;
        await withRetry(
          () => startCall(userId, currentUser.id, isVideo ? 'video' : 'voice'),
          3,
          1000,
          { component: 'CallPage', action: 'call_initiation' }
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start the call.';
      setError(message);
      logErrorEvent(err instanceof Error ? err : new Error(message), {
        component: 'CallPage',
        action: 'call_initiation',
        userId,
        isVideo,
      });
    }
  };

  if (!userId || !currentUser) {
    return (
      <div className="h-[100dvh] bg-white flex flex-col items-center justify-center p-6 text-center">
        <p className="text-[#111111] text-lg font-semibold mb-2">No contact selected</p>
        <p className="text-[#8D8D8D] text-sm max-w-sm mb-4">Choose a contact from chats or contacts before starting a call.</p>
        <button
          type="button"
          onClick={() => navigate('/chats')}
          aria-label="Go to Chats to select a contact"
          title="Go to Chats"
          className="px-5 py-3 bg-[#00C300] text-white rounded-full text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00C300] hover:bg-[#00A800] transition-colors"
        >
          Go to Chats
        </button>
      </div>
    );
  }

  // Permission / dialling failure: explain and offer Retry or Cancel.
  if (error) {
    return (
      <div className="h-[100dvh] bg-[#111111] flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-1">
          <ShieldAlert size={28} className="text-red-400" />
        </div>
        <p className="text-white font-semibold">{friend?.name || 'User'}</p>
        <p className="text-[#FF6B6B] text-sm max-w-xs">{error}</p>
        <p className="text-white/40 text-xs max-w-xs">
          Make sure microphone{isVideo ? ' and camera' : ''} permissions are allowed, then try again.
        </p>
        <div className="flex gap-3 mt-2">
          <button type="button" onClick={handleRetry}
            className="flex items-center gap-2 px-5 py-3 bg-[#00C300] text-white rounded-full text-sm font-semibold">
            <RotateCw size={16} /> Retry
          </button>
          <button type="button" onClick={handleEndCall}
            className="flex items-center gap-2 px-5 py-3 bg-white/10 text-white rounded-full text-sm">
            <PhoneOff size={16} /> Cancel
          </button>
        </div>
      </div>
    );
  }

  // Dialling placeholder. CallOverlay replaces this the instant the call record
  // exists, so this is only visible for the brief permission + insert window.
  return (
    <div className="h-[100dvh] bg-[#111111] flex flex-col items-center justify-center gap-6 p-6">
      <p className="text-white/50 text-sm">Connecting…</p>
      <p className="text-white text-2xl font-semibold">{friend?.name || 'User'}</p>
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={handleEndCall}
          aria-label="Cancel call"
          className="w-16 h-16 rounded-full bg-[#FF3B30] flex items-center justify-center shadow-lg shadow-red-900/40 active:scale-95 transition-transform"
        >
          <PhoneOff size={28} className="text-white" />
        </button>
        <span className="text-white/40 text-[11px]">Cancel</span>
      </div>
    </div>
  );
}
