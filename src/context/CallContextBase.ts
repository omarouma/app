import { createContext, useContext } from 'react';

export interface CallContextValue {
  activeCall: { id: string; status: string; type: string; initiatorId: string } | null;
  isCallActive: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  localTracks: MediaStreamTrack[];
  remoteParticipants: { id: string; stream: MediaStream }[];
  isMuted: boolean;
  isVideoOn: boolean;
  isConnected: boolean;
  isHeld: boolean;
  quality: 'good' | 'poor' | 'reconnecting';
  // UI so users see a clear error instead of an endless "Connecting…" ring.
  configuredError: string | null;
  mediaError: string | null;
  callDuration: number;
  // currentUserId is optional — the provider derives it from the auth store
  // when not supplied (so callers can pass just { id }).
  startCall: (user: { id: string; currentUserId?: string }, mode: 'video' | 'voice') => Promise<string | undefined>;
  acceptCall: () => Promise<void>;
  endCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  muteAudio: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  flipCamera: () => void;
  toggleHold: () => void;
  sendDTMF: (tone: string) => Promise<boolean>;
  hold: () => void;
  resume: () => void;
}

export const CallContextBase = createContext<CallContextValue | undefined>(undefined);

export function useCallContext() {
  const ctx = useContext(CallContextBase);
  if (!ctx) throw new Error('useCallContext must be used within CallProvider');
  return ctx;
}
