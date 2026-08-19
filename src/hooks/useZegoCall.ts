import { useCallback, useRef, useState, useEffect } from 'react';
import type { ZegoCloudRoomConfig, ZegoUser } from '@zegocloud/zego-uikit-prebuilt';
import {
    ZEGO_APP_ID,
    ZEGO_SERVER_SECRET,
    getZegoUIKit,
    getZegoCallConfig,
    getZegoTokenServerUrl,
} from '@/lib/zego';
import env from '@/config/env';
import { getSupabaseSafe } from '@/lib/supabase';

export type ZegoCallQuality = 'good' | 'poor' | 'reconnecting';

export interface ZegoCallController {
    isJoined: boolean;
    isMuted: boolean;
    isVideoOn: boolean;
    isHeld: boolean;
    quality: ZegoCallQuality;
    isConnected: boolean;
    error: string | null;
    localStream: MediaStream | null;
    containerRef: React.RefObject<HTMLDivElement | null>;

    join: (roomID: string, userID: string, userName: string, isVideo: boolean) => Promise<void>;
    leave: () => void;
    toggleMute: () => void;
    toggleVideo: () => void;
    setHeld: (held: boolean) => void;
    flipCamera: () => Promise<void>;
    /** Register a callback that runs when the ZEGO prebuilt UI leaves the room (e.g. user pressed the End button). */
    onRoomEnded?: (cb?: () => void) => void;
}

/**
 * Manages the ZEGO Cloud prebuilt UI Kit for 1:1 calls.
 *
 * Responsibilities:
 *  - Lazily load @zegocloud/zego-uikit-prebuilt when a call starts.
 *  - Obtain a kit token from the serverless endpoint when configured
 *    (VITE_ZEGO_TOKEN_SERVER_URL), falling back to the test generator for
 *    local dev / existing deployments.
 *  - Join a ZEGO room with the prebuilt UI (mute/camera/screen-share/chat/UserList)
 *    configured exactly as provided in ZEGOCLOUD/WEB_UIKITS.html.
 *  - Expose connection state, mute/video state, and lifecycle calls to the app.
 *
 * NOTE: The prebuilt UI renders into `containerRef` —
 *       the parent must mount a <div ref={containerRef}> for the room.
 */
/** Minimal structural type for the object returned by `ZegoUIKitPrebuilt.create(...)`. */
export interface ZegoUIKitInstance {
    destroy: () => void;
    joinRoom: (config: ZegoCloudRoomConfig) => void;
    express?: {
        muteMicrophone?: (mute?: boolean) => void;
        unmuteMicrophone?: () => void;
        muteCamera?: (mute?: boolean) => void;
        unmuteCamera?: () => void;
        useFrontCamera?: (front?: boolean) => void;
        isCameraFront?: () => boolean;
    };
    localStream?: MediaStream;
}

export function useZegoCall(): ZegoCallController {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const instanceRef = useRef<ZegoUIKitInstance | null>(null);
    const onRoomEndedRef = useRef<(() => void) | null>(null);
    const isLeavingRef = useRef(false);

    // Expose a setter so the parent can register an "end call" callback
    // that runs when the ZEGO UI Kit's own End button triggers onLeaveRoom.
    const onRoomEnded = useCallback((cb?: () => void) => {
        onRoomEndedRef.current = cb ?? null;
    }, []);

    const [isJoined, setIsJoined] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOn, setIsVideoOn] = useState(true);
    const [isHeld, setIsHeld] = useState(false);
    const [quality, setQuality] = useState<ZegoCallQuality>('good');
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const hasRemoteRef = useRef(false);

    const syncLocalStream = useCallback(() => {
        const zp = instanceRef.current;
        const stream = (zp as unknown as { localStream?: MediaStream })?.localStream ?? null;
        setLocalStream(stream);
    }, []);

    const leave = useCallback(() => {
        // Mark that we're leaving programmatically so onLeaveRoom doesn't
        // fire the room-ended callback (which would double-end the call).
        // NOTE: We keep isLeavingRef.current = true until the next join()
        // call, because destroy() may be asynchronous and onLeaveRoom could
        // fire after this function returns.
        isLeavingRef.current = true;
        const zp = instanceRef.current;
        if (zp) {
            try {
                zp.destroy();
            } catch { /* ignore */ }
        }
        instanceRef.current = null;
        hasRemoteRef.current = false;
        setIsJoined(false);
        setIsMuted(false);
        setIsVideoOn(true);
        setIsHeld(false);
        setIsConnected(false);
        setQuality('good');
        setLocalStream(null);
        setError(null);
    }, []);

    useEffect(() => {
        return () => {
            try { instanceRef.current?.destroy(); } catch { /* ignore */ }
            instanceRef.current = null;
        };
    }, []);

    // ─── Server-side token acquisition ──────────────────────────────────────
    // When VITE_ZEGO_TOKEN_SERVER_URL is configured, we mint tokens from the
    // serverless endpoint (functions/src/index.ts GET /api/zego-token) so the
    // ZEGO server secret NEVER ships in the client bundle. Falls back to the
    // test generator for local dev / existing deployments.
    const fetchServerToken = useCallback(async (
        roomID: string,
        userID: string,
    ): Promise<string | null> => {
        const tokenServerUrl = getZegoTokenServerUrl() || env.VITE_ZEGO_TOKEN_SERVER_URL;
        if (!tokenServerUrl) return null;

        const supabase = getSupabaseSafe();
        const session = supabase ? await supabase.auth.getSession().catch(() => null) : null;
        const accessToken = session?.data?.session?.access_token;
        if (!accessToken) {
            console.warn('[ZEGO] No auth session available for server token request.');
            return null;
        }

        try {
            const url = new URL(
                tokenServerUrl.startsWith('/')
                    ? `${window.location.origin}${tokenServerUrl}`
                    : tokenServerUrl,
                window.location.origin,
            );
            url.searchParams.set('room', roomID);
            url.searchParams.set('user', userID);

            const response = await fetch(url.toString(), {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!response.ok) {
                console.warn(`[ZEGO] Token server responded ${response.status}.`);
                return null;
            }
            const data = (await response.json()) as { token?: string };
            if (!data.token) {
                console.warn('[ZEGO] Token server response missing `token`.');
                return null;
            }
            return data.token;
        } catch (err) {
            console.warn('[ZEGO] Token server fetch failed.', err);
            return null;
        }
    }, []);

    const join = useCallback(async (
        roomID: string,
        userID: string,
        userName: string,
        isVideo: boolean,
    ) => {
        // Do not destroy the active instance before we know the new room is about
        // to be created. The existing implementation could tear down the current
        // join path before the room is ready, which leaves the call hanging in a
        // dead "connecting" state.
        const existing = instanceRef.current;
        if (existing) {
            try { existing.destroy(); } catch { /* ignore */ }
            instanceRef.current = null;
        }

        // Reset the programmatic-leave flag so a new join can fire onLeaveRoom
        // normally (e.g. when the user presses the ZEGO UI's End button).
        isLeavingRef.current = false;

        if (!ZEGO_APP_ID) {
            setError('ZEGO Cloud is not configured. Please set VITE_ZEGO_APP_ID.');
            return;
        }
        if (!containerRef.current) {
            setError('A call container is required, but none was mounted.');
            return;
        }

        try {
            const { ZegoUIKitPrebuilt } = await getZegoUIKit();

            // Prefer the server-issued token. The client-side test secret is
            // allowed only during local development and must never be used by
            // a production build when the token endpoint is unavailable.
            let kitToken = await fetchServerToken(roomID, userID);
            if (!kitToken && import.meta.env.DEV && ZEGO_SERVER_SECRET) {
                kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(
                    ZEGO_APP_ID,
                    ZEGO_SERVER_SECRET,
                    roomID,
                    userID,
                    userName,
                );
            }
            if (!kitToken) {
                setError('ZEGO Cloud is not fully configured — missing token source.');
                return;
            }

            const zp = ZegoUIKitPrebuilt.create(kitToken);
            instanceRef.current = zp;

            const base = getZegoCallConfig() as Partial<ZegoCloudRoomConfig>;
            const roomConfig: ZegoCloudRoomConfig = {
                ...base,
                container: containerRef.current!,
                scenario: {
                    mode: ZegoUIKitPrebuilt.OneONoneCall,
                    config: { role: ZegoUIKitPrebuilt.Host },
                },
                showPreJoinView: false,
                turnOnCameraWhenJoining: isVideo,
                turnOnMicrophoneWhenJoining: true,
                showMyCameraToggleButton: isVideo,
                showMyMicrophoneToggleButton: true,
                showAudioVideoSettingsButton: true,
                showScreenSharingButton: isVideo,
                showTextChat: true,
                showUserList: true,
                maxUsers: 2,
                layout: 'Auto',
                showLayoutButton: false,
                onJoinRoom: () => {
                    setIsJoined(true);
                    setIsConnected(hasRemoteRef.current || false);
                    setError(null);
                    syncLocalStream();
                },
                onLeaveRoom: () => {
                    // If we're leaving programmatically (via our own leave()),
                    // don't fire the room-ended callback — the caller already
                    // handles ending the call. Only fire it when the user
                    // pressed the ZEGO UI's own End button.
                    if (isLeavingRef.current) return;
                    const endedCb = onRoomEndedRef.current;
                    leave();
                    if (endedCb) endedCb();
                },
                onUserJoin: (users: ZegoUser[]) => {
                    // Ignore our own join event — we only care about remote users.
                    if (users.length > 0) {
                        hasRemoteRef.current = true;
                        setIsJoined(true);
                        setIsConnected(true);
                        setQuality('good');
                        syncLocalStream();
                    }
                },
                onUserLeave: () => {
                    hasRemoteRef.current = false;
                    setIsConnected(false);
                    setIsJoined(false);
                },
                onMicrophoneStateUpdated: (state: 'ON' | 'OFF') => {
                    setIsMuted(state === 'OFF');
                },
                onCameraStateUpdated: (state: 'ON' | 'OFF') => {
                    setIsVideoOn(state === 'ON');
                },
                onLocalStreamUpdated: (state: 'created' | 'published' | 'stopped') => {
                    if (state === 'created' || state === 'published') {
                        syncLocalStream();
                    } else if (state === 'stopped') {
                        setLocalStream(null);
                    }
                },
            };

            setIsJoined(false);
            setIsConnected(false);
            setError(null);

            // Await joinRoom so we can surface join failures immediately
            // instead of hanging on "Joining room…" forever.
            try {
                await zp.joinRoom(roomConfig);
            } catch (joinErr) {
                const msg = joinErr instanceof Error ? joinErr.message : 'Failed to join the ZEGO room.';
                console.error('[ZEGO] joinRoom failed:', joinErr);
                setError(msg);
                leave();
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Failed to start the ZEGO call.';
            setError(msg);
            console.error('[ZEGO] Join failed:', e);
            leave();
        }
    }, [leave, syncLocalStream, fetchServerToken]);

    const toggleMute = useCallback(() => {
        const zp = instanceRef.current as unknown as { express?: { muteMicrophone?: (mute?: boolean) => void; unmuteMicrophone?: () => void } } | null;
        if (!zp?.express) return;
        try {
            if (isMuted) {
                zp.express.unmuteMicrophone?.();
            } else {
                zp.express.muteMicrophone?.(true);
            }
            setIsMuted(!isMuted);
        } catch { /* ignore */ }
    }, [isMuted]);

    const toggleVideo = useCallback(() => {
        const expr = instanceRef.current as unknown as { express?: { muteCamera?: (mute?: boolean) => void; unmuteCamera?: () => void } } | null;
        if (!expr?.express) return;
        try {
            if (!isVideoOn) {
                expr.express.unmuteCamera?.();
            } else {
                expr.express.muteCamera?.(true);
            }
            setIsVideoOn(!isVideoOn);
        } catch { /* ignore */ }
    }, [isVideoOn]);

    const setHeld = useCallback((held: boolean) => {
        setIsHeld(held);
        const expr = instanceRef.current as unknown as { express?: any } | null;
        if (expr?.express) {
            try {
                expr.express.muteMicrophone?.(held);
                expr.express.muteCamera?.(held);
            } catch { /* ignore */ }
        }
    }, []);

    const flipCamera = useCallback(async () => {
        const zp = instanceRef.current as unknown as {
            express?: { useFrontCamera?: (front?: boolean) => void; isCameraFront?: () => boolean };
        } | null;
        if (!zp?.express) return;
        try {
            const isFront = zp.express.isCameraFront?.() ?? true;
            zp.express.useFrontCamera?.(!isFront);
        } catch { /* not supported on this device/browser */ }
    }, []);

    return {
        isJoined,
        isMuted,
        isVideoOn,
        isHeld,
        quality,
        isConnected,
        error,
        localStream,
        containerRef,
        join,
        leave,
        toggleMute,
        toggleVideo,
        setHeld,
        flipCamera,
        onRoomEnded,
    };
}

export default useZegoCall;