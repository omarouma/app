import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useCallStore } from '@/store/useCallStore';
import { PhoneOff, MessageSquare, RotateCw } from 'lucide-react';

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
  const { startCall, endCall, currentCall } = useCallStore();
  const initiatedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const friend = friends.find((f) => f.id === userId);
  const isVideo = mode === 'video';

  useEffect(() => {
    if (!userId || !currentUser || currentCall) return;
    if (initiatedRef.current) return;
    initiatedRef.current = true;
    setError(null);
    startCall(userId, currentUser.id, isVideo ? 'video' : 'voice')
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to start the call.');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, currentUser?.id, isVideo]);

  // Auto-navigate away when call ends
  useEffect(() => {
    if (initiatedRef.current && !currentCall) {
      navigate('/calls', { replace: true });
    }
  }, [currentCall, navigate]);

  const handleEndCall = async () => {
    await endCall();
    navigate('/calls', { replace: true });
  };

  const handleRetry = () => {
    initiatedRef.current = false;
    setError(null);
    if (userId && currentUser) {
      initiatedRef.current = true;
      startCall(userId, currentUser.id, isVideo ? 'video' : 'voice')
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Failed to start the call.');
        });
    }
  };

  if (!userId || !currentUser) {
    return (
      <div className="h-[100dvh] bg-white flex flex-col items-center justify-center p-6 text-center">
        <p className="text-[#111111] text-lg font-semibold mb-2">No contact selected</p>
        <p className="text-[#8D8D8D] text-sm max-w-sm mb-4">Choose a contact from chats or contacts before starting a call.</p>
        <button type="button" onClick={() => navigate('/chats')}
          className="px-5 py-3 bg-[#00C300] text-white rounded-full text-sm font-semibold">
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
