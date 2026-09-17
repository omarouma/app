import { useCallback, useEffect, useRef, useState } from 'react';
import { useCallStore } from '@/store/useCallStore';
import { useAuthStore } from '@/store/useAuthStore';
import { AlibabaCall, type CallQuality } from '@/lib/alibabaCall';
import env from '@/config/env';
import { isVideoCallType } from '@/lib/callUtils';

export function useWebRTCManager() {
  const call = useCallStore(s => s.currentCall);
  const user = useAuthStore(s => s.user);
  const engine = useRef<AlibabaCall | null>(null);
  const [quality, setQuality] = useState<CallQuality>('reconnecting');
  const [isConnected, setConnected] = useState(false);
  const [localStream, setLocal] = useState<MediaStream | null>(null);
  const [remoteStream, setRemote] = useState<MediaStream | null>(null);
  const [mediaError, setError] = useState<string | null>(null);
  const [isMuted, setMuted] = useState(false);
  const [isVideoOn, setVideo] = useState(false);
  const [isHeld, setHeld] = useState(false);

  const callType = call?.type;
  const isGroupCall = !!callType?.startsWith('group_');
  // The peer connection only runs for an accepted 1:1 call.
  const activeCallId = call && user && call.status === 'connected' && !isGroupCall ? call.id : null;

  // Reset per-call state when the active call changes. Adjusting state during
  // render is the React-recommended alternative to a synchronous setState in an
  // effect and avoids the cascading-render warning.
  const [trackedCallId, setTrackedCallId] = useState<string | null>(null);
  if (activeCallId !== trackedCallId) {
    setTrackedCallId(activeCallId);
    setError(null);
    setQuality('reconnecting');
    setConnected(false);
    setMuted(false);
    setHeld(false);
    setVideo(!!callType && isVideoCallType(callType));
  }

  useEffect(() => {
    if (!activeCallId || !callType) return;
    let active = true;
    const peer = new AlibabaCall({ local: stream => { if (active) setLocal(stream); }, remote: stream => { if (active) setRemote(stream); }, connected: connected => { if (active) setConnected(connected); }, error: error => { if (active) setError(error); }, quality: value => { if (active) setQuality(value); } });
    engine.current = peer;
    void peer.start(activeCallId, isVideoCallType(callType)).catch(error => {
      if (active) { peer.close(); setError(error instanceof Error ? error.message : 'Unable to start calling.'); }
    });
    return () => { active = false; peer.close(); engine.current = null; setConnected(false); setLocal(null); setRemote(null); };
  }, [activeCallId, callType]);

  const endCall = useCallback(() => { engine.current?.close(); engine.current = null; setConnected(false); setLocal(null); setRemote(null); }, []);
  const toggleMute = useCallback(() => { setMuted(value => { engine.current?.audio(value && !isHeld); return !value; }); }, [isHeld]);
  const toggleVideo = useCallback(() => { setVideo(value => { engine.current?.video(!value && !isHeld); return !value; }); }, [isHeld]);
  const hold = useCallback(() => { engine.current?.audio(false); engine.current?.video(false); setHeld(true); }, []);
  const resume = useCallback(() => { engine.current?.audio(!isMuted); engine.current?.video(isVideoOn); setHeld(false); }, [isMuted, isVideoOn]);
  const toggleHold = useCallback(() => { if (isHeld) resume(); else hold(); }, [isHeld, resume, hold]);
  const flipCamera = useCallback(async () => { try { await engine.current?.flip(); } catch { setError('Unable to switch camera.'); } }, []);
  const sendDTMF = useCallback(async (tone: string) => engine.current?.dtmf(tone) || false, []);

  // Group calling is not part of this release; surface a clear, derived message.
  const groupError = isGroupCall ? 'Group calling is not enabled in this release.' : null;

  return { isConnected, localStream, remoteStream, remoteParticipants: [], isMuted, isVideoOn, isHeld, quality, configuredError: env.VITE_CALLING_API_URL ? null : 'Calling service is not configured yet.', mediaError: mediaError ?? groupError, toggleMute, toggleVideo, flipCamera, toggleHold, sendDTMF, hold, resume, endCall };
}
