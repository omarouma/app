import { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { useCallStore } from '@/store/useCallStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useZegoCall, type ZegoCallController } from '@/hooks/useZegoCall';
import { deriveZegoUserID, buildZegoRoomID, isZegoConfigured } from '@/lib/zego';
import { isVideoCallType } from '@/lib/callUtils';
import { playCallConnected, vibrateCallConnected, playCallEnded, vibrateCallEnded } from '@/lib/sounds';

const CONNECTION_TIMEOUT_MS = 30_000;

// Shown when ZEGO is not configured so the UI can surface a clear error
// instead of an endless "Connecting…" ring.
export const ZEGO_NOT_CONFIGURED_ERROR =
  'Calls are not enabled yet. ZEGO Cloud is not configured.';

export function useWebRTCManager() {
  const { currentCall, endCall: endCallInStore } = useCallStore();
  const currentUser = useAuthStore((s) => s.user);

  const zego = useZegoCall();

  const [isConnected, setIsConnected] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  // For compatibility with the existing call UI, we try to expose a remote
  // stream when ZEGO reports a remote user. The prebuilt UI renders its own
  // video elements, so we keep this minimal.
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

  const clearConnectTimeout = useCallback(() => {
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  }, []);

  // Stable refs so closures always read the latest values without re-triggering effects
  const zegoRef = useRef<ZegoCallController>(zego);
  const endCallInStoreRef = useRef(endCallInStore);
  useLayoutEffect(() => {
    zegoRef.current = zego;
    endCallInStoreRef.current = endCallInStore;
  });

  // When the ZEGO prebuilt UI's own End button is pressed, onLeaveRoom fires —
  // we must close the Firestore call record too, otherwise the call is stuck.
  useLayoutEffect(() => {
    const invite = () => {
      endCallInStoreRef.current();
    };
    zegoRef.current.onRoomEnded?.(invite);
  }, []);

  // ─── Bridge ZEGO local stream → MediaStream for the legacy UI ──────────
  useEffect(() => {
    setLocalStream(zego.localStream);
  }, [zego.localStream]);

  // ─── Mirror ZEGO state into the hook's public fields ──────────────────
  useEffect(() => setIsConnected(zego.isConnected), [zego.isConnected]);
  useEffect(() => setIsMuted(zego.isMuted), [zego.isMuted]);
  useEffect(() => setIsVideoOn(zego.isVideoOn), [zego.isVideoOn]);
  useEffect(() => setIsHeld(zego.isHeld), [zego.isHeld]);
  useEffect(() => setQuality(zego.quality), [zego.quality]);
  useEffect(() => setMediaError(zego.error), [zego.error]);
  // Clear media errors when the call identity changes (a new call attempt)
  useEffect(() => {
    if (currentCall?.id) setMediaError(null);
  }, [currentCall?.id]);

  // ─── Play "connected" sound when ZEGO connects ────────────────────────
  useEffect(() => {
    if (zego.isConnected && !wasConnectedRef.current) {
      wasConnectedRef.current = true;
      playCallConnected();
      vibrateCallConnected();
    } else if (!zego.isConnected) {
      wasConnectedRef.current = false;
    }
  }, [zego.isConnected]);

  // ─── Join the ZEGO room when the call becomes active ────────────────
  useEffect(() => {
    if (!currentCall || !currentUser) return;
    if (!isZegoConfigured()) {
      setConfiguredError('ZEGO Cloud is not configured. Enable calls to continue.');
      return;
    }
    setConfiguredError(null);

    const isInitiator = currentCall.initiatorId === currentUser.id;
    if (!isInitiator && currentCall.status !== 'connected') return;

    const callId = currentCall.id;
    // Only skip if we've already successfully joined THIS call.
    // The container mount can happen slightly after the effect fires, so we must
    // not mark this call as "joined" before the actual room join begins.
    if (joinedCallIdRef.current === callId && zegoRef.current.isJoined) return;

    const roomID = buildZegoRoomID(callId);
    const userID = deriveZegoUserID(currentUser.id);
    const userName = currentUser.name || currentUser.displayName || currentUser.id || 'User';
    // `video` and `group_video` both need the camera on
    const isVideo = isVideoCallType(currentCall.type);

    setIsVideoOn(isVideo);
    setQuality('good');
    setIsHeld(false);

    // Wait for the ZEGO container div to be mounted in CallOverlay (React
    // commits refs after render, but our effect runs before the next commit).
    // We retry until the container is actually present, instead of ending the
    // call early because the ref was not assigned in the first render pass.
    let joined = false;
    let joinAttempted = false;
    const containerCheck = setInterval(() => {
      if (joined || !zegoRef.current.containerRef.current) return;
      joined = true;
      clearInterval(containerCheck);
      joinedCallIdRef.current = callId;
      joinAttempted = true;
      void (async () => {
        try {
          await zegoRef.current.join(roomID, userID, userName, isVideo);
        } catch {
          if (joinedCallIdRef.current === callId) {
            joinedCallIdRef.current = null;
          }
        }
      })();
    }, 100);

    // Safety: if the container never appears, cancel the check but do not auto-end
    // immediately on a transient DOM timing mismatch; the retry loop above keeps
    // waiting for the mounted ref while the call is still active.
    const bailTimer = setTimeout(() => {
      clearInterval(containerCheck);
      if (!joined && !joinAttempted) {
        console.warn('[ZEGO] Container never mounted within the retry window — keeping the call in retry state.');
      }
    }, 15000);

    clearConnectTimeout();
    connectTimeoutRef.current = setTimeout(() => {
      if (joinedCallIdRef.current !== callId) return;
      if (zegoRef.current.isConnected) return;
      clearInterval(containerCheck);
      clearTimeout(bailTimer);
      if (!joined) {
        joinedCallIdRef.current = null;
        return;
      }
      void zegoRef.current.leave();
      endCallInStoreRef.current();
    }, CONNECTION_TIMEOUT_MS);

    return () => {
      clearConnectTimeout();
      clearInterval(containerCheck);
      clearTimeout(bailTimer);
    };
    // Only re-run when the call identity/status changes, not on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCall?.id, currentCall?.status, currentCall?.initiatorId, currentCall?.type, currentUser?.id, clearConnectTimeout]);

  // ─── Cleanup when the call ends (from store) ───────────────────────────
  useEffect(() => {
    if (!currentCall && joinedCallIdRef.current) {
      zegoRef.current.leave();
      joinedCallIdRef.current = null;
      clearConnectTimeout();
      wasConnectedRef.current = false;
      setRemoteStream(null);
      setRemoteParticipants([]);
    }
  }, [currentCall, clearConnectTimeout]);

  const endCall = useCallback(() => {
    clearConnectTimeout();
    joinedCallIdRef.current = null;
    wasConnectedRef.current = false;
    zegoRef.current.leave();
    setRemoteStream(null);
    setRemoteParticipants([]);
    playCallEnded();
    vibrateCallEnded();
    // NOTE: Do NOT call endCallInStoreRef.current() here — CallContext.endCall
    // already calls the store's endCall via _endCall(). Calling it here would
    // cause a double end-call (the store's endCall would run twice).
  }, [clearConnectTimeout]);

  const toggleMute = useCallback(() => { zegoRef.current.toggleMute(); }, []);
  const toggleVideo = useCallback(() => { zegoRef.current.toggleVideo(); }, []);
  const flipCamera = useCallback(() => { void zegoRef.current.flipCamera(); }, []);

  const hold = useCallback(() => {
    if (zegoRef.current.isHeld) return;
    zegoRef.current.setHeld(true);
  }, []);

  const resume = useCallback(() => {
    if (!zegoRef.current.isHeld) return;
    zegoRef.current.setHeld(false);
  }, []);

  const toggleHold = useCallback(() => {
    zegoRef.current.setHeld(!zegoRef.current.isHeld);
  }, []);

  const sendDTMF = useCallback(async (tone: string): Promise<boolean> => {
    if (!tone || !zego.localStream) return false;
    
    try {
      // Get audio track from the local stream (provided by ZEGO)
      const audioTrack = zego.localStream.getAudioTracks()[0];
      if (!audioTrack) return false;

      // Find the peer connection from ZEGO instance
      // ZEGO uses internal PC that we need to access via the instance
      const zegoInstance = (zegoRef.current as unknown as { 
        _engine?: { _pc?: RTCPeerConnection };
        _peerConnectionManager?: { _pc?: RTCPeerConnection };
      });
      
      let pc = zegoInstance._engine?._pc;
      if (!pc) pc = zegoInstance._peerConnectionManager?._pc;
      
      if (!pc) return false;

      // Find the sender for the audio track
      const audioSender = pc.getSenders().find(s => s.track === audioTrack);
      if (!audioSender) return false;

      // Get DTMF sender and validate
      const dtmfSender = audioSender.dtmf;
      if (!dtmfSender || typeof dtmfSender.insertDTMF !== 'function') return false;

      // Validate tone (0-9, *, #, A-D)
      const char = tone.charAt(0).toUpperCase();
      if (!'0123456789*#ABCD'.includes(char)) return false;

      // Send the DTMF tone (100ms duration, 100ms gap)
      dtmfSender.insertDTMF(char, 100, 100);
      return true;
    } catch {
      // Silently fail if DTMF not supported or access fails
      return false;
    }
  }, [zego.localStream]);

  return {
    // ZEGO prebuilt container ref — mounted by CallOverlay to host the ZEGO UI
    containerRef: zego.containerRef,
    // True only after ZEGO has successfully joined the room. CallOverlay uses
    // this to swap from the legacy ring UI to ZEGO's full-screen UI.
    isZegoActive: zego.isJoined,
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