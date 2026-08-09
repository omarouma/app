import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import {
  isFirestoreAvailable,
  COLLECTIONS,
  addDocToSubcollection,
  querySubcollection,
  where,
} from '@/lib/firestore';
import { getSupabaseSafe, isSupabaseConfigured } from '@/lib/supabase';
import { getIceServers } from '@/lib/webrtc';

const ICE_SERVERS: RTCIceServer[] = getIceServers();

interface PeerConnection {
  userId: string;
  pc: RTCPeerConnection;
  audioElement?: HTMLAudioElement;
}

interface SignalData {
  type: 'offer' | 'answer' | 'ice-candidate';
  from: string;
  to?: string;
  sdp?: string;
  candidate?: string;
  timestamp?: number;
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

  const startLocalStream = useCallback(async () => {
    if ('permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (result.state === 'denied') {
          setError('Microphone access denied. Please enable it in your browser settings.');
          return null;
        }
      } catch { /* permissions API not supported — proceed */ }
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setLocalStream(stream);
      localStreamRef.current = stream;
      return stream;
    } catch {
      setError('Microphone access denied. Please allow microphone permissions.');
      return null;
    }
  }, []);

  const stopLocalStream = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    setLocalStream(null);
    localStreamRef.current = null;
  }, []);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const enabled = !isMuted;
    localStreamRef.current.getAudioTracks().forEach(t => {
      t.enabled = enabled;
    });
    setIsMuted(!enabled);
  }, [isMuted]);

  const createPeerConnection = useCallback((targetUserId: string, stream: MediaStream): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (!remoteStream) return;

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

    pc.onicecandidate = async (event) => {
      if (!event.candidate) return;
      try {
        const supabase = getSupabaseSafe();
        if (supabase) {
          await supabase.from('voice_room_signals').insert({
            room_id: roomId,
            type: 'ice-candidate',
            from: userId,
            to: targetUserId,
            candidate: JSON.stringify(event.candidate.toJSON()),
          });
        } else if (isFirestoreAvailable()) {
          await addDocToSubcollection(COLLECTIONS.VOICE_ROOMS, roomId, 'signals', {
            type: 'ice-candidate',
            from: userId,
            to: targetUserId,
            candidate: JSON.stringify(event.candidate.toJSON()),
            timestamp: Date.now(),
          });
        }
      } catch { /* ICE candidate send failed — non-fatal */ }
    };

    pc.onconnectionstatechange = () => {
      // connection state changes are expected — no logging needed in production
    };

    return pc;
  }, [roomId, userId]);

  const connectToPeer = useCallback(async (targetUserId: string) => {
    if (!localStreamRef.current) return;
    if (peersRef.current.has(targetUserId)) return;

    const pc = createPeerConnection(targetUserId, localStreamRef.current);
    peersRef.current.set(targetUserId, { userId: targetUserId, pc });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const supabaseOffer = getSupabaseSafe();
    if (supabaseOffer) {
      await supabaseOffer.from('voice_room_signals').insert({
        room_id: roomId,
        type: 'offer',
        from: userId,
        to: targetUserId,
        sdp: offer.sdp,
      });
    } else if (isFirestoreAvailable()) {
      await addDocToSubcollection(COLLECTIONS.VOICE_ROOMS, roomId, 'signals', {
        type: 'offer',
        from: userId,
        to: targetUserId,
        sdp: offer.sdp,
        timestamp: Date.now(),
      });
    }

    setConnectedPeers(prev => [...prev, targetUserId]);
  }, [createPeerConnection, roomId, userId]);

  const handleSignal = useCallback(async (signal: unknown) => {
    if (!localStreamRef.current) return;
    const { type, from, to, sdp, candidate } = signal as SignalData;

    if (to && to !== userId) return;

    let peer = peersRef.current.get(from);

    if (type === 'offer' && sdp) {
      if (!peer) {
        const pc = createPeerConnection(from, localStreamRef.current);
        peer = { userId: from, pc };
        peersRef.current.set(from, peer);
      }

      await peer.pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);

      const supabaseAnswer = getSupabaseSafe();
      if (supabaseAnswer) {
        await supabaseAnswer.from('voice_room_signals').insert({
          room_id: roomId,
          type: 'answer',
          from: userId,
          to: from,
          sdp: answer.sdp,
        });
      } else if (isFirestoreAvailable()) {
        await addDocToSubcollection(COLLECTIONS.VOICE_ROOMS, roomId, 'signals', {
          type: 'answer',
          from: userId,
          to: from,
          sdp: answer.sdp,
          timestamp: Date.now(),
        });
      }
      setConnectedPeers(prev => prev.includes(from) ? prev : [...prev, from]);
    }

    if (type === 'answer' && peer && sdp) {
      await peer.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
    }

    if (type === 'ice-candidate' && peer && candidate) {
      try {
        const iceCandidate = new RTCIceCandidate(JSON.parse(candidate));
        await peer.pc.addIceCandidate(iceCandidate);
      } catch { /* ICE candidate add failed — non-fatal */ }
    }
  }, [createPeerConnection, roomId, userId]);

  // ─── Listen for incoming signals ───
  const handleSignalRef = useRef(handleSignal);
  useLayoutEffect(() => {
    handleSignalRef.current = handleSignal;
  }, [handleSignal]);

  useEffect(() => {
    if (!roomId || !userId) return;

    const supabase = isSupabaseConfigured() ? getSupabaseSafe() : null;
    if (supabase) {
      const fetchSignals = async () => {
        const { data } = await supabase
          .from('voice_room_signals')
          .select('*')
          .eq('room_id', roomId)
          .eq('to', userId)
          .gte('created_at', new Date(Date.now() - 30000).toISOString());
        (data || []).forEach((s) => handleSignalRef.current(s));
      };
      fetchSignals();

      const channel = supabase
        .channel(`voice_signals_${roomId}_${userId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'voice_room_signals',
          filter: `room_id=eq.${roomId}`,
        }, (payload) => {
          const signal = payload.new;
          if (signal?.to === userId) handleSignalRef.current(signal);
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }

    if (!isFirestoreAvailable()) return;

    const pollSignals = async () => {
      try {
        const signals = await querySubcollection(COLLECTIONS.VOICE_ROOMS, roomId, 'signals', [
          where('timestamp', '>', Date.now() - 30000),
          where('to', '==', userId),
        ]);
        (signals || []).forEach((s: unknown) => handleSignalRef.current(s));
      } catch {
        // ignore polling errors
      }
    };

    const interval = setInterval(pollSignals, 3000);
    return () => clearInterval(interval);
  }, [roomId, userId]);

  // ─── Detect local speaking activity via AudioContext AnalyserNode ───
  useEffect(() => {
    if (!localStream) return;
    let animationId: number;
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;

    try {
      audioCtx = new AudioContext();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(localStream);
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const check = () => {
        analyser!.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        setIsSpeaking(avg > 10);
        animationId = requestAnimationFrame(check);
      };
      animationId = requestAnimationFrame(check);
    } catch {
      // AudioContext setup failed — leave isSpeaking as-is
    }

    return () => {
      cancelAnimationFrame(animationId);
      audioCtx?.close().catch(() => {});
    };
  }, [localStream]);

  // ─── Cleanup on unmount ───
  useEffect(() => {
    const peersSnapshot = peersRef.current;
    const unsubs = unsubRefs.current.slice();
    return () => {
      peersSnapshot.forEach(({ pc, audioElement }) => {
        pc.close();
        if (audioElement) {
          audioElement.remove();
        }
      });
      peersSnapshot.clear();
      stopLocalStream();
      unsubs.forEach(u => u());
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
