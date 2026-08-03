import { useEffect, useRef, useState, useCallback } from 'react';
import { useCallStore } from '@/store/useCallStore';
import { CallContextBase } from './CallContextBase';
import type { CallContextValue } from './CallContextBase';
import type { CallRecord } from '@/types';
import { stopStreamTracks } from '@/lib/utils';

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { currentCall, startCall: _startCall, endCall: _endCall, acceptCall: _acceptCall, rejectCall: _rejectCall } = useCallStore();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callTypeRef = useRef<CallRecord['type']>('voice');

  // Keep ref in sync with current call type for useCallback stability
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
      queueMicrotask(() => setCallDuration(0));
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentCall?.status]);


  const startCall = useCallback(async (targetUser: { id: string; currentUserId?: string }, mode: 'video' | 'voice') => {
    if (!targetUser.currentUserId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: mode === 'video',
      });
      setLocalStream(stream);
    } catch {
      // media access denied — call proceeds without local stream
    }
    return _startCall(targetUser.id, targetUser.currentUserId, mode);
  }, [_startCall]);

  const acceptCall = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callTypeRef.current === 'video',
      });
      setLocalStream(stream);
    } catch {
      // media access denied — call proceeds without local stream
    }
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
      if (localStream) {
        for (const t of localStream.getAudioTracks()) t.enabled = !next;
      }
      return next;
    });
  }, [localStream]);

  const toggleVideo = useCallback(() => {
    setIsVideoOn(v => {
      const next = !v;
      if (localStream) {
        for (const t of localStream.getVideoTracks()) t.enabled = next;
      }
      return next;
    });
  }, [localStream]);

  const value: CallContextValue = {
    activeCall,
    isCallActive: !!currentCall && currentCall.status !== 'ended' && currentCall.status !== 'rejected',
    localTracks: localStream ? localStream.getTracks() : [],
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
