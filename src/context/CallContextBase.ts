import { createContext, useContext } from 'react';

export interface CallContextValue {
  activeCall: { id: string; status: string; type: string; initiatorId: string } | null;
  isCallActive: boolean;
  localTracks: MediaStreamTrack[];
  remoteParticipants: { id: string; stream: MediaStream }[];
  isMuted: boolean;
  isVideoOn: boolean;
  callDuration: number;
  startCall: (user: { id: string }, mode: 'video' | 'voice') => Promise<string | undefined>;
  acceptCall: () => Promise<void>;
  endCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  muteAudio: () => void;
  toggleVideo: () => void;
}

export const CallContextBase = createContext<CallContextValue | undefined>(undefined);

export function useCallContext() {
  const ctx = useContext(CallContextBase);
  if (!ctx) throw new Error('useCallContext must be used within CallProvider');
  return ctx;
}
