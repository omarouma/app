import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff,
  Volume2, VolumeX, RotateCw, MessageSquare,
} from 'lucide-react';
import { useCallStore } from '@/store/useCallStore';
import { useAuthStore } from '@/store/useAuthStore';
import { WebRTCCall, type WebRTCCallState } from '@/lib/webrtc';
import {
  stopAllSounds, playCallEnded, vibrateCallEnded,
  playIncomingCall, playOutgoingCall, playCallConnected,
  vibrateIncomingCall, vibrateCallConnected,
} from '@/lib/sounds';
import { sanitizeMediaUrl, getDefaultAvatar } from '@/lib/utils';

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default function CallOverlay() {
  const navigate = useNavigate();
  const { currentCall, incomingCall, acceptCall, rejectCall, endCall } = useCallStore();
  const currentUser = useAuthStore((s) => s.user);

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const webrtcRef = useRef<WebRTCCall | null>(null);
  const initializedCallId = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringtoneRef = useRef<{ stop: () => void } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [otherUser, setOtherUser] = useState<{ id: string; name: string; avatar?: string } | null>(null);

  const isIncoming = !!incomingCall && !currentCall;
  const activeCall = currentCall ?? incomingCall;
  const isVideo = activeCall?.type === 'video';
  const otherUserId = activeCall
    ? activeCall.participantIds.find((id) => id !== currentUser?.id) ?? null
    : null;

  // ── Resolve other user info ───────────────────────────────────────────────
  useEffect(() => {
    if (!otherUserId) { setOtherUser(null); return; }
    import('@/lib/firestore').then(({ getDocById, COLLECTIONS }) => {
      getDocById(COLLECTIONS.USERS, otherUserId).then((data) => {
        setOtherUser({
          id: otherUserId,
          name: (data?.name as string) || (data?.displayName as string) || 'User',
          avatar: (data?.avatar as string) || undefined,
        });
      }).catch(() => setOtherUser({ id: otherUserId, name: 'User' }));
    }).catch(() => setOtherUser({ id: otherUserId, name: 'User' }));
  }, [otherUserId]);

  // ── Speaker routing ───────────────────────────────────────────────────────
  useEffect(() => {
    const el = remoteVideoRef.current ?? audioRef.current;
    if (!el) return;
    if ('setSinkId' in el && typeof (el as HTMLMediaElement & { setSinkId: (id: string) => Promise<void> }).setSinkId === 'function') {
      (el as HTMLMediaElement & { setSinkId: (id: string) => Promise<void> })
        .setSinkId(isSpeakerOn ? 'default' : '')
        .catch(() => {});
    }
  }, [isSpeakerOn]);

  // ── Ringtone ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isIncoming) {
      ringtoneRef.current = playIncomingCall();
      vibrateIncomingCall();
    } else if (currentCall?.status === 'calling') {
      playOutgoingCall();
    }
    return () => { ringtoneRef.current?.stop(); ringtoneRef.current = null; };
  }, [isIncoming, currentCall?.status]);

  // ── Call duration timer ───────────────────────────────────────────────────
  useEffect(() => {
    if (isConnected) {
      setCallDuration(0);
      timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isConnected]);

  // ── WebRTC init for outgoing calls ────────────────────────────────────────
  useEffect(() => {
    if (!currentCall || !currentUser) return;
    if (initializedCallId.current === currentCall.id) return;

    const onStateChange = (state: WebRTCCallState) => {
      if (state === 'connected') {
        setIsConnected(true);
        ringtoneRef.current?.stop();
        ringtoneRef.current = null;
        playCallConnected();
        vibrateCallConnected();
        useCallStore.getState().acceptCall();
      }
      if (state === 'ended') useCallStore.getState().endCall();
    };

    const webrtc = new WebRTCCall(
      currentUser.id,
      currentCall.participantIds.find((id) => id !== currentUser.id) ?? '',
      currentCall.type === 'video',
      onStateChange,
      (stream) => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream; },
      (stream) => { if (localVideoRef.current) localVideoRef.current.srcObject = stream; },
    );
    webrtcRef.current = webrtc;
    initializedCallId.current = currentCall.id;

    let cancelled = false;
    const p = currentCall.initiatorId === currentUser.id
      ? webrtc.startCall(currentCall.id)
      : webrtc.answerCall(currentCall.id);
    p.catch(() => { if (!cancelled) { webrtcRef.current = null; initializedCallId.current = null; } });

    return () => {
      cancelled = true;
      if (initializedCallId.current === currentCall.id) {
        try { webrtcRef.current?.endCall(); } catch { /* ignore */ }
        webrtcRef.current = null;
        initializedCallId.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCall?.id, currentUser?.id]);

  // ── Auto-navigate when call ends ──────────────────────────────────────────
  const prevHadCall = useRef(false);
  useEffect(() => {
    if (currentCall || incomingCall) {
      prevHadCall.current = true;
    } else if (prevHadCall.current) {
      prevHadCall.current = false;
      setIsConnected(false);
      setCallDuration(0);
      navigate('/calls', { replace: true });
    }
  }, [currentCall, incomingCall, navigate]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleAccept = useCallback(async () => {
    if (!incomingCall || !currentUser) return;
    // Guard against double-accept if component re-renders during async flow
    if (initializedCallId.current === incomingCall.id) return;
    initializedCallId.current = incomingCall.id;

    ringtoneRef.current?.stop();
    ringtoneRef.current = null;

    const callId = incomingCall.id;
    // Resolve the actual caller — always the initiator
    const callerId = incomingCall.initiatorId;

    const onStateChange = (state: WebRTCCallState) => {
      if (state === 'connected') { setIsConnected(true); playCallConnected(); vibrateCallConnected(); }
      if (state === 'ended') useCallStore.getState().endCall();
    };
    const webrtc = new WebRTCCall(
      currentUser.id, callerId, incomingCall.type === 'video',
      onStateChange,
      (stream) => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream; },
      (stream) => { if (localVideoRef.current) localVideoRef.current.srcObject = stream; },
    );
    webrtcRef.current = webrtc;

    // Answer WebRTC first so media is ready, then update Firestore status
    await webrtc.answerCall(callId);
    await acceptCall();
  }, [incomingCall, currentUser, acceptCall]);

  const handleReject = useCallback(() => {
    ringtoneRef.current?.stop();
    ringtoneRef.current = null;
    stopAllSounds();
    rejectCall();
  }, [rejectCall]);

  const handleEndCall = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    ringtoneRef.current?.stop();
    ringtoneRef.current = null;
    webrtcRef.current?.endCall();
    webrtcRef.current = null;
    initializedCallId.current = null;
    setIsConnected(false);
    stopAllSounds();
    playCallEnded();
    vibrateCallEnded();
    endCall();
  }, [endCall]);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => { webrtcRef.current?.toggleAudio(prev); return !prev; });
  }, []);

  const handleToggleVideo = useCallback(() => {
    setIsVideoOn((prev) => { webrtcRef.current?.toggleVideo(!prev); return !prev; });
  }, []);

  if (!currentCall && !incomingCall) return null;

  const avatarSrc = sanitizeMediaUrl(otherUser?.avatar)
    ? sanitizeMediaUrl(otherUser?.avatar)!
    : getDefaultAvatar(otherUser?.id ?? otherUser?.name ?? 'U');

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] flex flex-col overflow-hidden"
      >
        {/* Background */}
        {isVideo && !isIncoming ? (
          <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460]" />
        )}
        {/* Subtle overlay for readability */}
        <div className="absolute inset-0 bg-black/30" />

        {/* Local video PiP */}
        {isVideo && !isIncoming && (
          <>
            <video
              ref={localVideoRef}
              autoPlay muted playsInline
              className="absolute top-16 right-4 w-28 h-36 rounded-2xl object-cover shadow-xl bg-black/50 z-20 border border-white/10"
            />
            <button
              type="button"
              onClick={() => webrtcRef.current?.flipCamera()}
              className="absolute top-16 left-4 z-20 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white active:scale-95"
              aria-label="Flip camera"
            >
              <RotateCw size={18} />
            </button>
          </>
        )}

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full">
          {/* Top bar */}
          <div className="flex items-center justify-between px-5 pt-14 pb-4">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${isVideo ? 'bg-blue-500/20 text-blue-300' : 'bg-green-500/20 text-green-300'}`}>
              {isVideo ? '📹 Video' : '🎙 Voice'}
            </span>
            {isConnected && (
              <span className="text-white/60 text-sm font-mono">{formatDuration(callDuration)}</span>
            )}
            <button
              type="button"
              onClick={() => navigate(`/chat/${otherUserId}`)}
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/70 active:bg-white/20"
              aria-label="Open chat"
            >
              <MessageSquare size={16} />
            </button>
          </div>

          {/* Avatar + name */}
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className={`relative ${isVideo && isConnected ? 'w-20 h-20' : 'w-32 h-32'} rounded-full overflow-hidden shadow-2xl border-4 border-white/10`}
            >
              <img src={avatarSrc} className="w-full h-full object-cover" alt="User avatar" />
              {/* Pulse ring when ringing */}
              {!isConnected && (
                <motion.div
                  className="absolute inset-0 rounded-full border-4 border-white/30"
                  animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}
            </motion.div>

            <div className="text-center">
              <h2 className="text-white text-2xl font-bold">{otherUser?.name ?? 'User'}</h2>
              <p className="text-white/50 text-sm mt-1">
                {isIncoming
                  ? 'Incoming call…'
                  : isConnected
                    ? formatDuration(callDuration)
                    : 'Calling…'}
              </p>
              {isConnected && (
                <div className="flex items-center justify-center gap-1.5 mt-2">
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-green-400 text-xs font-medium">Connected</span>
                </div>
              )}
              {!isConnected && !isIncoming && (
                <div className="flex items-center justify-center gap-1.5 mt-2">
                  <motion.span
                    className="w-2 h-2 rounded-full bg-blue-400"
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                  <span className="text-blue-400 text-xs font-medium">Ringing…</span>
                </div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="shrink-0 pb-14 px-8">
            {isIncoming ? (
              /* Incoming call — reject / accept */
              <div className="flex items-center justify-center gap-16">
                <div className="flex flex-col items-center gap-2">
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={handleReject}
                    className="w-16 h-16 rounded-full bg-[#FF3B30] flex items-center justify-center shadow-lg shadow-red-900/40"
                    aria-label="Reject call"
                  >
                    <PhoneOff size={28} className="text-white" />
                  </motion.button>
                  <span className="text-white/50 text-xs">Decline</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={handleAccept}
                    className="w-16 h-16 rounded-full bg-[#00C300] flex items-center justify-center shadow-lg shadow-green-900/40"
                    aria-label="Accept call"
                  >
                    <Phone size={28} className="text-white" />
                  </motion.button>
                  <span className="text-white/50 text-xs">Accept</span>
                </div>
              </div>
            ) : (
              /* Active call controls */
              <div className="flex flex-col gap-5">
                {/* Secondary controls row */}
                <div className="flex items-center justify-center gap-6">
                  <ControlButton
                    active={isMuted}
                    onClick={handleToggleMute}
                    label={isMuted ? 'Unmute' : 'Mute'}
                    icon={isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                  />
                  <ControlButton
                    active={!isSpeakerOn}
                    onClick={() => setIsSpeakerOn((v) => !v)}
                    label={isSpeakerOn ? 'Speaker' : 'Earpiece'}
                    icon={isSpeakerOn ? <Volume2 size={22} /> : <VolumeX size={22} />}
                  />
                  {isVideo && (
                    <ControlButton
                      active={!isVideoOn}
                      onClick={handleToggleVideo}
                      label={isVideoOn ? 'Camera' : 'Camera off'}
                      icon={isVideoOn ? <Video size={22} /> : <VideoOff size={22} />}
                    />
                  )}
                </div>
                {/* End call */}
                <div className="flex justify-center">
                  <div className="flex flex-col items-center gap-2">
                    <motion.button
                      whileTap={{ scale: 0.92 }}
                      onClick={handleEndCall}
                      className="w-16 h-16 rounded-full bg-[#FF3B30] flex items-center justify-center shadow-lg shadow-red-900/40"
                      aria-label="End call"
                    >
                      <PhoneOff size={28} className="text-white" />
                    </motion.button>
                    <span className="text-white/50 text-xs">End</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function ControlButton({
  active, onClick, label, icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={onClick}
        className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
          active ? 'bg-white/25 text-white' : 'bg-white/10 text-white/80'
        }`}
        aria-label={label}
      >
        {icon}
      </motion.button>
      <span className="text-white/40 text-[11px]">{label}</span>
    </div>
  );
}
