import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff,
  Volume2, VolumeX, RotateCw, MessageSquare, Pause, Play, Maximize2, Minimize2,
  UserPlus, UserRound, X,
} from 'lucide-react';
import { useCallStore } from '@/store/useCallStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendStore } from '@/store/useFriendStore';
import { useCallContext } from '@/context/CallContextBase';
import { stopAllSounds, playIncomingCall, playOutgoingCall, vibrateIncomingCall } from '@/lib/sounds';
import { sanitizeMediaUrl, getDefaultAvatar } from '@/lib/utils';
import { isGroupCall, isVideoCallType, getOtherParticipantId } from '@/lib/callUtils';
import { toast } from 'sonner';

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default function CallOverlay() {
const navigate = useNavigate();
  const { currentCall, incomingCall, inviteToCall } = useCallStore();
  const currentUser = useAuthStore((s) => s.user);

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const ringtoneRef = useRef<{ stop: () => void } | null>(null);

  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [otherUser, setOtherUser] = useState<{ id: string; name: string; avatar?: string } | null>(null);
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  const friends = useFriendStore((s) => s.friends);
  const getRecentContacts = useFriendStore((s) => s.getRecentContacts);
  const [recentContacts, setRecentContacts] = useState<{ id: string; name: string; avatar?: string }[]>([]);

const {
    isConnected, localStream, remoteStream, remoteParticipants, isMuted, isVideoOn, isHeld, quality,
    callDuration, configuredError,
    endCall, acceptCall, rejectCall, toggleMute, toggleVideo, flipCamera, toggleHold,
  } = useCallContext();

  // Load recent contacts for the "Add participant" panel when opened.
  useEffect(() => {
    if (!showAddParticipant || !currentUser?.id) return;
    let cancelled = false;
    getRecentContacts(currentUser.id)
      .then((users) => {
        if (cancelled) return;
        setRecentContacts(
          (users || []).map((u) => ({
            id: u.id,
            name: (u as unknown as { name?: string; displayName?: string }).name || (u as unknown as { displayName?: string }).displayName || 'User',
            avatar: u.avatar || undefined,
          }))
        );
      })
      .catch(() => { if (!cancelled) setRecentContacts([]); });
    return () => { cancelled = true; };
  }, [showAddParticipant, currentUser?.id, getRecentContacts]);



  const isIncoming = !!incomingCall && !currentCall;
  const activeCall = currentCall ?? incomingCall;
  const isVideo = isVideoCallType(activeCall?.type);
  const isGroup = isGroupCall(activeCall);
  const otherUserId = activeCall
    ? getOtherParticipantId(activeCall, currentUser?.id) || null
    : null;

  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (!otherUserId) {
      setOtherUser(null);
      return;
    }
    import('@/lib/firestore').then(({ getDocById, COLLECTIONS }) => {
      getDocById(COLLECTIONS.USERS, otherUserId)
        .then((data) => {
          setOtherUser({
            id: otherUserId,
            name: (data?.name as string) || (data?.displayName as string) || 'User',
            avatar: (data?.avatar as string) || undefined,
          });
        })
        .catch(() => setOtherUser({ id: otherUserId, name: 'User' }));
    }).catch(() => setOtherUser({ id: otherUserId, name: 'User' }));
  }, [otherUserId]);

  useEffect(() => {
    const el = remoteVideoRef.current;
    if (el && 'setSinkId' in el && typeof el.setSinkId === 'function') {
      el.setSinkId(isSpeakerOn ? 'default' : '').catch(() => { });
    }
  }, [isSpeakerOn, remoteStream]);

  const isRingingRef = useRef(false);

  useEffect(() => {
    if (isIncoming && !isRingingRef.current) {
      isRingingRef.current = true;
      ringtoneRef.current = playIncomingCall();
      vibrateIncomingCall();
    } else if (!isIncoming && currentCall?.status === 'calling' && !isRingingRef.current) {
      isRingingRef.current = true;
      ringtoneRef.current = playOutgoingCall();
    }
    return () => {
      isRingingRef.current = false;
      ringtoneRef.current?.stop();
      ringtoneRef.current = null;
    };
    // Depend on stable IDs, not derived booleans, to avoid re-triggering
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingCall?.id, currentCall?.id, currentCall?.status]);

  useEffect(() => {
    if (isConnected) {
      ringtoneRef.current?.stop();
      ringtoneRef.current = null;
    }
  }, [isConnected]);

  const prevHadCall = useRef(false);
  useEffect(() => {
    const hadCall = !!(currentCall || incomingCall);
    if (hadCall) {
      prevHadCall.current = true;
    } else if (prevHadCall.current) {
      prevHadCall.current = false;
      stopAllSounds();
      setIsMinimized(false);
      // Don't navigate here - CallPage handles navigation
    }
  }, [currentCall, incomingCall]);

  const handleAccept = useCallback(async () => {
    ringtoneRef.current?.stop();
    ringtoneRef.current = null;
    await acceptCall();
  }, [acceptCall]);

  const handleReject = useCallback(() => {
    ringtoneRef.current?.stop();
    ringtoneRef.current = null;
    stopAllSounds();
    rejectCall();
    toast.info('Call rejected');
  }, [rejectCall]);

  const handleEndCall = useCallback(() => {
    stopAllSounds();
    setIsMinimized(false);
    endCall();
  }, [endCall]);

  if (!activeCall) return null;

  const avatarSrc = sanitizeMediaUrl(otherUser?.avatar)
    ? sanitizeMediaUrl(otherUser?.avatar)!
    : getDefaultAvatar(otherUser?.id ?? otherUser?.name ?? 'U');

  // Minimized floating PiP bubble (only for active/outgoing calls, not the
  // full-screen incoming ring which should stay intrusive).
  if (isMinimized && !isIncoming) {
    return (
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.6, opacity: 0 }}
        className="fixed bottom-24 right-4 z-[70] flex flex-col items-center gap-2"
      >
        <div className="relative w-20 h-20 rounded-full overflow-hidden shadow-xl border-2 border-[#00C300] bg-[#1a1a2e]">
          {isVideo && remoteStream ? (
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
          ) : (
            <img src={avatarSrc} className="w-full h-full object-cover" alt="User avatar" />
          )}
          <span className="absolute bottom-0 left-0 right-0 text-center text-[10px] font-semibold bg-black/60 text-white py-0.5">
            {isHeld ? 'Held' : isConnected ? formatDuration(callDuration) : '…'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleEndCall}
            className="w-10 h-10 rounded-full bg-[#FF3B30] flex items-center justify-center shadow-lg"
            aria-label="End call"
          >
            <PhoneOff size={18} className="text-white" />
          </button>
          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg"
            aria-label="Restore call"
          >
            <Maximize2 size={18} className="text-[#111111]" />
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] flex flex-col overflow-hidden"
      >
{/* Background / group video grid */}
        {isVideo && !isIncoming && isGroup && remoteParticipants.length > 0 ? (
          <div className="absolute inset-0 grid grid-cols-2 gap-1 p-1 bg-black">
            {remoteParticipants.map((p) => (
              <GroupRemoteVideo key={String(p.id)} stream={p.stream} />
            ))}
            {remoteParticipants.length === 1 && <div className="hidden" />}
          </div>
        ) : isVideo && !isIncoming ? (
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
              onClick={flipCamera}
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
          <div className="flex items-center justify-between gap-2 px-5 pt-14 pb-4">
            <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${isVideo ? 'bg-blue-500/20 text-blue-300' : 'bg-green-500/20 text-green-300'}`}>
              {isGroup
                ? (isVideo ? '👥 Group Video' : '👥 Group Voice')
                : (isVideo ? '📹 Video' : '🎙 Voice')}
            </span>
            <div className="flex items-center justify-center gap-2 min-w-0 flex-1">
              {isConnected && !isHeld && (
                <span className="shrink-0 text-white/60 text-sm font-mono">{formatDuration(callDuration)}</span>
              )}
              {isHeld && (
                <span className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-full bg-yellow-500/20 text-yellow-300">
                  On hold
                </span>
              )}
              {quality !== 'good' && isConnected && (
                <span className={`shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full ${quality === 'reconnecting'
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-orange-500/20 text-orange-300'
                  }`}>
                  {quality === 'reconnecting' ? 'Reconnecting…' : 'Poor signal'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!isIncoming && (
                <button
                  type="button"
                  onClick={() => setIsMinimized(true)}
                  className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/70 active:bg-white/20"
                  aria-label="Minimize call"
                >
                  <Minimize2 size={16} />
                </button>
              )}
              <button
                type="button"
                onClick={() => otherUserId && navigate(`/profile/${otherUserId}`)}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/70 active:bg-white/20"
                aria-label="Open profile"
              >
                <UserRound size={16} />
              </button>
              <button
                type="button"
                onClick={() => navigate(`/chat/${otherUserId}`)}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/70 active:bg-white/20"
                aria-label="Open chat"
              >
                <MessageSquare size={16} />
              </button>
            </div>
          </div>

          {/* Avatar + name */}
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className={`relative ${(isVideo && isConnected) ? 'w-20 h-20' : 'w-32 h-32'} rounded-full overflow-hidden shadow-2xl border-4 border-white/10`}
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
              {configuredError ? (
                <p className="text-[#FF6B6B] text-sm mt-1 max-w-sm mx-auto">{configuredError}</p>
              ) : (
                <p className="text-white/50 text-sm mt-1">
                  {isIncoming
                    ? 'Incoming call…'
                    : isHeld
                      ? 'Call on hold'
                      : isConnected
                        ? formatDuration(callDuration)
                        : 'Calling…'}
                </p>
              )}
              {isConnected && !isHeld && (
                <div className="flex items-center justify-center gap-1.5 mt-2">
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-green-400 text-xs font-medium">Connected</span>
                </div>
              )}
              {!isConnected && !isIncoming && (
                <div className="flex items-center justify-center gap-1.5 mt-2">
                  <motion.span
                    className="w-2 h-2 rounded-full bg-green-400"
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                  <span className="text-green-400 text-xs font-medium">Ringing…</span>
                </div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="shrink-0 pb-14 px-8">
            {isIncoming ? (
              /* Incoming call — reply w/ message via chat, decline / accept */
              <div className="flex items-center justify-center gap-12">
                <div className="flex flex-col items-center gap-2">
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={() => navigate(`/chat/${otherUserId}`)}
                    className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center shadow-lg"
                    aria-label="Reply with message"
                  >
                    <MessageSquare size={24} className="text-white" />
                  </motion.button>
                  <span className="text-white/50 text-xs">Message</span>
                </div>
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
            ) : showAddParticipant ? (
              /* Add participant slide-up panel */
              <motion.div
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 40, opacity: 0 }}
                className="flex flex-col gap-3 max-h-[40vh]"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-semibold text-sm">Add participant</h3>
                  <button
                    type="button"
                    onClick={() => setShowAddParticipant(false)}
                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 active:bg-white/20"
                    aria-label="Close add participant"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="overflow-y-auto flex flex-col gap-1 rounded-2xl bg-black/20 border border-white/10 p-2">
                  {friends.length > 0 ? (
                    friends
                      .filter((f) => f.id !== currentUser?.id && f.id !== otherUserId)
                      .map((f) => {
                        const fAvatar = sanitizeMediaUrl(f.avatar)
                          ? sanitizeMediaUrl(f.avatar)!
                          : getDefaultAvatar(f.id ?? f.name ?? 'U');
                        return (
<button
                            key={f.id}
                            type="button"
                            onClick={() => {
                              setShowAddParticipant(false);
                              if (currentCall?.id && currentUser?.id) {
                                inviteToCall(currentCall.id, currentUser.id, f.id);
                                toast.success(`${f.name} added to the call`);
                              }
                            }}
                            className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors text-left"
                          >
                            <img src={fAvatar} className="w-10 h-10 rounded-full object-cover" alt={f.name} />
                            <div className="min-w-0 flex-1">
                              <p className="text-white text-sm font-medium truncate">{f.name}</p>
                              <p className="text-white/40 text-xs">Friend</p>
                            </div>
                            <UserPlus size={18} className="text-white/50 shrink-0" />
                          </button>
                        );
                      })
                  ) : recentContacts.length > 0 ? (
                    recentContacts
                      .filter((c) => c.id !== currentUser?.id && c.id !== otherUserId)
                      .map((c) => {
                        const cAvatar = sanitizeMediaUrl(c.avatar)
                          ? sanitizeMediaUrl(c.avatar)!
                          : getDefaultAvatar(c.id ?? c.name ?? 'U');
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setShowAddParticipant(false);
                              toast.info(`Calling ${c.name}`);
                              navigate('/call', {
                                state: { userId: c.id, mode: isVideo ? 'video' : 'voice', isOutgoing: true },
                              });
                            }}
                            className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors text-left"
                          >
                            <img src={cAvatar} className="w-10 h-10 rounded-full object-cover" alt={c.name} />
                            <div className="min-w-0 flex-1">
                              <p className="text-white text-sm font-medium truncate">{c.name}</p>
                              <p className="text-white/40 text-xs">Recent</p>
                            </div>
                            <UserPlus size={18} className="text-white/50 shrink-0" />
                          </button>
                        );
                      })
                  ) : (
                    <div className="text-center py-6">
                      <UserRound size={28} className="mx-auto text-white/30 mb-2" />
                      <p className="text-white/50 text-sm">No contacts available</p>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              /* Active call controls */
              <div className="flex flex-col gap-5">
                {/* Secondary controls row */}
                <div className="flex items-center justify-center gap-6">
                  <ControlButton
                    active={isMuted}
                    onClick={toggleMute}
                    label={isMuted ? 'Unmute' : 'Mute'}
                    icon={isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                  />
                  <ControlButton
                    active={!isSpeakerOn}
                    onClick={() => setIsSpeakerOn((v: boolean) => !v)}
                    label={isSpeakerOn ? 'Speaker' : 'Earpiece'}
                    icon={isSpeakerOn ? <Volume2 size={22} /> : <VolumeX size={22} />}
                  />
                  <ControlButton
                    active={isHeld}
                    onClick={toggleHold}
                    label={isHeld ? 'Resume' : 'Hold'}
                    icon={isHeld ? <Play size={22} /> : <Pause size={22} />}
                  />
                  <ControlButton
                    active={showAddParticipant}
                    onClick={() => setShowAddParticipant(true)}
                    label="Add"
                    icon={<UserPlus size={22} />}
                  />
                  {isVideo && (
                    <ControlButton
                      active={!isVideoOn}
                      onClick={toggleVideo}
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
        className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${active ? 'bg-white/25 text-white' : 'bg-white/10 text-white/80'
          }`}
        aria-label={label}
      >
        {icon}
      </motion.button>
      <span className="text-white/40 text-[11px]">{label}</span>
    </div>
  );
}

function GroupRemoteVideo({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  return (
    <div className="relative w-full h-full min-h-[120px] bg-black rounded-md overflow-hidden">
      <video ref={ref} autoPlay playsInline className="w-full h-full object-cover" />
    </div>
  );
}
