import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, MicOff, Hand, X, Users, PhoneOff,
  Crown, MessageSquare, ChevronLeft, MoreHorizontal
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useVoiceRoomStore } from '@/store/useVoiceRoomStore';
import { useVoiceRoomRTC } from '@/hooks/useVoiceRoomRTC';
import { getDefaultAvatar } from '@/lib/utils';

export default function VoiceRoomPage() {
  const _params = useParams();
  const roomId = (_params as { roomId?: string }).roomId;
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    rooms, activeRoom, subscribeRooms, joinRoom, leaveRoom,
    raiseHand, lowerHand, promoteToSpeaker, demoteToListener, endRoom
  } = useVoiceRoomStore();

  // WebRTC audio streaming
  const rtc = useVoiceRoomRTC(roomId || '', user?.id || '');
  const { isMuted } = rtc;

  const room = rooms.find(r => r.id === roomId) || activeRoom;
  const isSpeaker = !!(room && user?.id && (room.speakerIds.includes(user.id) || room.hostId === user.id));
  const [hasHandRaised, setHasHandRaised] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; userId: string; name: string; text: string; timestamp: Date }>>([]);
  const [chatInput, setChatInput] = useState('');
  const isHost = room?.hostId === user?.id;
  const isCoHost = !!(user?.id && room?.coHostIds?.includes(user.id));
  const canManage = isHost || isCoHost;

  // Start local audio stream when user becomes a speaker
  useEffect(() => {
    if (isSpeaker && room?.participants.length && user?.id) {
      rtc.startLocalStream().then(stream => {
        if (stream) {
          // Connect to other speakers
          room.speakerIds.forEach(speakerId => {
            if (speakerId !== user.id) {
              rtc.connectToPeer(speakerId);
            }
          });
        }
      });
    } else if (!isSpeaker) {
      rtc.stopLocalStream();
    }
  }, [isSpeaker, room, user, rtc]);

  // Connect to new speakers when they join
  useEffect(() => {
    if (!isSpeaker || !user?.id || !room) return;
    const newSpeakers = room.speakerIds.filter(sid => sid !== user.id && !rtc.connectedPeers.includes(sid));
    newSpeakers.forEach(sid => rtc.connectToPeer(sid));
  }, [room, isSpeaker, user, rtc]);

  // Join room on mount
  useEffect(() => {
    if (!roomId || !user?.id) return;
    const unsub = subscribeRooms();
    joinRoom(roomId, user.id);
    return () => {
      unsub();
      leaveRoom(roomId, user.id);
      rtc.stopLocalStream();
    };
  }, [roomId, user, joinRoom, leaveRoom, subscribeRooms, rtc]);

  // Determine if user is speaker


  const handleLeave = async () => {
    if (!roomId || !user?.id) return;
    rtc.stopLocalStream();
    await leaveRoom(roomId, user.id);
    navigate('/voice-rooms');
  };

  const handleEndRoom = async () => {
    if (!roomId || !user?.id) return;
    rtc.stopLocalStream();
    await endRoom(roomId, user.id);
    navigate('/voice-rooms');
  };

  const handleRaiseHand = async () => {
    if (!roomId || !user?.id) return;
    if (hasHandRaised) {
      await lowerHand(roomId, user.id);
      setHasHandRaised(false);
    } else {
      await raiseHand(roomId, user.id);
      setHasHandRaised(true);
    }
  };

  const handlePromote = async (userId: string) => {
    if (!roomId) return;
    await promoteToSpeaker(roomId, userId);
  };

  const handleDemote = async (userId: string) => {
    if (!roomId) return;
    await demoteToListener(roomId, userId);
  };

  const handleSendChat = () => {
    if (!chatInput.trim() || !user?.id) return;
    const msg = {
      id: `msg_${Date.now()}`,
      userId: user.id,
      name: user.name || 'User',
      text: chatInput.trim(),
      timestamp: new Date(),
    };
    setChatMessages(prev => [...prev, msg]);
    setChatInput('');
  };

  const speakers = room?.participants.filter(p =>
    room.speakerIds.includes(p) || room.hostId === p
  ) || [];
  const listeners = room?.participants.filter(p =>
    !room.speakerIds.includes(p) && room.hostId !== p
  ) || [];

  if (!room) {
    return (
      <div className="h-[100dvh] bg-[#0a0a0a] text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#8D8D8D] mb-2">Room not found or has ended</p>
          <button
            type="button"
            onClick={() => navigate('/voice-rooms')}
            className="px-5 py-2 bg-[#00C300] text-black rounded-full text-sm font-bold"
          >
            Back to Rooms
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-[#0a0a0a] text-white flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-[#1a1a1a] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate('/voice-rooms')} className="p-2 -ml-2" aria-label="Back to voice rooms">
            <ChevronLeft size={22} />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">{room.title}</p>
            <p className="text-[10px] text-[#8D8D8D] flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-[#00C300] rounded-full animate-pulse" />
              {room.participants.length} participants
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowParticipants(!showParticipants)} className="p-2 rounded-full bg-[#1a1a1a]" aria-label="Toggle participants list">
            <Users size={18} />
          </button>
          <button type="button" onClick={() => setShowChat(!showChat)} className="p-2 rounded-full bg-[#1a1a1a]" aria-label="Toggle room chat">
            <MessageSquare size={18} />
          </button>
          <button type="button" className="p-2 rounded-full bg-[#1a1a1a]" aria-label="More options">
            <MoreHorizontal size={18} />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-4">
        {/* Host info */}
        <div className="text-center mb-6">
          <div className="relative inline-block">
            <img
              src={room.hostAvatar || getDefaultAvatar(room.hostId)}
              alt="Host"
              className="w-20 h-20 rounded-full object-cover mx-auto border-2 border-[#00C300]"
            />
            <div className="absolute -bottom-1 -right-1 bg-[#FFD700] rounded-full p-1">
              <Crown size={12} className="text-black" />
            </div>
          </div>
          <p className="text-white font-semibold mt-2">{room.hostName}</p>
          <p className="text-[#8D8D8D] text-xs">Host</p>
        </div>

        {/* Topic */}
        {room.topic && (
          <div className="bg-[#1a1a1a] rounded-xl p-3 mb-4 text-center">
            <p className="text-[#8D8D8D] text-xs uppercase tracking-wider mb-1">Topic</p>
            <p className="text-white text-sm font-medium">{room.topic}</p>
          </div>
        )}

        {/* Speakers grid */}
        {speakers.length > 0 && (
          <div className="mb-4">
            <p className="text-[#8D8D8D] text-xs uppercase tracking-wider mb-2">Speakers</p>
            <div className="grid grid-cols-4 gap-3">
              {speakers.map(speakerId => (
                <SpeakerAvatar
                  key={speakerId}
                  userId={speakerId}
                  isHost={speakerId === room.hostId}
                  isCoHost={room.coHostIds.includes(speakerId)}
                  isMe={speakerId === user?.id}
                  isMuted={speakerId === user?.id ? isMuted : true}
                  name={speakerId === room.hostId ? room.hostName : speakerId === user?.id ? user.name : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {/* Raised hands */}
        {room.raisedHands.length > 0 && canManage && (
          <div className="mb-4">
            <p className="text-[#8D8D8D] text-xs uppercase tracking-wider mb-2">Raised Hands</p>
            <div className="flex gap-2 flex-wrap">
              {room.raisedHands.map(userId => (
                <button
                  key={userId}
                  type="button"
                  onClick={() => handlePromote(userId)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-[#00C300]/20 text-[#00C300] rounded-full text-xs font-medium"
                >
                  <Hand size={12} /> Promote
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Listeners */}
        {listeners.length > 0 && (
          <div>
            <p className="text-[#8D8D8D] text-xs uppercase tracking-wider mb-2">Listeners</p>
            <div className="grid grid-cols-6 gap-2">
              {listeners.map(listenerId => (
                <div key={listenerId} className="text-center">
                  <img
                    src={getDefaultAvatar(listenerId)}
                    alt="Listener"
                    className="w-10 h-10 rounded-full object-cover mx-auto"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="shrink-0 px-4 py-4 border-t border-[#1a1a1a]">
        <div className="flex items-center justify-center gap-4">
          {/* Mute toggle - uses real WebRTC */}
{isSpeaker && (
            <button
              type="button"
              onClick={rtc.toggleMute}
              aria-label={rtc.isMuted ? 'Unmute microphone' : 'Mute microphone'}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                rtc.isMuted ? 'bg-[#FF3B30]/20 text-[#FF3B30]' : 'bg-[#00C300]/20 text-[#00C300]'
              }`}
            >
              {rtc.isMuted ? <MicOff size={24} /> : <Mic size={24} />}
            </button>
          )}

          {/* Raise hand (for non-speakers) */}
          {!isSpeaker && (
            <button
              type="button"
              onClick={handleRaiseHand}
              aria-label={hasHandRaised ? 'Lower hand' : 'Raise hand'}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                hasHandRaised ? 'bg-[#00C300]/20 text-[#00C300]' : 'bg-[#1a1a1a] text-white'
              }`}
            >
              <Hand size={24} />
            </button>
          )}

          {/* Leave / End */}
          {isHost ? (
            <button
              type="button"
              onClick={handleEndRoom}
              aria-label="End room"
              className="w-14 h-14 rounded-full bg-[#FF3B30] flex items-center justify-center text-white"
            >
              <PhoneOff size={24} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleLeave}
              aria-label="Leave room"
              className="w-14 h-14 rounded-full bg-[#FF3B30] flex items-center justify-center text-white"
            >
              <PhoneOff size={24} />
            </button>
          )}
        </div>
      </div>

      {/* Participants panel */}
      <AnimatePresence>
        {showParticipants && (
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 bg-[#0a0a0a]"
          >
            <div className="flex flex-col h-full">
              <div className="px-4 py-3 border-b border-[#1a1a1a] flex items-center justify-between">
                <h2 className="text-lg font-bold">Participants ({room.participants.length})</h2>
                <button type="button" onClick={() => setShowParticipants(false)}>
                  <X size={22} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {room.participants.map(participantId => (
                  <ParticipantRow
                    key={participantId}
                    userId={participantId}
                    isHost={participantId === room.hostId}
                    isSpeaker={room.speakerIds.includes(participantId) || participantId === room.hostId}
                    isMe={participantId === user?.id}
                    canManage={canManage}
                    onPromote={() => handlePromote(participantId)}
                    onDemote={() => handleDemote(participantId)}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-[#1a1a1a] rounded-t-2xl max-h-[60vh] flex flex-col"
          >
            <div className="px-4 py-3 border-b border-[#2a2a2a] flex items-center justify-between">
              <h2 className="text-sm font-bold">Room Chat</h2>
              <button type="button" onClick={() => setShowChat(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {chatMessages.length === 0 ? (
                <p className="text-center text-[#8D8D8D] text-xs py-4">No messages yet</p>
              ) : (
                chatMessages.map(msg => (
                  <div key={msg.id} className={`flex gap-2 ${msg.userId === user?.id ? 'flex-row-reverse' : ''}`}>
                    <img src={getDefaultAvatar(msg.userId)} alt="User" className="w-6 h-6 rounded-full object-cover shrink-0" />
                    <div className={`px-3 py-2 rounded-xl text-xs max-w-[70%] ${
                      msg.userId === user?.id ? 'bg-[#00C300] text-black' : 'bg-[#2a2a2a] text-white'
                    }`}>
                      <p className="font-medium text-[10px] opacity-70 mb-0.5">{msg.name}</p>
                      <p>{msg.text}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-3 border-t border-[#2a2a2a] flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                placeholder="Type a message..."
                className="flex-1 bg-[#2a2a2a] rounded-full px-4 py-2 text-xs text-white placeholder:text-[#8D8D8D] outline-none focus:ring-2 focus:ring-[#00C300]"
              />
              <button
                type="button"
                onClick={handleSendChat}
                disabled={!chatInput.trim()}
                className="p-2 rounded-full bg-[#00C300] text-black disabled:opacity-50"
              >
                <MessageSquare size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SpeakerAvatar({ userId, isHost, isCoHost, isMe, isMuted, name }: {
  userId: string; isHost: boolean; isCoHost: boolean; isMe: boolean; isMuted: boolean; name?: string;
}) {
  const isSpeaking = isMe ? !isMuted : false;
  return (
    <div className="text-center">
      <div className={`relative inline-block ${isSpeaking ? 'animate-pulse' : ''}`}>
        <img
          src={getDefaultAvatar(userId)}
          alt={name || `User ${userId.slice(0, 6)}`}
          className={`w-14 h-14 rounded-full object-cover mx-auto transition-all ${
            isHost ? 'border-2 border-[#FFD700]' : isCoHost ? 'border-2 border-[#00C300]' : isSpeaking ? 'border-2 border-[#00C300] shadow-[0_0_10px_#00C300]' : 'border-2 border-[#333]'
          }`}
        />
        {isMuted && (
          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-[#FF3B30] rounded-full flex items-center justify-center border border-[#0a0a0a]" aria-label="Muted">
            <MicOff size={10} className="text-white" />
          </div>
        )}
        {isHost && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#FFD700] rounded-full flex items-center justify-center" aria-label="Host">
            <Crown size={8} className="text-black" />
          </div>
        )}
      </div>
      <p className="text-[10px] text-[#8D8D8D] mt-1 truncate">{isMe ? 'You' : (name || `User ${userId.slice(0, 6)}`)}</p>
    </div>
  );
}

function ParticipantRow({ userId, isHost, isSpeaker, isMe, canManage, onPromote, onDemote, name }: {
  userId: string; isHost: boolean; isSpeaker: boolean; isMe: boolean;
  canManage: boolean; onPromote: () => void; onDemote: () => void; name?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <img src={getDefaultAvatar(userId)} alt={name || `User ${userId.slice(0, 6)}`} className="w-10 h-10 rounded-full object-cover" />
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium">
          {isMe ? 'You' : (name || `User ${userId.slice(0, 6)}`)}
          {isHost && <span className="text-[#FFD700] text-xs ml-1">Host</span>}
          {isSpeaker && !isHost && <span className="text-[#00C300] text-xs ml-1">Speaker</span>}
        </p>
      </div>
      {canManage && !isMe && !isHost && (
        <div className="flex gap-1">
          {!isSpeaker ? (
            <button type="button" onClick={onPromote} className="px-2 py-1 bg-[#00C300]/20 text-[#00C300] rounded-full text-xs">
              Promote
            </button>
          ) : (
            <button type="button" onClick={onDemote} className="px-2 py-1 bg-[#FF3B30]/20 text-[#FF3B30] rounded-full text-xs">
              Demote
            </button>
          )}
        </div>
      )}
    </div>
  );
}
