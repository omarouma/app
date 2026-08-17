import React, { useEffect, useRef, useState, useCallback, Suspense, lazy, startTransition } from 'react';
import { useCallStore } from '@/store/useCallStore';
import { useAuthStore } from '@/store/useAuthStore';
import { CallContextBase } from '@/context/CallContextBase';
import type { CallContextValue } from '@/context/CallContextBase';
import type { CallRecord } from '@/types';
import type { WebRTCState } from '@/context/WebRTCProvider';
import { CallConnectionMonitor } from '@/components/calling/CallConnectionMonitor';

const isClient = typeof window !== 'undefined';

// Lazy-load the WebRTC manager component only when a call is active.
// This defers the ZEGO Cloud SDK bundle until it's actually needed.
const WebRTCProviderLazy = lazy(() => import('@/context/WebRTCProvider'));

// Default values when WebRTC is not initialized (no active call)
const DEFAULT_WEBRTC_STATE: WebRTCState = {
  containerRef: { current: null } as React.RefObject<HTMLDivElement | null>,
  isZegoActive: false,
  isConnected: false,
  localStream: null,
  remoteStream: null,
  remoteParticipants: [],
  isMuted: false,
  isVideoOn: true,
  isHeld: false,
  quality: 'good',
  configuredError: null,
  mediaError: null,
  toggleMute: () => { },
  toggleVideo: () => { },
  flipCamera: async () => { },
  toggleHold: () => { },
  sendDTMF: async (_tone: string) => false,
  hold: () => { },
  resume: () => { },
  endCall: () => { },
};

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { currentCall, startCall: _startCall, endCall: _endCall, acceptCall: _acceptCall, rejectCall: _rejectCall } = useCallStore();
  const currentUser = useAuthStore((s) => s.user);

  // Store the WebRTC state from the lazy component
  const [webrtcState, setWebrtcState] = useState<WebRTCState>(DEFAULT_WEBRTC_STATE);
  const [callDuration, setCallDuration] = useState(0);
  const handleWebRTCStateChange = useCallback((state: WebRTCState) => {
    setWebrtcState(state);
  }, []);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callTypeRef = useRef<CallRecord['type']>('voice');
  const wasConnectedRef = useRef(webrtcState.isConnected);

  useEffect(() => {
    if (currentCall?.type) {
      callTypeRef.current = currentCall.type;
    }
  }, [currentCall?.type]);

  // Reset the duration when a new call connects
  useEffect(() => {
    // Only reset when connection state changes from false to true
    if (webrtcState.isConnected && !wasConnectedRef.current) {
      startTransition(() => {
        setCallDuration(0);
      });
    }
    wasConnectedRef.current = webrtcState.isConnected;
  }, [webrtcState.isConnected]);

  // Tick the duration only while connected and not held
  useEffect(() => {
    if (!webrtcState.isConnected || webrtcState.isHeld) return;
    timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [webrtcState.isConnected, webrtcState.isHeld]);

  const startCall = useCallback(async (targetUser: { id: string; currentUserId?: string }, mode: 'video' | 'voice') => {
    if (!isClient) return;
    const userId = targetUser.currentUserId ?? currentUser?.id;
    if (!userId) return;
    return _startCall(targetUser.id, userId, mode);
  }, [_startCall, currentUser?.id]);

  const acceptCall = useCallback(async () => {
    if (!isClient) return;
    await _acceptCall();
  }, [_acceptCall]);

  const endCall = useCallback(async () => {
    webrtcState.endCall();
    await _endCall();
  }, [webrtcState, _endCall]);

  const activeCall = currentCall ? {
    id: currentCall.id,
    status: currentCall.status,
    type: currentCall.type,
    initiatorId: currentCall.initiatorId,
  } : null;

  const value: CallContextValue = {
    // ZEGO prebuilt container ref — CallOverlay mounts this <div> so ZEGO renders inside.
    containerRef: webrtcState.containerRef,
    // Only true once ZEGO has joined the room — lets CallOverlay swap from the
    // legacy ring UI to ZEGO's full-screen UI. Prevents black screen.
    isZegoActive: webrtcState.isZegoActive,
    activeCall,
    isCallActive: !!currentCall && currentCall.status !== 'ended' && currentCall.status !== 'rejected',
    localStream: webrtcState.localStream,
    remoteStream: webrtcState.remoteStream,
    localTracks: webrtcState.localStream?.getTracks() ?? [],
    remoteParticipants: webrtcState.remoteParticipants.length > 0
      ? webrtcState.remoteParticipants.map((p: { uid: string | number; stream: MediaStream }) => ({ id: String(p.uid), stream: p.stream }))
      : (webrtcState.remoteStream ? [{ id: 'remote', stream: webrtcState.remoteStream }] : []),
    isMuted: webrtcState.isMuted,
    isVideoOn: webrtcState.isVideoOn,
    isConnected: webrtcState.isConnected,
    isHeld: webrtcState.isHeld,
    quality: webrtcState.quality,
    callDuration,
    configuredError: webrtcState.configuredError,
    mediaError: webrtcState.mediaError,
    startCall,
    acceptCall,
    endCall,
    rejectCall: _rejectCall,
    muteAudio: webrtcState.toggleMute,
    toggleMute: webrtcState.toggleMute,
    toggleVideo: webrtcState.toggleVideo,
    flipCamera: webrtcState.flipCamera,
    toggleHold: webrtcState.toggleHold,
    sendDTMF: webrtcState.sendDTMF,
    hold: webrtcState.hold,
    resume: webrtcState.resume,
  };

  return (
    <CallContextBase.Provider value={value}>
      {/* Monitor connection state and handle errors */}
      <CallConnectionMonitor />

      {/* Only load WebRTC when there's an active call */}
      {currentCall && (
        <Suspense fallback={null}>
          <WebRTCProviderLazy
            onStateChange={handleWebRTCStateChange}
          />
        </Suspense>
      )}
      {children}
    </CallContextBase.Provider>
  );
}