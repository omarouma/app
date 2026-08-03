import { useState, useRef, useEffect, useCallback } from 'react';
import {
  isFirestoreAvailable,
  COLLECTIONS,
  addDocToSubcollection,
  subscribeToSubcollection,
  where,
} from '@/lib/firestore';
import { getSupabaseSafe } from '@/lib/supabase';
import { getIceServers } from '@/lib/webrtc';

// ─── ICE servers — STUN + optional TURN (shared with 1:1 calls & voice rooms) ───
const ICE_SERVERS: RTCIceServer[] = getIceServers();

interface LiveSignal {
  id?: string;
  type: 'offer' | 'answer' | 'ice-candidate';
  from: string;
  to?: string;
  sdp?: string;
  candidate?: string;
  timestamp?: number;
}

/**
 * Real one-to-many WebRTC live streaming.
 *
 * - Broadcaster captures camera + microphone and answers `offer` signals from viewers.
 * - Viewers create an `offer` toward the broadcaster and play the returned remote stream.
 * - Signaling runs through Supabase Realtime (`live_stream_signals`) when configured,
 *   otherwise falls back to a Firestore subcollection (`live_streams/{streamId}/signals`).
 */
export function useLiveStreamRTC(
  streamId: string,
  userId: string,
  isBroadcaster: boolean,
  broadcasterId?: string,
) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [viewers, setViewers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const viewerPCsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const myPCRef = useRef<RTCPeerConnection | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const seenSignalsRef = useRef<Set<string>>(new Set());

  // ─── Signal transport ─────────────────────────────────────────────────────
  const sendSignal = useCallback(
    async (data: Omit<LiveSignal, 'timestamp'>) => {
      const supabase = getSupabaseSafe();
      if (supabase) {
        try {
          await supabase.from('live_stream_signals').insert({
            stream_id: streamId,
            type: data.type,
            from: data.from,
            to: data.to ?? null,
            sdp: data.sdp ?? null,
            candidate: data.candidate ?? null,
            created_at: new Date().toISOString(),
          });
          return;
        } catch { /* fall through to Firestore fallback */ }
      }
      if (isFirestoreAvailable()) {
        try {
          await addDocToSubcollection(COLLECTIONS.LIVE_STREAMS, streamId, 'signals', {
            type: data.type,
            from: data.from,
            to: data.to,
            sdp: data.sdp,
            candidate: data.candidate,
            timestamp: Date.now(),
          });
        } catch { /* non-fatal */ }
      }
    },
    [streamId],
  );

  const subscribeSignals = useCallback(
    (onSignal: (s: LiveSignal) => void): (() => void) => {
      const supabase = getSupabaseSafe();
      if (supabase) {
        // Initial fetch — replay recent signals so late joiners catch up
        void (async () => {
          try {
            const { data } = await supabase
              .from('live_stream_signals')
              .select('*')
              .eq('stream_id', streamId)
              .order('created_at', { ascending: true })
              .limit(200);
            (data || []).forEach((row) => {
              const s = row as Record<string, unknown>;
              onSignal({
                id: s.id as string,
                type: s.type as LiveSignal['type'],
                from: s.from as string,
                to: (s.to as string) || undefined,
                sdp: (s.sdp as string) || undefined,
                candidate: (s.candidate as string) || undefined,
                timestamp: s.created_at ? new Date(s.created_at as string).getTime() : Date.now(),
              });
            });
          } catch { /* table may not exist yet — rely on realtime */ }
        })();

        const channel = supabase
          .channel(`live_signals_${streamId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'live_stream_signals',
              filter: `stream_id=eq.${streamId}`,
            },
            (payload) => {
              const s = payload.new as Record<string, unknown>;
              onSignal({
                id: s.id as string,
                type: s.type as LiveSignal['type'],
                from: s.from as string,
                to: (s.to as string) || undefined,
                sdp: (s.sdp as string) || undefined,
                candidate: (s.candidate as string) || undefined,
                timestamp: s.created_at ? new Date(s.created_at as string).getTime() : Date.now(),
              });
            },
          )
          .subscribe();

        return () => { supabase.removeChannel(channel); };
      }

      if (isFirestoreAvailable()) {
        return subscribeToSubcollection(
          COLLECTIONS.LIVE_STREAMS,
          streamId,
          'signals',
          [where('timestamp', '>', Date.now() - 30000)],
          (docs) => {
            (docs || []).forEach((d: unknown) => {
              const doc = d as Record<string, unknown>;
              onSignal({
                id: doc.id as string,
                type: doc.type as LiveSignal['type'],
                from: doc.from as string,
                to: (doc.to as string) || undefined,
                sdp: (doc.sdp as string) || undefined,
                candidate: (doc.candidate as string) || undefined,
                timestamp: doc.timestamp as number,
              });
            });
          },
        );
      }

      return () => {};
    },
    [streamId],
  );

  // ─── Dedupe signal by id (or composite key) ───────────────────────────────
  const seenSignal = useCallback((s: LiveSignal): boolean => {
    const key = s.id || `${s.type}:${s.from}:${s.to || ''}:${s.timestamp || ''}`;
    if (seenSignalsRef.current.has(key)) return true;
    seenSignalsRef.current.add(key);
    return false;
  }, []);

  // ─── Broadcaster: create a peer connection for a viewer ───────────────────
  const createViewerPC = useCallback(
    (viewerId: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      }
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendSignal({
            type: 'ice-candidate',
            from: userId,
            to: viewerId,
            candidate: JSON.stringify(e.candidate.toJSON()),
          });
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setViewers((prev) => (prev.includes(viewerId) ? prev : [...prev, viewerId]));
        }
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          viewerPCsRef.current.delete(viewerId);
          setViewers((prev) => prev.filter((id) => id !== viewerId));
        }
      };
      return pc;
    },
    [sendSignal, userId],
  );

  // ─── Broadcaster: handle signals from viewers ─────────────────────────────
  const handleBroadcasterSignal = useCallback(
    async (signal: LiveSignal) => {
      if (seenSignal(signal)) return;

      if (signal.type === 'offer' && signal.sdp && signal.to === userId) {
        let pc = viewerPCsRef.current.get(signal.from);
        if (!pc) {
          pc = createViewerPC(signal.from);
          viewerPCsRef.current.set(signal.from, pc);
        }
        try {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal({ type: 'answer', from: userId, to: signal.from, sdp: answer.sdp });
        } catch { /* ignore malformed offer */ }
      } else if (signal.type === 'ice-candidate' && signal.candidate) {
        const pc = viewerPCsRef.current.get(signal.from);
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(signal.candidate)));
          } catch { /* ignore */ }
        }
      }
    },
    [createViewerPC, seenSignal, sendSignal, userId],
  );

  // ─── Viewer: handle signals from the broadcaster ──────────────────────────
  const handleViewerSignal = useCallback(
    async (signal: LiveSignal) => {
      if (seenSignal(signal)) return;

      if (signal.type === 'answer' && signal.sdp && signal.from === broadcasterId) {
        const pc = myPCRef.current;
        if (!pc) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
          setIsConnecting(false);
        } catch { /* ignore */ }
      } else if (signal.type === 'ice-candidate' && signal.candidate && signal.from === broadcasterId) {
        const pc = myPCRef.current;
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(signal.candidate)));
          } catch { /* ignore */ }
        }
      }
    },
    [broadcasterId, seenSignal],
  );

  // ─── Broadcaster: start capturing media ───────────────────────────────────
  const startBroadcast = useCallback(async () => {
    if (!streamId || !userId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 60 } },
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsLive(true);
      setError(null);
    } catch {
      setError('Camera or microphone access denied. Allow permissions to go live.');
    }
  }, [streamId, userId]);

  // ─── Viewer: create offer toward the broadcaster ─────────────────────────
  const joinStream = useCallback(async () => {
    if (!streamId || !userId || !broadcasterId) return;
    if (myPCRef.current) return;

    setIsConnecting(true);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    myPCRef.current = pc;

    const remote = new MediaStream();
    remoteStreamRef.current = remote;
    setRemoteStream(remote);

    pc.ontrack = (e) => {
      if (e.track) remote.addTrack(e.track);
      const copy = new MediaStream(remote.getTracks());
      remoteStreamRef.current = copy;
      setRemoteStream(copy);
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal({
          type: 'ice-candidate',
          from: userId,
          to: broadcasterId,
          candidate: JSON.stringify(e.candidate.toJSON()),
        });
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        setError('Connection to the stream failed. Please try again.');
        setIsConnecting(false);
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal({ type: 'offer', from: userId, to: broadcasterId, sdp: offer.sdp });
    } catch {
      setError('Failed to start the connection to the stream.');
      setIsConnecting(false);
    }
  }, [broadcasterId, sendSignal, streamId, userId]);

  // ─── Controls ─────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const next = !isMuted;
    localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setIsMuted(next);
  }, [isMuted]);

  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    const next = !isCameraOff;
    localStreamRef.current.getVideoTracks().forEach((t) => { t.enabled = !next; });
    setIsCameraOff(next);
  }, [isCameraOff]);

  const flipCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    const oldTrack = localStreamRef.current.getVideoTracks()[0];
    if (!oldTrack) return;
    const facing = oldTrack.getSettings().facingMode || 'user';
    navigator.mediaDevices
      .getUserMedia({ audio: false, video: { facingMode: facing === 'environment' ? 'user' : 'environment' } })
      .then((newStream) => {
        const newTrack = newStream.getVideoTracks()[0];
        if (!newTrack) return;
        viewerPCsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(newTrack).catch(() => {});
        });
        oldTrack.stop();
        const oldTracks = localStreamRef.current!.getTracks().filter((t) => t !== oldTrack);
        const updated = new MediaStream([...oldTracks, newTrack]);
        localStreamRef.current = updated;
        setLocalStream(updated);
      })
      .catch(() => { /* flip not supported */ });
  }, []);

  const toggleScreenShare = useCallback(async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const screenTrack = screenStream.getVideoTracks()[0];
        if (!screenTrack) return;
        screenStreamRef.current = screenStream;
        viewerPCsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack).catch(() => {});
        });
        setIsScreenSharing(true);
      } else {
        const camTrack = localStreamRef.current?.getVideoTracks()[0];
        viewerPCsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender && camTrack) sender.replaceTrack(camTrack).catch(() => {});
        });
        screenStreamRef.current?.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
        setIsScreenSharing(false);
      }
    } catch { /* getDisplayMedia cancelled or unsupported */ }
  }, [isScreenSharing]);

  // ─── Cleanup ───────────────────────────────────────────────────────────────
  const leaveStream = useCallback(() => {
    unsubRef.current?.();
    unsubRef.current = null;
    viewerPCsRef.current.forEach((pc) => { try { pc.close(); } catch { /* ignore */ } });
    viewerPCsRef.current.clear();
    if (myPCRef.current) { try { myPCRef.current.close(); } catch { /* ignore */ } }
    myPCRef.current = null;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    if (isBroadcaster && localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setIsLive(false);
    setIsConnecting(false);
    setViewers([]);
  }, [isBroadcaster]);

  // ─── Subscribe to signals while mounted ───────────────────────────────────
  useEffect(() => {
    if (!streamId || !userId) return;
    const handler = isBroadcaster ? handleBroadcasterSignal : handleViewerSignal;
    unsubRef.current = subscribeSignals(handler);
    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [streamId, userId, isBroadcaster, subscribeSignals, handleBroadcasterSignal, handleViewerSignal]);

  // ─── Full cleanup on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => { leaveStream(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    localStream,
    remoteStream,
    isMuted,
    isCameraOff,
    isScreenSharing,
    isLive,
    isConnecting,
    viewers,
    error,
    startBroadcast,
    joinStream,
    leaveStream,
    toggleMute,
    toggleCamera,
    flipCamera,
    toggleScreenShare,
  };
}

export default useLiveStreamRTC;

