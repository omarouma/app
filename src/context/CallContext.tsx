import { useEffect, useRef, useState, useCallback } from 'react';
import { useCallStore } from '@/store/useCallStore';
import { useAuthStore } from '@/store/useAuthStore';
import { CallContextBase } from './CallContextBase';
import type { CallContextValue } from './CallContextBase';
import type { CallRecord } from '@/types';
import { stopStreamTracks } from '@/lib/utils';

const isClient = typeof window !== 'undefined';

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { currentCall, startCall: _startCall, endCall: _endCall, acceptCall: _acceptCall, rejectCall: _rejectCall } = useCallStore();
  const currentUser = useAuthStore((s) => s.user);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callTypeRef = useRef<CallRecord['type']>('voice');

  useEffect(() => {
    if (currentCall?.type) {
      callTypeRef.current = currentCall.type;
    }
  }, [currentCall?.type]);

  useEffect(() => {
    if (currentCall?.status === 'connected') {
      timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setCallDuration(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentCall?.status]);

const startCall = useCallback(async (targetUser: { id: string; currentUserId?: string }, mode: 'video' | 'voice') => {
    if (!isClient) return;
    // Derive the current user from the auth store so callers only need to pass
    // the target user's id (e.g. ChatRoom's startCall({ id }, mode)). The
    // optional currentUserId is kept for backward compatibility.
    const userId = targetUser.currentUserId ?? currentUser?.id;
    if (!userId) return;
    // Media capture is handled by WebRTCCall (via useWebRTCManager) which owns
    // the local stream lifecycle. Here we only set up the call record.
    return _startCall(targetUser.id, userId, mode);
  }, [_startCall, currentUser?.id]);

  const acceptCall = useCallback(async () => {
    if (!isClient) return;
    // Media capture is handled by WebRTCCall (via useWebRTCManager) which owns
    // the local stream lifecycle. Here we only accept the call record.
    await _acceptCall();
  }, [_acceptCall]);

  const endCall = useCallback(async () => {
    stopStreamTracks(localStream);
    setLocalStream(null);
    setRemoteStream(null);
    await _endCall();
  }, [_endCall, localStream]);

  const activeCall = currentCall ? {
    id: currentCall.id,
    status: currentCall.status,
    type: currentCall.type,
    initiatorId: currentCall.initiatorId,
  } : null;

  const muteAudio = useCallback(() => {
    setIsMuted(m => {
      const next = !m;
      localStream?.getAudioTracks().forEach(t => t.enabled = !next);
      return next;
    });
  }, [localStream]);

  const toggleVideo = useCallback(() => {
    setIsVideoOn(v => {
      const next = !v;
      localStream?.getVideoTracks().forEach(t => t.enabled = next);
      return next;
    });
  }, [localStream]);

  const value: CallContextValue = {
    activeCall,
    isCallActive: !!currentCall && currentCall.status !== 'ended' && currentCall.status !== 'rejected',
    localTracks: localStream?.getTracks() ?? [],
    remoteParticipants: remoteStream ? [{ id: 'remote', stream: remoteStream }] : [],
    isMuted,
    isVideoOn,
    callDuration,
    startCall,
    acceptCall,
    endCall,
    rejectCall: _rejectCall,
    muteAudio,
    toggleVideo,
  };

  return (
    <CallContextBase.Provider value={value}>
      {children}
    </CallContextBase.Provider>
  );
}