import { useEffect, useRef, useState, useCallback } from 'react';
import { useCallStore } from '@/store/useCallStore';
import { useAuthStore } from '@/store/useAuthStore';
import { WebRTCCall, type WebRTCCallState } from '@/lib/webrtc';
import { playCallConnected, vibrateCallConnected, playCallEnded, vibrateCallEnded } from '@/lib/sounds';

const CONNECTION_TIMEOUT_MS = 30_000;

export function useWebRTCManager() {
  const { currentCall, endCall: endCallInStore } = useCallStore();
  const currentUser = useAuthStore((s) => s.user);

  const webrtcRef = useRef<WebRTCCall | null>(null);
  const initializedCallId = useRef<string | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const [isConnected, setIsConnected] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [quality, setQuality] = useState<'good' | 'poor' | 'reconnecting'>('good');

  const clearConnectTimeout = () => {
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  };

const resetCallState = () => {
    clearConnectTimeout();
    setIsConnected(false);
    setLocalStream(null);
    setRemoteStream(null);
    setQuality('good');
  };

  useEffect(() => {
    if (!currentCall && initializedCallId.current) {
      webrtcRef.current?.endCall();
      webrtcRef.current = null;
      initializedCallId.current = null;
      resetCallState();
    }

    if (!currentCall || !currentUser || initializedCallId.current === currentCall.id) {
      return;
    }

    const otherUserId = currentCall.participantIds.find((id) => id !== currentUser.id);
    if (!otherUserId) return;

    const onStateChange = (state: WebRTCCallState) => {
      if (state === 'connected') {
        clearConnectTimeout();
        setIsConnected(true);
        playCallConnected();
        vibrateCallConnected();
      }
      if (state === 'ended' || state === 'error') {
        clearConnectTimeout();
        setIsConnected(false);
        endCallInStore();
      }
    };

    const webrtc = new WebRTCCall(
      currentUser.id,
      otherUserId,
      currentCall.type === 'video',
      onStateChange,
      setRemoteStream,
      setLocalStream,
    );

webrtcRef.current = webrtc;
    initializedCallId.current = currentCall.id;
    setIsVideoOn(currentCall.type === 'video');
    setIsMuted(false);
    setQuality('good');
    webrtc.setOnQualityChange(setQuality);

    let cancelled = false;
    const isInitiator = currentCall.initiatorId === currentUser.id;

    const p = isInitiator
      ? webrtc.startCall(currentCall.id)
      : webrtc.answerCall(currentCall.id);

    p.catch(() => {
      if (!cancelled) {
        clearConnectTimeout();
        endCallInStore();
      }
    });

    // Time out the call if the peer connection never establishes within a
    // reasonable window (e.g. the callee never answered / network stalled).
    clearConnectTimeout();
    connectTimeoutRef.current = setTimeout(() => {
      if (cancelled || isConnected) return;
      if (webrtcRef.current === webrtc) {
        webrtc.endCall();
        endCallInStore();
      }
    }, CONNECTION_TIMEOUT_MS);

    return () => {
      cancelled = true;
      clearConnectTimeout();
      if (initializedCallId.current === currentCall.id) {
        webrtcRef.current?.endCall();
        webrtcRef.current = null;
        initializedCallId.current = null;
        resetCallState();
      }
    };
  }, [currentCall, currentUser, endCallInStore]);

  const endCall = useCallback(() => {
    webrtcRef.current?.endCall();
    playCallEnded();
    vibrateCallEnded();
  }, []);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    webrtcRef.current?.toggleAudio(!nextMuted);
    setIsMuted(nextMuted);
  }, [isMuted]);

  const toggleVideo = useCallback(() => {
    const nextVideoOn = !isVideoOn;
    webrtcRef.current?.toggleVideo(nextVideoOn);
    setIsVideoOn(nextVideoOn);
  }, [isVideoOn]);

  const flipCamera = useCallback(() => {
    webrtcRef.current?.flipCamera();
  }, []);

return {
    isConnected,
    localStream,
    remoteStream,
    isMuted,
    isVideoOn,
    quality,
    endCall,
    toggleMute,
    toggleVideo,
    flipCamera,
  };
}
