import { useRef, useState, useCallback, useEffect } from 'react';
import type {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  IRemoteAudioTrack,
  IRemoteVideoTrack,
  ILocalAudioTrack,
  ILocalVideoTrack,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
} from 'agora-rtc-sdk-ng';
import env from '@/config/env';
import { isAgoraConfigured, resolveAgoraToken, getAgoraRTC } from '@/lib/agora';

export type AgoraCallQuality = 'good' | 'poor' | 'reconnecting';

export interface AgoraRemoteParticipant {
  user: IAgoraRTCRemoteUser;
  audioTrack: IRemoteAudioTrack | null;
  videoTrack: IRemoteVideoTrack | null;
}

export interface AgoraCallController {
  localAudioTrack: ILocalAudioTrack | null;
  localVideoTrack: ILocalVideoTrack | null;
  remoteAudioTrack: IRemoteAudioTrack | null;
  remoteVideoTrack: IRemoteVideoTrack | null;
  remoteUser: IAgoraRTCRemoteUser | null;
  // Multi-party support: every remote user in the channel (including the 1:1
  // primary remote for backward compatibility).
  remoteParticipants: AgoraRemoteParticipant[];
  isMuted: boolean;
  isVideoOn: boolean;
  isHeld: boolean;
  quality: AgoraCallQuality;
  isConnected: boolean;
  error: string | null;

  join: (channelName: string, uid: number, isVideo: boolean) => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => void;
  toggleVideo: () => void;
  setHeld: (held: boolean) => void;
  flipCamera: () => Promise<void>;
}

/**
 * Manages an Agora RTC channel for a 1:1 call.
 *
 * Responsibilities:
 *  - Create an RTC client (mode='rtc', host role).
 *  - Join a private channel with a per-channel token.
 *  - Publish local audio/video tracks.
 *  - Auto-subscribe to the remote user's audio/video.
 *  - Expose mute / video / hold / camera-flip controls.
 *
 * IMPORTANT: The caller owns the lifecycle — call `join()` when the call
 * starts and `leave()` when it ends (or on unmount).
 */
export function useAgoraCall(): AgoraCallController {
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioRef = useRef<ILocalAudioTrack | null>(null);
  const localVideoRef = useRef<ILocalVideoTrack | null>(null);
  const remoteUserRef = useRef<IAgoraRTCRemoteUser | null>(null);

const [localAudioTrack, setLocalAudioTrack] = useState<ILocalAudioTrack | null>(null);
  const [localVideoTrack, setLocalVideoTrack] = useState<ILocalVideoTrack | null>(null);
  const [remoteAudioTrack, setRemoteAudioTrack] = useState<IRemoteAudioTrack | null>(null);
  const [remoteVideoTrack, setRemoteVideoTrack] = useState<IRemoteVideoTrack | null>(null);
  const [remoteUser, setRemoteUser] = useState<IAgoraRTCRemoteUser | null>(null);
// Multi-party: keyed by Agora uid → participant tracks.
  const remoteMapRef = useRef<Map<string | number, AgoraRemoteParticipant>>(new Map());
  const [remoteParticipants, setRemoteParticipants] = useState<AgoraRemoteParticipant[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isHeld, setIsHeld] = useState(false);
  const [quality, setQuality] = useState<AgoraCallQuality>('good');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qualityTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Hydrate the derived array whenever the map changes.
  const syncRemoteParticipants = useCallback(() => {
    setRemoteParticipants(Array.from(remoteMapRef.current.values()));
  }, []);

  // Mirrors the first remote as the "primary" remote for backward compat.
  const syncPrimaryRemote = useCallback(() => {
    const first = remoteMapRef.current.values().next().value as AgoraRemoteParticipant | undefined;
    if (first) {
      setRemoteUser(first.user);
      setRemoteAudioTrack(first.audioTrack);
      setRemoteVideoTrack(first.videoTrack);
    } else {
      setRemoteUser(null);
      setRemoteAudioTrack(null);
      setRemoteVideoTrack(null);
    }
  }, []);

  // ─── Track cleanup helper ──────────────────────────────────────────────
  const safelyStop = useCallback((track?: ILocalAudioTrack | ILocalVideoTrack | null) => {
    try { track?.stop(); } catch { /* ignore */ }
  }, []);

  // ─── Quality monitor (proxy via connection state) ──────────────────────
  const startQualityMonitor = useCallback(() => {
    if (qualityTimerRef.current) return;
    qualityTimerRef.current = setInterval(() => {
      const client = clientRef.current;
      if (!client) return;
      const state = client.connectionState;
      if (state === 'DISCONNECTED') setQuality('reconnecting');
      else if (state === 'CONNECTED') setQuality('good');
    }, 3000);
  }, []);

  const stopQualityMonitor = useCallback(() => {
    if (qualityTimerRef.current) {
      clearInterval(qualityTimerRef.current);
      qualityTimerRef.current = null;
    }
  }, []);

  // ─── leave() ───────────────────────────────────────────────────────────
  const leave = useCallback(async () => {
    const client = clientRef.current;
    if (client) {
      try { await client.leave(); } catch { /* ignore */ }
    }
    clientRef.current = null;

    safelyStop(localAudioRef.current);
    safelyStop(localVideoRef.current);
    localAudioRef.current = null;
    localVideoRef.current = null;

remoteUserRef.current = null;
    remoteMapRef.current.clear();
    setRemoteParticipants([]);
    setRemoteUser(null);
    setRemoteAudioTrack(null);
    setRemoteVideoTrack(null);
    setLocalAudioTrack(null);
    setLocalVideoTrack(null);
    setIsMuted(false);
    setIsVideoOn(true);
    setIsHeld(false);
    setIsConnected(false);
    setQuality('good');
    stopQualityMonitor();
  }, [safelyStop, stopQualityMonitor]);

// ─── join() ────────────────────────────────────────────────────────────
  const join = useCallback(async (channelName: string, uid: number, isVideo: boolean) => {
    await leave();
    if (!isAgoraConfigured()) {
      setError('Agora is not configured. Set VITE_AGORA_APP_ID in your environment.');
      return;
    }

const appId = env.VITE_AGORA_APP_ID!;
    const AgoraRTC = (await getAgoraRTC()).default;
    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    clientRef.current = client;

// ── Client event handlers (multi-party aware) ──
    client.on('user-joined', (user: IAgoraRTCRemoteUser) => {
      remoteUserRef.current = user;
      if (!remoteMapRef.current.has(user.uid)) {
        remoteMapRef.current.set(user.uid, { user, audioTrack: null, videoTrack: null });
        syncRemoteParticipants();
        syncPrimaryRemote();
      }
    });

    client.on('user-published', async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
      try {
        await client.subscribe(user, mediaType);
        const existing = remoteMapRef.current.get(user.uid) ?? { user, audioTrack: null, videoTrack: null };
        if (mediaType === 'audio') {
          existing.audioTrack = user.audioTrack ?? null;
        } else {
          existing.videoTrack = user.videoTrack ?? null;
        }
        remoteMapRef.current.set(user.uid, existing);
        syncRemoteParticipants();
        syncPrimaryRemote();
        setIsConnected(true);
        setError(null);
      } catch { /* ignore */ }
    });

    client.on('user-unpublished', (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
      const existing = remoteMapRef.current.get(user.uid);
      if (existing) {
        if (mediaType === 'audio') existing.audioTrack = null;
        else existing.videoTrack = null;
        remoteMapRef.current.set(user.uid, existing);
        syncRemoteParticipants();
        syncPrimaryRemote();
      }
    });

    client.on('user-left', (user: IAgoraRTCRemoteUser) => {
      remoteMapRef.current.delete(user.uid);
      syncRemoteParticipants();
      syncPrimaryRemote();
      if (remoteUserRef.current?.uid === user.uid) {
        remoteUserRef.current = null;
      }
    });

    client.on('connection-state-change', (cur, _reason) => {
      if (cur === 'CONNECTED') {
        setIsConnected(true);
        setQuality('good');
      } else if (cur === 'RECONNECTING') {
        setQuality('reconnecting');
      } else if (cur === 'DISCONNECTED') {
        setIsConnected(false);
      }
    });

// ── Local tracks ──
    let audio: IMicrophoneAudioTrack | null = null;
    let video: ICameraVideoTrack | null = null;
    try {
      audio = await AgoraRTC.createMicrophoneAudioTrack({
        AEC: true,
        AGC: true,
        ANS: true,
      });
      if (isVideo) {
        video = await AgoraRTC.createCameraVideoTrack({
          encoderConfig: { width: 1280, height: 720, frameRate: 30 },
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to access camera/microphone.');
      await leave();
      return;
    }

    localAudioRef.current = audio;
    localVideoRef.current = video;
    if (audio) setLocalAudioTrack(audio);
    if (video) setLocalVideoTrack(video);
    setIsVideoOn(isVideo);

    // ── Publish tracks immediately after join ──
    const publishTracks = async () => {
      const tracks: (ILocalAudioTrack | ILocalVideoTrack)[] = [];
      if (audio) tracks.push(audio);
      if (video) tracks.push(video);
      if (tracks.length > 0) await client.publish(tracks);
    };

// ── Token ──
    // resolveAgoraToken handles the full precedence: serverless token
    // endpoint (VITE_AGORA_TOKEN_SERVER_URL) → client-side generated token
    // (VITE_AGORA_APP_CERTIFICATE) → no-token mode.
    const token = await resolveAgoraToken(channelName, uid);

    // ── Join + publish ──
    try {
      await client.join(appId, channelName, token, uid);
      await publishTracks();
      setIsConnected(true);
      setError(null);
      startQualityMonitor();
} catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to join the call channel.');
      await leave();
    }
  }, [leave, startQualityMonitor, syncRemoteParticipants, syncPrimaryRemote]);

  // ─── Controls ──────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const track = localAudioRef.current;
    if (!track) return;
    const next = !isMuted;
    track.setEnabled(!next);
    setIsMuted(next);
  }, [isMuted]);

  const toggleVideo = useCallback(() => {
    const track = localVideoRef.current;
    if (!track) return;
    const next = !isVideoOn;
    track.setEnabled(next);
    setIsVideoOn(next);
  }, [isVideoOn]);

  const setHeld = useCallback((held: boolean) => {
    localAudioRef.current?.setEnabled(!held);
    localVideoRef.current?.setEnabled(!held);
    setIsHeld(held);
  }, []);

const flipCamera = useCallback(async () => {
    const track = localVideoRef.current as ICameraVideoTrack | null;
    if (!track) return;
    try {
      const AgoraRTC = (await getAgoraRTC()).default;
      const devices = await AgoraRTC.getCameras();
      if (devices.length < 2) return;
      const currentLabel = track.getTrackLabel();
      const idx = devices.findIndex((d: { label: string; deviceId: string }) => d.label === currentLabel);
      const next = devices[(idx + 1) % devices.length];
      if (next) await track.setDevice(next.deviceId);
    } catch { /* camera flip not supported */ }
  }, []);

  // ─── Cleanup on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => { void leave(); };
  }, [leave]);

return {
    localAudioTrack,
    localVideoTrack,
    remoteAudioTrack,
    remoteVideoTrack,
    remoteUser,
    remoteParticipants,
    isMuted,
    isVideoOn,
    isHeld,
    quality,
    isConnected,
    error,
    join,
    leave,
    toggleMute,
    toggleVideo,
    setHeld,
    flipCamera,
  };
}

export default useAgoraCall;
