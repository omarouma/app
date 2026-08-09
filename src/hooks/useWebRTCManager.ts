import { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { useCallStore } from '@/store/useCallStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useAgoraCall, type AgoraRemoteParticipant } from '@/hooks/useAgoraCall';
import { isAgoraConfigured as isAgoraEnvConfigured } from '@/lib/agoraToken';
import { playCallConnected, vibrateCallConnected, playCallEnded, vibrateCallEnded } from '@/lib/sounds';

const CONNECTION_TIMEOUT_MS = 30_000;

// Shown when Agora is not configured so the UI can surface a clear error
// instead of an endless "Connecting…" ring.
export const AGORA_NOT_CONFIGURED_ERROR =
  'Calls are not enabled yet. Agora App ID is not configured.';

function hashUid(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0) || 1;
}

export function useWebRTCManager() {
  const { currentCall, endCall: endCallInStore } = useCallStore();
  const currentUser = useAuthStore((s) => s.user);

  const agora = useAgoraCall();

const [isConnected, setIsConnected] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  // Multi-party: bridged remote participants (Agora tracks → MediaStream) for
  // the call UI grid. Each entry carries the Agora uid + combined stream.
  const [remoteParticipants, setRemoteParticipants] = useState<
    { uid: string | number; stream: MediaStream }[]
  >([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isHeld, setIsHeld] = useState(false);
  const [quality, setQuality] = useState<'good' | 'poor' | 'reconnecting'>('good');
  const [configuredError, setConfiguredError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const joinedCallIdRef = useRef<string | null>(null);
  const wasConnectedRef = useRef(false);

  // Stable refs so closures always read the latest values without re-triggering effects
  const agoraRef = useRef(agora);
  const endCallInStoreRef = useRef(endCallInStore);
  useLayoutEffect(() => {
    agoraRef.current = agora;
    endCallInStoreRef.current = endCallInStore;
  });

  const clearConnectTimeout = useCallback(() => {
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  }, []);

  // ─── Bridge Agora tracks → MediaStream for the legacy UI ───────────────
  useEffect(() => {
    const tracks: MediaStreamTrack[] = [];
    if (agora.localAudioTrack) tracks.push(agora.localAudioTrack.getMediaStreamTrack());
    if (agora.localVideoTrack) tracks.push(agora.localVideoTrack.getMediaStreamTrack());
    setLocalStream(tracks.length > 0 ? new MediaStream(tracks) : null);
  }, [agora.localAudioTrack, agora.localVideoTrack]);

useEffect(() => {
    const tracks: MediaStreamTrack[] = [];
    if (agora.remoteAudioTrack) tracks.push(agora.remoteAudioTrack.getMediaStreamTrack());
    if (agora.remoteVideoTrack) tracks.push(agora.remoteVideoTrack.getMediaStreamTrack());
    setRemoteStream(tracks.length > 0 ? new MediaStream(tracks) : null);
  }, [agora.remoteAudioTrack, agora.remoteVideoTrack]);

  // Bridge every remote participant's Agora tracks → a combined MediaStream.
  useEffect(() => {
    const participants = agora.remoteParticipants.map((p: AgoraRemoteParticipant) => {
      const tracks: MediaStreamTrack[] = [];
      if (p.audioTrack) tracks.push(p.audioTrack.getMediaStreamTrack());
      if (p.videoTrack) tracks.push(p.videoTrack.getMediaStreamTrack());
      return { uid: p.user.uid, stream: tracks.length > 0 ? new MediaStream(tracks) : new MediaStream() };
    });
    setRemoteParticipants(participants);
  }, [agora.remoteParticipants]);

  // ─── Mirror Agora state into the hook's public fields ──────────────────
  useEffect(() => setIsConnected(agora.isConnected), [agora.isConnected]);
  useEffect(() => setIsMuted(agora.isMuted), [agora.isMuted]);
  useEffect(() => setIsVideoOn(agora.isVideoOn), [agora.isVideoOn]);
  useEffect(() => setIsHeld(agora.isHeld), [agora.isHeld]);
  useEffect(() => setQuality(agora.quality), [agora.quality]);
  useEffect(() => setMediaError(agora.error), [agora.error]);
  // Clear media errors when the call identity changes (a new call attempt)
  useEffect(() => {
    if (currentCall?.id) setMediaError(null);
  }, [currentCall?.id]);

  // ─── Play "connected" sound when Agora connects ────────────────────────
  useEffect(() => {
    if (agora.isConnected && !wasConnectedRef.current) {
      wasConnectedRef.current = true;
      playCallConnected();
      vibrateCallConnected();
    } else if (!agora.isConnected) {
      wasConnectedRef.current = false;
    }
  }, [agora.isConnected]);

  // ─── Join the Agora channel when the call becomes active ───────────────
  useEffect(() => {
    if (!currentCall || !currentUser) return;
    if (!isAgoraEnvConfigured(import.meta.env.VITE_AGORA_APP_ID)) {
      // Surface a clear error instead of silently never connecting.
      setConfiguredError('Agora is not configured. Set VITE_AGORA_APP_ID in your environment to enable calls.');
      return;
    }
    setConfiguredError(null);

    const isInitiator = currentCall.initiatorId === currentUser.id;
    if (!isInitiator && currentCall.status !== 'connected') return;

    const callId = currentCall.id;
    if (joinedCallIdRef.current === callId) return;
    joinedCallIdRef.current = callId;

    const channelName = `call_${callId}`;
    const uid = hashUid(currentUser.id);
    const isVideo = currentCall.type === 'video';

    setIsVideoOn(isVideo);
    setQuality('good');
    setIsHeld(false);

    agoraRef.current.join(channelName, uid, isVideo);

    clearConnectTimeout();
    connectTimeoutRef.current = setTimeout(() => {
      if (joinedCallIdRef.current !== callId) return;
      if (agoraRef.current.isConnected) return;
      agoraRef.current.leave();
      endCallInStoreRef.current();
    }, CONNECTION_TIMEOUT_MS);

    return () => { clearConnectTimeout(); };
    // Only re-run when the call identity/status changes, not on every agora render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCall?.id, currentCall?.status, currentCall?.initiatorId, currentCall?.type, currentUser?.id, clearConnectTimeout]);

  // ─── Cleanup when the call ends (from store) ───────────────────────────
  useEffect(() => {
    if (!currentCall && joinedCallIdRef.current) {
      agoraRef.current.leave();
      joinedCallIdRef.current = null;
      clearConnectTimeout();
      wasConnectedRef.current = false;
    }
  }, [currentCall, clearConnectTimeout]);

  const endCall = useCallback(() => {
    clearConnectTimeout();
    joinedCallIdRef.current = null;
    wasConnectedRef.current = false;
    agoraRef.current.leave();
    playCallEnded();
    vibrateCallEnded();
    endCallInStoreRef.current();
  }, [clearConnectTimeout]);

  const toggleMute = useCallback(() => { agoraRef.current.toggleMute(); }, []);
  const toggleVideo = useCallback(() => { agoraRef.current.toggleVideo(); }, []);
  const flipCamera = useCallback(() => { void agoraRef.current.flipCamera(); }, []);

  const hold = useCallback(() => {
    if (agoraRef.current.isHeld) return;
    agoraRef.current.setHeld(true);
  }, []);

  const resume = useCallback(() => {
    if (!agoraRef.current.isHeld) return;
    agoraRef.current.setHeld(false);
  }, []);

  const toggleHold = useCallback(() => {
    agoraRef.current.setHeld(!agoraRef.current.isHeld);
  }, []);

  const sendDTMF = useCallback(async (_tone: string): Promise<boolean> => false, []);

return {
    isConnected,
    localStream,
    remoteStream,
    remoteParticipants,
    isMuted,
    isVideoOn,
    isHeld,
    quality,
    configuredError,
    mediaError,
    endCall,
    toggleMute,
    toggleVideo,
    flipCamera,
    hold,
    resume,
    toggleHold,
    sendDTMF,
  };
}

export default useWebRTCManager;
