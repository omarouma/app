import { useState, useRef, useEffect, useCallback } from 'react';
import {
  isFirestoreAvailable,
  updateDocById,
  addDocToSubcollection,
  subscribeToDoc,
  deleteDocById,
} from '@/lib/firestore';

// ─── Simple STUN servers (no TURN needed for local testing) ───
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

interface PeerConnection {
  userId: string;
  pc: RTCPeerConnection;
  audioElement?: HTMLAudioElement;
}

export function useVoiceRoomRTC(roomId: string, userId: string) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const unsubRefs = useRef<(() => void)[]>([]);

  // ─── Get microphone access ───
  const startLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setLocalStream(stream);
      localStreamRef.current = stream;
      return stream;
    } catch (err) {
      console.error('[WebRTC] Failed to get microphone:', err);
      setError('Microphone access denied. Please allow microphone permissions.');
      return null;
    }
  }, []);

  // ─── Stop local stream ───
  const stopLocalStream = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    setLocalStream(null);
    localStreamRef.current = null;
  }, []);

  // ─── Toggle mute ───
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const enabled = !isMuted;
    localStreamRef.current.getAudioTracks().forEach(t => {
      t.enabled = enabled;
    });
    setIsMuted(!enabled);
  }, [isMuted]);

  // ─── Create a new peer connection ───
  const createPeerConnection = useCallback((targetUserId: string, stream: MediaStream): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add local tracks
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    // Handle incoming remote stream
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (!remoteStream) return;

      // Create or update audio element for this peer
      let audioEl = document.getElementById(`audio-${targetUserId}`) as HTMLAudioElement;
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.id = `audio-${targetUserId}`;
        audioEl.autoplay = true;
        audioEl.srcObject = remoteStream;
        document.body.appendChild(audioEl);
      } else {
        audioEl.srcObject = remoteStream;
      }

      const peer = peersRef.current.get(targetUserId);
      if (peer) {
        peer.audioElement = audioEl;
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = async (event) => {
      if (!event.candidate || !isFirestoreAvailable()) return;
      try {
        await addDocToSubcollection('voiceRooms', roomId, 'signals', {
          type: 'ice-candidate',
          from: userId,
          to: targetUserId,
          candidate: JSON.stringify(event.candidate.toJSON()),
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error('[WebRTC] Failed to send ICE candidate:', err);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        console.warn(`[WebRTC] Connection to ${targetUserId} ${pc.connectionState}`);
      }
    };

    return pc;
  }, [roomId, userId]);

  // ─── Initiate connection to a new peer (as caller) ───
  const connectToPeer = useCallback(async (targetUserId: string) => {
    if (!localStreamRef.current) return;
    if (peersRef.current.has(targetUserId)) return;

    const pc = createPeerConnection(targetUserId, localStreamRef.current);
    peersRef.current.set(targetUserId, { userId: targetUserId, pc });

    // Create offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Send offer via Firestore
    if (isFirestoreAvailable()) {
      await addDocToSubcollection('voiceRooms', roomId, 'signals', {
        type: 'offer',
        from: userId,
        to: targetUserId,
        sdp: offer.sdp,
        timestamp: Date.now(),
      });
    }

    setConnectedPeers(prev => [...prev, targetUserId]);
  }, [createPeerConnection, roomId, userId]);

  // ─── Handle incoming signals (offers, answers, ICE) ───
  const handleSignal = useCallback(async (signal: any) => {
    if (!localStreamRef.current) return;
    const { type, from, to, sdp, candidate } = signal;

    // Only handle signals intended for us
    if (to && to !== userId) return;

    let peer = peersRef.current.get(from);

    if (type === 'offer') {
      if (!peer) {
        const pc = createPeerConnection(from, localStreamRef.current);
        peer = { userId: from, pc };
        peersRef.current.set(from, peer);
      }

      await peer.pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);

      // Send answer
      if (isFirestoreAvailable()) {
        await addDocToSubcollection('voiceRooms', roomId, 'signals', {
          type: 'answer',
          from: userId,
          to: from,
          sdp: answer.sdp,
          timestamp: Date.now(),
        });
      }
      setConnectedPeers(prev => prev.includes(from) ? prev : [...prev, from]);
    }

    if (type === 'answer' && peer) {
      await peer.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
    }

    if (type === 'ice-candidate' && peer) {
      try {
        const iceCandidate = new RTCIceCandidate(JSON.parse(candidate));
        await peer.pc.addIceCandidate(iceCandidate);
      } catch (err) {
        console.error('[WebRTC] Failed to add ICE candidate:', err);
      }
    }
  }, [createPeerConnection, roomId, userId]);

  // ─── Listen for incoming signals ───
  useEffect(() => {
    if (!roomId || !userId || !isFirestoreAvailable()) return;

    // Subscribe to signals subcollection
    const unsub = subscribeToDoc('voiceRooms', roomId, (data) => {
      if (!data) return;
      // We need to listen to the signals subcollection
      // Since subscribeToDoc listens to the doc, we'll poll for signals
      // In a real app, you'd use a dedicated subcollection listener
    });

    // Use a polling approach for signals (Firestore real-time subcollection)
    const pollSignals = async () => {
      try {
        const { querySubcollection } = await import('@/lib/firestore');
        const signals = await querySubcollection('voiceRooms', roomId, 'signals', [
          // @ts-ignore
          { field: 'timestamp', op: '>', value: Date.now() - 30000 },
          { field: 'to', op: '==', value: userId },
        ]);
        (signals || []).forEach((s: any) => handleSignal(s));
      } catch (err) {
        // ignore polling errors
      }
    };

    const interval = setInterval(pollSignals, 3000);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [roomId, userId, handleSignal]);

  // ─── Detect local speaking activity ───
  useEffect(() => {
    if (!localStreamRef.current) return;
    let animationId: number;

    const checkSpeaking = () => {
      try {
        // Simple audio level detection using getUserMedia constraints
        // In a real implementation, you'd use AudioContext + AnalyserNode
        // For now, just track if mic is unmuted and active
        const audioTrack = localStreamRef.current?.getAudioTracks()[0];
        if (audioTrack && audioTrack.enabled && !audioTrack.muted) {
          // Simulate speaking detection with randomness for demo
          setIsSpeaking(Math.random() > 0.7);
        } else {
          setIsSpeaking(false);
        }
      } catch { /* ignore */ }
      animationId = requestAnimationFrame(checkSpeaking);
    };

    animationId = requestAnimationFrame(checkSpeaking);
    return () => cancelAnimationFrame(animationId);
  }, [localStream]);

  // ─── Cleanup on unmount ───
  useEffect(() => {
    return () => {
      peersRef.current.forEach(({ pc, audioElement }) => {
        pc.close();
        if (audioElement) {
          audioElement.remove();
        }
      });
      peersRef.current.clear();
      stopLocalStream();
      unsubRefs.current.forEach(u => u());
    };
  }, [stopLocalStream]);

  return {
    localStream,
    isMuted,
    isSpeaking,
    error,
    connectedPeers,
    startLocalStream,
    stopLocalStream,
    toggleMute,
    connectToPeer,
  };
}

export default useVoiceRoomRTC;
