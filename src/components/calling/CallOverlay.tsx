import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PhoneOff, Mic, MicOff, Video, VideoOff, Phone, Volume2, VolumeX,
  RotateCw, ChevronUp, ChevronDown, Clock
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useCallStore } from '@/store/useCallStore';
import { useFriendStore } from '@/store/useFriendStore';
import { WebRTCCall } from '@/lib/webrtc';
import { getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';

export default function CallOverlay() {
  const { currentCall, incomingCall, acceptCall, rejectCall, endCall } = useCallStore();
  const { user: currentUser } = useAuthStore();
  const { friends } = useFriendStore();

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [showCallInfo, setShowCallInfo] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const webrtcRef = useRef<WebRTCCall | null>(null);
  const initializedCallId = useRef<string | null>(null);

  const activeCall = currentCall || incomingCall;
  const otherId = activeCall?.participantIds?.find(id => id !== currentUser?.id) || activeCall?.initiatorId;
  const otherUser = friends.find(f => f.id === otherId);
  const isConnected = currentCall?.status === 'connected';
  const isIncoming = !!incomingCall && !currentCall;
  const isVideo = activeCall?.type === 'video';

  // Ringtone for incoming calls
  useEffect(() => {
    if (isIncoming) {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.setValueAtTime(800, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
        // Repeat every 2 seconds
        const interval = setInterval(() => {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.frequency.setValueAtTime(600, ctx.currentTime);
          osc2.frequency.setValueAtTime(800, ctx.currentTime + 0.2);
          gain2.gain.setValueAtTime(0.1, ctx.currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
          osc2.start(ctx.currentTime);
          osc2.stop(ctx.currentTime + 0.5);
        }, 2000);
        return () => clearInterval(interval);
      } catch { /* Audio not supported */ }
    }
  }, [isIncoming]);

  // Duration timer
  useEffect(() => {
    if (isConnected) {
      timerRef.current = setInterval(() => {
        setCallDuration((d) => d + 1);
      }, 1000);
    }

    // Avoid state updates directly in the effect body.
    // Cleanup will run before the next render when `isConnected` changes.
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      if (!isConnected) return;
      // no-op; call duration is set when connection becomes active
    };
  }, [isConnected]);

  useEffect(() => {
    if (isConnected) return;
    // Schedule outside React render phase to avoid react-hooks/set-state-in-effect.
    queueMicrotask(() => setCallDuration(0));
  }, [isConnected]);





  // WebRTC initialization
  useEffect(() => {
    if (!currentCall || !currentUser) return;
    if (initializedCallId.current === currentCall.id) return;

    const otherId = currentCall.participantIds.find(id => id !== currentUser.id);
    if (!otherId) return;

    const webrtc = new WebRTCCall(
      currentUser.id,
      otherId,
      currentCall.type === 'video',
      (state) => { if (state === 'ended') { useCallStore.getState().endCall(); } },
      (stream) => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream; },
      (stream) => { if (localVideoRef.current) localVideoRef.current.srcObject = stream; }
    );

    webrtcRef.current = webrtc;
    initializedCallId.current = currentCall.id;

    if (currentCall.initiatorId === currentUser.id) {
      webrtc.startCall(currentCall.id);
    } else {
      webrtc.answerCall(currentCall.id);
    }

    return () => {
      if (initializedCallId.current === currentCall.id) {
        webrtcRef.current?.endCall();
        webrtcRef.current = null;
        initializedCallId.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCall?.id, currentUser?.id]);

  const handleAccept = async () => {
    if (!incomingCall || !currentUser) return;
    const webrtc = new WebRTCCall(
      currentUser.id,
      incomingCall.initiatorId,
      incomingCall.type === 'video',
      (state) => { if (state === 'ended') { useCallStore.getState().endCall(); } },
      (stream) => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream; },
      (stream) => { if (localVideoRef.current) localVideoRef.current.srcObject = stream; }
    );
    webrtcRef.current = webrtc;
    initializedCallId.current = incomingCall.id;
    await webrtc.answerCall(incomingCall.id);
    acceptCall();
  };

  const handleReject = () => { rejectCall(); };
  const handleEndCall = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    webrtcRef.current?.endCall();
    webrtcRef.current = null;
    initializedCallId.current = null;
    endCall();
  };

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    webrtcRef.current?.toggleAudio(!next);
  };

  const handleToggleVideo = () => {
    const next = !isVideoOn;
    setIsVideoOn(next);
    webrtcRef.current?.toggleVideo(next);
  };

  const handleFlipCamera = () => {
    webrtcRef.current?.flipCamera();
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (!currentCall && !incomingCall) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] bg-[#111111] flex flex-col"
      >
        {/* Video Streams */}
        {isVideo && !isIncoming && (
          <>
            <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
            <video ref={localVideoRef} autoPlay muted playsInline className="absolute top-4 right-4 w-32 h-40 rounded-lg object-cover shadow-lg bg-black/50 z-10" />
            {/* Camera flip button */}
            <button type="button" onClick={handleFlipCamera}
              className="absolute top-4 left-4 z-20 w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white"
            >
              <RotateCw size={18} />
            </button>
          </>
        )}

        {/* Call Info Panel (toggleable) */}
        <AnimatePresence>
          {showCallInfo && (
            <motion.div
              initial={{ y: -100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -100, opacity: 0 }}
              className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/70 to-transparent p-4 pt-12 pb-8"
            >
              <div className="text-center">
                <h2 className="text-white text-xl font-semibold">{otherUser?.name || 'User'}</h2>
                <p className="text-white/60 text-sm mt-1">
                  {isIncoming ? 'Incoming call...' : isConnected ? formatDuration(callDuration) : 'Calling...'}
                </p>
                {isConnected && (
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <Clock size={12} className="text-white/40" />
                    <span className="text-white/40 text-xs">{formatDuration(callDuration)}</span>
                  </div>
                )}
                <div className="flex items-center justify-center gap-2 mt-1">
                  <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'}`} />
                  <span className="text-white/40 text-xs">{isConnected ? 'Connected' : isIncoming ? 'Ringing' : 'Connecting'}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toggle info button */}
        <button type="button" onClick={() => setShowCallInfo(!showCallInfo)}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-30 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white/60"
        >
          {showCallInfo ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {/* Main Avatar / Info Area */}
        <div className={`flex-1 flex items-center justify-center relative z-10 ${isVideo && !isIncoming ? 'pointer-events-none' : ''}`}>
          <div className="text-center">
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className={`w-32 h-32 rounded-full bg-[#F5F5F5] flex items-center justify-center mx-auto mb-6 shadow-2xl overflow-hidden ${isIncoming ? 'ring-4 ring-[#00C300] animate-pulse' : ''}`}
            >
              {sanitizeMediaUrl(otherUser?.avatar) ? (
                <img src={sanitizeMediaUrl(otherUser?.avatar)} className="w-full h-full object-cover" alt="User avatar" />
              ) : (
                <img src={getDefaultAvatar(otherUser?.id || otherUser?.name || 'U')} className="w-full h-full object-cover" alt="User avatar" />
              )}
            </motion.div>
            <h2 className="text-white text-2xl font-semibold">{otherUser?.name || 'User'}</h2>
            <p className="text-white/50 mt-2">
              {isIncoming ? 'Incoming call...' : isConnected ? formatDuration(callDuration) : 'Calling...'}
            </p>
            {isConnected && (
              <div className="flex items-center justify-center gap-2 mt-2">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-green-400 text-xs font-medium">Connected</span>
              </div>
            )}
            {isIncoming && (
              <div className="flex items-center justify-center gap-2 mt-2">
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-yellow-400 text-xs font-medium">Ringing...</span>
              </div>
            )}
          </div>
        </div>

        {/* Call Controls */}
        <div className="shrink-0 p-8 pb-12 relative z-10">
          <div className="flex items-center justify-center gap-6">
            {isIncoming ? (
              <>
                <motion.button whileTap={{ scale: 0.95 }} onClick={handleReject} className="w-16 h-16 rounded-full bg-[#FF3B30] flex items-center justify-center shadow-lg">
                  <PhoneOff size={28} className="text-white" />
                </motion.button>
                <motion.button whileTap={{ scale: 0.95 }} onClick={handleAccept} className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
                  <Phone size={28} className="text-white" />
                </motion.button>
              </>
            ) : (
              <>
                {/* Mute */}
                <motion.button whileTap={{ scale: 0.95 }} onClick={handleToggleMute} className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-[#FF3B30]' : 'bg-white/10'}`}>
                  {isMuted ? <MicOff size={24} className="text-white" /> : <Mic size={24} className="text-white" />}
                </motion.button>

                {/* Speaker */}
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => setIsSpeakerOn(!isSpeakerOn)} className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${!isSpeakerOn ? 'bg-[#FF3B30]' : 'bg-white/10'}`}>
                  {isSpeakerOn ? <Volume2 size={24} className="text-white" /> : <VolumeX size={24} className="text-white" />}
                </motion.button>

                {/* Video Toggle */}
                {isVideo && (
                  <motion.button whileTap={{ scale: 0.95 }} onClick={handleToggleVideo} className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${!isVideoOn ? 'bg-[#FF3B30]' : 'bg-white/10'}`}>
                    {isVideoOn ? <Video size={24} className="text-white" /> : <VideoOff size={24} className="text-white" />}
                  </motion.button>
                )}

                {/* End Call */}
                <motion.button whileTap={{ scale: 0.95 }} onClick={handleEndCall} className="w-16 h-16 rounded-full bg-[#FF3B30] flex items-center justify-center shadow-lg">
                  <PhoneOff size={28} className="text-white" />
                </motion.button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
