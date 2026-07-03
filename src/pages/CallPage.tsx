/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { PhoneOff, Mic, MicOff, Video, VideoOff, Signal, SignalHigh, SignalMedium, SignalLow, Phone, MessageSquare, RotateCcw, Clock, RefreshCw, Star, ThumbsUp, ThumbsDown, Home } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useCallStore } from '@/store/useCallStore';
import { WebRTCCall } from '@/lib/webrtc';

export default function CallPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { userId, mode } = (location.state || {}) as { userId?: string; mode?: 'voice' | 'video' };
  const { user: currentUser } = useAuthStore();
  const { friends } = useFriendStore();
  const { startCall, endCall, currentCall, subscribeCalls } = useCallStore();

  const [networkQuality, setNetworkQuality] = useState<'excellent' | 'good' | 'fair' | 'poor'>('good');
  const [showEndScreen, setShowEndScreen] = useState(false);
  const [callStats, setCallStats] = useState({ duration: 0, quality: 'good' as string });
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const webrtcRef = useRef<WebRTCCall | null>(null);
  const callStartedRef = useRef(false);

  const friend = friends.find(f => f.id === userId);
  const isVideo = mode === 'video';
  const isConnected = currentCall?.status === 'connected';
  const callStatus = currentCall?.status || 'calling';

  // Subscribe to call updates
  useEffect(() => {
    if (!currentUser?.id) return;
    return subscribeCalls(currentUser.id);
  }, [currentUser?.id, subscribeCalls]);

  // Network quality monitoring (simplified - checks connection state)
  useEffect(() => {
    if (!isConnected || !webrtcRef.current) return;
    const interval = setInterval(() => {
      try {
        const pc = (webrtcRef.current as any)?.peerConnection;
        if (!pc) return;
        pc.getStats().then((stats: any) => {
          let packetsLost = 0;
          let packetsReceived = 0;
          let jitter = 0;
          stats.forEach((report: any) => {
            if (report.type === 'inbound-rtp' && report.kind === 'audio') {
              packetsLost += report.packetsLost || 0;
              packetsReceived += report.packetsReceived || 0;
              jitter = report.jitter || 0;
            }
          });
          const lossRate = packetsReceived > 0 ? packetsLost / packetsReceived : 0;
          if (lossRate < 0.01 && jitter < 0.05) setNetworkQuality('excellent');
          else if (lossRate < 0.03 && jitter < 0.1) setNetworkQuality('good');
          else if (lossRate < 0.08 && jitter < 0.2) setNetworkQuality('fair');
          else setNetworkQuality('poor');
        });
      } catch { /* ignore stats errors */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [isConnected]);

  const handleEndCall = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    webrtcRef.current?.endCall();
    webrtcRef.current = null;
    callStartedRef.current = false;
    const duration = callDuration;
    await endCall();
    setCallStats({ duration, quality: networkQuality });
    setShowEndScreen(true);
  }, [callDuration, endCall, networkQuality]);

  const handleCloseEndScreen = () => {
    setShowEndScreen(false);
    navigate(-1);
  };

  const handleEndCallRef = useRef(handleEndCall);
  useEffect(() => { handleEndCallRef.current = handleEndCall; }, [handleEndCall]);

  // Initiate the call
  useEffect(() => {
    if (!userId || !currentUser || callStartedRef.current) return;
    callStartedRef.current = true;

    (async () => {
      try {
        const callId = await startCall(userId, currentUser.id, isVideo ? 'video' : 'voice');
        if (!callId) return;

        const webrtc = new WebRTCCall(
          currentUser.id,
          userId,
          isVideo,
          (state) => { if (state === 'ended') void handleEndCallRef.current(); },
          (stream) => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream; },
          (stream) => { if (localVideoRef.current) localVideoRef.current.srcObject = stream; }
        );
        webrtcRef.current = webrtc;
        await webrtc.startCall(callId);
      } catch (err) {
        console.error('Call init failed:', err);
      }
    })();

    return () => {
      webrtcRef.current?.endCall();
      webrtcRef.current = null;
    };
  }, [userId, currentUser, isVideo, startCall]);

  // Duration timer
  useEffect(() => {
    if (isConnected) {
      timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isConnected]);
  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (!userId) {
    return (
      <div className="h-[100dvh] bg-white flex items-center justify-center">
        <p className="text-[#8D8D8D]">No call in progress</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-[100dvh] bg-[#111111] flex flex-col relative">
      {/* Quality indicator */}
      {isConnected && (
        <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded-full px-3 py-1.5">
          {networkQuality === 'excellent' && <SignalHigh size={14} className="text-[#00C300]" />}
          {networkQuality === 'good' && <Signal size={14} className="text-[#00C300]" />}
          {networkQuality === 'fair' && <SignalMedium size={14} className="text-[#FF9800]" />}
          {networkQuality === 'poor' && <SignalLow size={14} className="text-[#FF3B30]" />}
          <span className={`text-xs font-medium capitalize ${
            networkQuality === 'excellent' || networkQuality === 'good' ? 'text-[#00C300]' :
            networkQuality === 'fair' ? 'text-[#FF9800]' : 'text-[#FF3B30]'
          }`}>
            {networkQuality}
          </span>
        </div>
      )}

      {isVideo && (
        <>
          <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
          <video ref={localVideoRef} autoPlay muted playsInline className="absolute top-4 right-4 w-32 h-40 rounded-lg object-cover shadow-lg bg-black/50 z-10" />
        </>
      )}

      <div className="flex-1 flex items-center justify-center relative z-10">
        <div className="text-center">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="w-28 h-28 rounded-full bg-[#F5F5F5] flex items-center justify-center mx-auto mb-6 shadow-2xl overflow-hidden"
          >
            {friend?.avatar ? (
              <img src={friend.avatar} className="w-full h-full object-cover" alt="User avatar" />
            ) : (
              <span className="text-[#111111] text-4xl font-bold">{(friend?.name || 'U')[0]}</span>
            )}
          </motion.div>
          <h2 className="text-white text-xl font-semibold">{friend?.name || 'User'}</h2>
          <p className="text-white/50 mt-1 text-sm">
            {callStatus === 'calling' ? 'Calling...' : callStatus === 'connected' ? formatDuration(callDuration) : 'Call ended'}
          </p>
        </div>
      </div>

      <div className="shrink-0 pb-16 px-8 relative z-10">
        <div className="flex items-center justify-center gap-6">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => { const next = !isMuted; setIsMuted(next); webrtcRef.current?.toggleAudio(!next); }}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-[#FF3B30]' : 'bg-white/10'}`}
          >
            {isMuted ? <MicOff size={24} className="text-white" /> : <Mic size={24} className="text-white" />}
          </motion.button>

          {isVideo && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => { const next = !isVideoOn; setIsVideoOn(next); webrtcRef.current?.toggleVideo(next); }}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${!isVideoOn ? 'bg-[#FF3B30]' : 'bg-white/10'}`}
            >
              {isVideoOn ? <Video size={24} className="text-white" /> : <VideoOff size={24} className="text-white" />}
            </motion.button>
          )}

          {isVideo && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => { webrtcRef.current?.flipCamera(); }}
              className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center"
            >
              <RefreshCw size={24} className="text-white" />
            </motion.button>
          )}

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleEndCall}
            className="w-16 h-16 rounded-full bg-[#FF3B30] flex items-center justify-center shadow-lg"
          >
            <PhoneOff size={28} className="text-white" />
          </motion.button>
        </div>
      </div>

      {/* Call End Screen */}
      <AnimatePresence>
        {showEndScreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-[#111111] flex flex-col items-center justify-center p-6"
          >
            <div className="text-center max-w-sm">
              <div className="w-20 h-20 rounded-full bg-[#F5F5F5] flex items-center justify-center mx-auto mb-4">
                <Phone size={32} className="text-[#00C300]" />
              </div>
              <h2 className="text-white text-xl font-bold mb-1">Call Ended</h2>
              <p className="text-white/50 text-sm mb-6">with {friend?.name || 'User'}</p>

              <div className="bg-white/5 rounded-2xl p-4 mb-6">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Clock size={16} className="text-white/50" />
                  <span className="text-white text-lg font-bold">{formatDuration(callStats.duration)}</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  {callStats.quality === 'excellent' && <Star size={14} className="text-[#FFD700]" />}
                  {callStats.quality === 'good' && <ThumbsUp size={14} className="text-[#00C300]" />}
                  {callStats.quality === 'fair' && <ThumbsUp size={14} className="text-[#FF9800]" />}
                  {callStats.quality === 'poor' && <ThumbsDown size={14} className="text-[#FF3B30]" />}
                  <span className={`text-sm capitalize ${
                    callStats.quality === 'excellent' ? 'text-[#FFD700]' :
                    callStats.quality === 'good' ? 'text-[#00C300]' :
                    callStats.quality === 'fair' ? 'text-[#FF9800]' : 'text-[#FF3B30]'
                  }`}>
                    {callStats.quality} quality
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => { setShowEndScreen(false); navigate(`/chat/${userId}`); }}
                  className="flex-1 py-3 bg-white/10 text-white rounded-xl text-sm font-medium hover:bg-white/20 transition-colors flex items-center justify-center gap-2"
                >
                  <MessageSquare size={16} /> Message
                </button>
                <button type="button" onClick={() => { setShowEndScreen(false); window.location.reload(); }}
                  className="flex-1 py-3 bg-[#00C300] text-white rounded-xl text-sm font-bold hover:bg-[#00A300] transition-colors flex items-center justify-center gap-2"
                >
                  <RotateCcw size={16} /> Call Back
                </button>
              </div>
              <button type="button" onClick={handleCloseEndScreen}
                className="w-full mt-3 py-3 text-white/50 text-sm hover:text-white transition-colors flex items-center justify-center gap-2"
              >
                <Home size={16} /> Go Home
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
