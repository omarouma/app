import { useEffect, useMemo } from 'react';
import { useWebRTCManager } from '@/hooks/useWebRTCManager';

export interface WebRTCState {
    // ZEGO prebuilt container ref — the CallOverlay mounts a <div> with this
    // ref so the ZEGO UI Kit can render its full call UI into it.
    containerRef: React.RefObject<HTMLDivElement | null>;
    // True only after ZEGO successfully joined — CallOverlay swaps to ZEGO UI.
    isZegoActive: boolean;
    isConnected: boolean;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    remoteParticipants: { uid: string | number; stream: MediaStream }[];
    isMuted: boolean;
    isVideoOn: boolean;
    isHeld: boolean;
    quality: 'good' | 'poor' | 'reconnecting';
    configuredError: string | null;
    mediaError: string | null;
    toggleMute: () => void;
    toggleVideo: () => void;
    flipCamera: () => Promise<void>;
    toggleHold: () => void;
    sendDTMF: (tone: string) => Promise<boolean>;
    hold: () => void;
    resume: () => void;
    endCall: () => void;
}

interface WebRTCProviderProps {
    onStateChange: (state: WebRTCState) => void;
}

/**
 * Lazy-loaded WebRTC provider that only mounts when a call is active.
 * This defers the ZEGO Cloud SDK bundle until it's actually needed.
 */
export function WebRTCProvider({ onStateChange }: WebRTCProviderProps): null {
    const webrtc = useWebRTCManager();

    const nextState = useMemo<WebRTCState>(() => ({
        containerRef: webrtc.containerRef,
        isZegoActive: webrtc.isZegoActive,
        isConnected: webrtc.isConnected,
        localStream: webrtc.localStream,
        remoteStream: webrtc.remoteStream,
        remoteParticipants: webrtc.remoteParticipants,
        isMuted: webrtc.isMuted,
        isVideoOn: webrtc.isVideoOn,
        isHeld: webrtc.isHeld,
        quality: webrtc.quality,
        configuredError: webrtc.configuredError,
        mediaError: webrtc.mediaError,
        toggleMute: webrtc.toggleMute,
        toggleVideo: webrtc.toggleVideo,
        flipCamera: async () => { await webrtc.flipCamera(); },
        toggleHold: webrtc.toggleHold,
        sendDTMF: webrtc.sendDTMF,
        hold: webrtc.hold,
        resume: webrtc.resume,
        endCall: webrtc.endCall,
    }), [webrtc]);

    useEffect(() => {
        onStateChange(nextState);
    }, [nextState, onStateChange]);

    return null;
}

export default WebRTCProvider;
