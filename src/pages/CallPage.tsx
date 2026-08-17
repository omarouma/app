import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useCallStore } from '@/store/useCallStore';
import { useCallContext } from '@/context/CallContextBase';
import { useAppPermissions } from '@/hooks/useAppPermissions';
import { PhoneOff, MessageSquare, RotateCw, ShieldAlert } from 'lucide-react';
import { withRetry, logErrorEvent } from '@/lib/errorHandling';

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
  const { startCall, currentCall, cancelCallIfStale } = useCallStore();
  const { endCall } = useCallContext();
  const { ensureCallPermissions } = useAppPermissions();
  const initiatedRef = useRef(false);
  const hadCallRef = useRef(false);
  const switchingToUserIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const friend = friends.find((f) => f.id === userId);
  const isVideo = mode === 'video';

  useEffect(() => {
    if (!userId || !currentUser) return;
    if (initiatedRef.current) return;
    // If there's already an active call for a different user, end it first and
    // then start the new call. Set switchingToUserId to prevent the post-end
    // auto-navigate effect from bouncing us to /calls before the new call starts.
    if (currentCall && !currentCall.participantIds.includes(userId)) {
      switchingToUserIdRef.current = userId;
      void endCall().then(() => {
        initiatedRef.current = false;
      });
      return;
    }
    if (currentCall) return;
    initiatedRef.current = true;
    switchingToUserIdRef.current = null;
    setError(null);
    // Ensure camera/microphone permissions are granted before starting the call
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

  // Track once a call has actually been established so we don't redirect on
  // the initial mount while startCall() is still resolving (currentCall is
  // still null at that point).
  useEffect(() => {
    if (currentCall) {
      hadCallRef.current = true;
      switchingToUserIdRef.current = null;
    }
  }, [currentCall]);

  // Auto-navigate away only AFTER a call was established and then ended.
  // Skip navigation when we're mid-switch (ending call A to start call B).
  useEffect(() => {
    if (hadCallRef.current && !currentCall && switchingToUserIdRef.current !== userId) {
      navigate('/calls', { replace: true });
    }
  }, [currentCall, navigate, userId]);

  // Clean up pending call timeouts on unmount
  useEffect(() => {
    return () => {
      cancelCallIfStale();
    };
  }, [cancelCallIfStale]);

  const handleEndCall = async () => {
    await endCall();
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
        // Use withRetry for automatic exponential backoff on network failures
        await withRetry(
          () => startCall(userId, currentUser.id, isVideo ? 'video' : 'voice'),
          3, // max 3 retries
          1000, // 1s initial delay
          { component: 'CallPage', action: 'call_initiation' }
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start the call.';
      setError(message);
      // Log error event for monitoring
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

  // If media access failed, show a clear error with a retry option instead of
  // silently showing a stuck "Connecting…" screen.
  if (error) {
    return (
      <div className="h-[100dvh] bg-[#111111] flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-1">
          <ShieldAlert size={28} className="text-red-400" />
        </div>
        <p className="text-white font-semibold">{friend?.name || 'User'}</p>
        <p className="text-[#FF6B6B] text-sm max-w-xs">{error}</p>
        <p className="text-white/40 text-xs max-w-xs">
          Make sure microphone{cameraNeeded(isVideo) ? ' and camera' : ''} permissions are allowed, then try again.
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

  // CallOverlay handles the full-screen call UI — this page is just the initiator
  // and shows a minimal fallback if the overlay hasn't mounted yet
  return (
    <div className="h-[100dvh] bg-[#111111] flex flex-col items-center justify-center gap-4 p-6">
      <p className="text-white/50 text-sm">
        {currentCall?.status === 'connected' ? 'Call active' : 'Connecting…'}
      </p>
      <p className="text-white font-semibold">{friend?.name || 'User'}</p>
      <div className="flex gap-3 mt-4">
        <button type="button" onClick={handleEndCall}
          className="flex items-center gap-2 px-5 py-3 bg-[#FF3B30] text-white rounded-full text-sm font-semibold">
          <PhoneOff size={16} /> End Call
        </button>
        <button type="button" onClick={() => navigate(`/chat/${userId}`)}
          className="flex items-center gap-2 px-5 py-3 bg-white/10 text-white rounded-full text-sm">
          <MessageSquare size={16} /> Chat
        </button>
      </div>
    </div>
  );
}

function cameraNeeded(isVideo: boolean): boolean {
  return isVideo;
}
