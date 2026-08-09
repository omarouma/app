import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useCallStore } from '@/store/useCallStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useWebRTCManager } from '@/hooks/useWebRTCManager';
import { CallContextBase } from './CallContextBase';
import type { CallContextValue } from './CallContextBase';
import type { CallRecord } from '@/types';

const isClient = typeof window !== 'undefined';

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { currentCall, startCall: _startCall, endCall: _endCall, acceptCall: _acceptCall, rejectCall: _rejectCall } = useCallStore();
  const currentUser = useAuthStore((s) => s.user);

const {
    isConnected, localStream, remoteStream, remoteParticipants, isMuted, isVideoOn, isHeld, quality,
    configuredError, mediaError,
    endCall: endWebRTC, toggleMute, toggleVideo, flipCamera, toggleHold, sendDTMF, hold, resume,
  } = useWebRTCManager();

  const [callDuration, setCallDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callTypeRef = useRef<CallRecord['type']>('voice');

  useEffect(() => {
    if (currentCall?.type) {
      callTypeRef.current = currentCall.type;
    }
  }, [currentCall?.type]);

  useEffect(() => {
    if (isConnected && !isHeld) {
      setCallDuration(0);
      timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (!isHeld) setCallDuration(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isConnected, isHeld]);

  const startCall = useCallback(async (targetUser: { id: string; currentUserId?: string }, mode: 'video' | 'voice') => {
    if (!isClient) return;
    // Derive the current user from the auth store so callers only need to pass
    // the target user's id (e.g. ChatRoom's startCall({ id }, mode)). The
    // optional currentUserId is kept for backward compatibility.
    const userId = targetUser.currentUserId ?? currentUser?.id;
    if (!userId) return;
    // Media capture is handled by useWebRTCManager (via WebRTCCall) which owns
    // the local stream lifecycle. Here we only set up the call record.
    return _startCall(targetUser.id, userId, mode);
  }, [_startCall, currentUser?.id]);

  const acceptCall = useCallback(async () => {
    if (!isClient) return;
    // Media capture is handled by useWebRTCManager (via WebRTCCall) which owns
    // the local stream lifecycle. Here we only accept the call record.
    await _acceptCall();
  }, [_acceptCall]);

  // Ending the call must release the WebRTC session (stops camera/mic tracks)
  // before clearing store state, so resources are freed deterministically.
  const endCall = useCallback(async () => {
    endWebRTC();
    await _endCall();
  }, [endWebRTC, _endCall]);

  const activeCall = currentCall ? {
    id: currentCall.id,
    status: currentCall.status,
    type: currentCall.type,
    initiatorId: currentCall.initiatorId,
  } : null;

  const value: CallContextValue = {
    activeCall,
    isCallActive: !!currentCall && currentCall.status !== 'ended' && currentCall.status !== 'rejected',
    localStream,
    remoteStream,
localTracks: localStream?.getTracks() ?? [],
    remoteParticipants: remoteParticipants.length > 0
      ? remoteParticipants.map((p) => ({ id: String(p.uid), stream: p.stream }))
      : (remoteStream ? [{ id: 'remote', stream: remoteStream }] : []),
    isMuted,
    isVideoOn,
    isConnected,
    isHeld,
    quality,
    callDuration,
    configuredError,
    mediaError,
    startCall,
    acceptCall,
    endCall,
    rejectCall: _rejectCall,
    muteAudio: toggleMute,
    toggleMute,
    toggleVideo,
    flipCamera,
    toggleHold,
    sendDTMF,
    hold,
    resume,
  };

  return (
    <CallContextBase.Provider value={value}>
      {children}
    </CallContextBase.Provider>
  );
}
