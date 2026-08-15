import env from '@/config/env';

// Type-only imports from the Agora SDK. These are erased at compile time and
// do NOT pull the 1.1 MB SDK into the bundle. The runtime module is loaded
// lazily via getAgoraRTC() → dynamic import() so the SDK only downloads when a
// call actually starts (code-splitting / performance optimization).
import type {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ILocalAudioTrack,
  ILocalVideoTrack,
  IMicrophoneAudioTrack,
  ICameraVideoTrack,
} from 'agora-rtc-sdk-ng';

export type AgoraQualityLevel = 'good' | 'poor' | 'reconnecting';

export interface AgoraCallConfig {
  appId: string;
  channelName: string;
  uid: number;
  isVideo: boolean;
}

export interface AgoraMediaContext {
  client: IAgoraRTCClient;
  localAudioTrack: ILocalAudioTrack | null;
  localVideoTrack: ILocalVideoTrack | null;
  remoteUser: IAgoraRTCRemoteUser | null;
  isMuted: boolean;
  isVideoOn: boolean;
  isHeld: boolean;
  quality: AgoraQualityLevel;
  isConnected: boolean;
}

/**
 * Lazy-load the Agora RTC SDK.
 *
 * The SDK is a large module (~1.1 MB / 309 KB gzip). To keep it out of the
 * initial bundle, we dynamically `import()` it the first time it's needed and
 * cache the resolved module. All subsequent calls reuse the cached instance.
 *
 * Returns the AgoraRTC default export (the namespace object with factory
 * methods like `createClient`, `createMicrophoneAudioTrack`, etc.).
 */
let _agoraModule: Promise<typeof import('agora-rtc-sdk-ng')> | null = null;
export function getAgoraRTC(): Promise<typeof import('agora-rtc-sdk-ng')> {
  if (!_agoraModule) {
    _agoraModule = import('agora-rtc-sdk-ng');
  }
  return _agoraModule;
}

/**
 * Whether the Agora App ID is configured.
 */
export function isAgoraConfigured(appId?: string): boolean {
  return !!(appId ?? env.VITE_AGORA_APP_ID);
}

/**
 * Derive the deterministic Agora uid from an authenticated app user id.
 * This MUST match the server-side implementation in the token endpoints.
 */
export function deriveAgoraUid(userId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const n = hash >>> 0;
  return n === 0 ? 1 : n;
}

/**
 * Result of resolving an RTC token. When a token server is configured the
 * server is authoritative for the Agora uid (it derives it from the
 * authenticated user); otherwise the caller-provided uid is used.
 */
export interface AgoraTokenResolution {
  token: string | null;
  uid: number;
}

/**
 * Resolve the RTC token for a channel.
 *
 * Security: the Agora App Certificate NEVER ships to the client. Token
 * generation happens exclusively via a serverless endpoint. If no token
 * server is configured, we fall back to "no-token" mode (only works when
 * the Agora project has the App Certificate disabled — fine for dev/demo).
 *
 * The endpoint is authenticated with the current Supabase session's access
 * token (the app's primary auth system); the deployed Cloud Function also
 * accepts Firebase ID tokens as a fallback. The client does NOT send a uid —
 * the server derives it from the authenticated user and returns it, which
 * prevents users from minting tokens as someone else.
 */
export async function resolveAgoraToken(
  channelName: string,
  uid: number,
): Promise<AgoraTokenResolution> {
  const appId = env.VITE_AGORA_APP_ID;
  if (!appId) return { token: '', uid };

  // 1) Serverless token endpoint (MANDATORY in production for security).
  const tokenServerUrl = env.VITE_AGORA_TOKEN_SERVER_URL;
  if (tokenServerUrl) {
    try {
      // Authenticate with whatever session the app has (Supabase primary,
      // Firebase fallback). No session → endpoint will 401 and we fall back.
      const headers: Record<string, string> = {};
      try {
        const { getSupabaseSafe } = await import('@/lib/supabase');
        const supabase = getSupabaseSafe();
        const { data } = supabase ? await supabase.auth.getSession() : { data: null };
        const accessToken = data?.session?.access_token;
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      } catch { /* session unavailable — try the endpoint unsigned */ }
      if (!headers.Authorization) {
        try {
          const { getFirebaseAuth, firebaseServicesReady } = await import('@/lib/firebase');
          await firebaseServicesReady();
          const idToken = await getFirebaseAuth()?.currentUser?.getIdToken();
          if (idToken) headers.Authorization = `Bearer ${idToken}`;
        } catch { /* firebase auth not in use */ }
      }

      // Support relative endpoints (e.g. "/api/agora-token" via Hosting rewrite)
      const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
      const url = new URL(tokenServerUrl, base);
      url.searchParams.set('channel', channelName);
      const res = await fetch(url.toString(), { method: 'GET', headers });
      if (res.ok) {
        const data = (await res.json()) as { token?: string; rtcToken?: string; uid?: number | string };
        const token = data.token ?? data.rtcToken;
        const serverUid = Number(data.uid);
        if (token) {
          return {
            token,
            uid: Number.isFinite(serverUid) && serverUid > 0 ? serverUid : uid,
          };
        }
      } else if (env.DEV) {
        console.warn(`[Agora] Token server returned ${res.status}; falling back to no-token mode.`);
      }
    } catch (e) {
      if (env.DEV) console.warn('[Agora] Token server failed, falling back to no-token mode:', e);
    }
  }

  // 2) No token. Only works when the Agora project has no App Certificate.
  // NOTE: As of env.ts, AGORA_APP_CERTIFICATE has NO `VITE_` prefix, so it
  // is never inlined into the client bundle. Client-side token generation is
  // intentionally disabled. Deploy VITE_AGORA_TOKEN_SERVER_URL for production.
  // Use null instead of empty string (Agora SDK requires null for no-token mode).
  return { token: null as any, uid };
}

/**
 * Create an Agora RTC client configured for a 1:1 call channel.
 * Role is always "host" so both parties can publish audio/video.
 */
export async function createAgoraClient(): Promise<IAgoraRTCClient> {
  const AgoraRTC = (await getAgoraRTC()).default;
  const client = AgoraRTC.createClient({
    mode: 'rtc',
    codec: 'vp8',
  });
  // Both users need to publish their own tracks for a 1:1 call.
  void client.setClientRole('host').catch(() => { });
  return client;
}

/**
 * Join a channel with the given local tracks.
 * Returns the joined client.
 */
export async function joinAgoraChannel(
  client: IAgoraRTCClient,
  config: AgoraCallConfig,
  localAudioTrack: ILocalAudioTrack | null,
  localVideoTrack: ILocalVideoTrack | null,
): Promise<void> {
  const { token, uid } = await resolveAgoraToken(config.channelName, config.uid);
  await client.join(config.appId, config.channelName, token, uid);

  const tracks = [localAudioTrack, localVideoTrack].filter(Boolean) as (
    | ILocalAudioTrack
    | ILocalVideoTrack
  )[];
  if (tracks.length > 0) {
    await client.publish(tracks);
  }
}

/**
 * Create local audio + (optional) video tracks for a call.
 */
export async function createAgoraLocalTracks(
  isVideo: boolean,
): Promise<{ audio: IMicrophoneAudioTrack; video: ICameraVideoTrack | null }> {
  const AgoraRTC = (await getAgoraRTC()).default;
  const audio = await AgoraRTC.createMicrophoneAudioTrack({
    encoderConfig: {
      bitrate: 48,
      sampleRate: 48000,
      stereo: false,
    },
    AEC: true,
    AGC: true,
    ANS: true,
  });
  let video: ICameraVideoTrack | null = null;
  if (isVideo) {
    video = await AgoraRTC.createCameraVideoTrack({
      encoderConfig: {
        width: 1280,
        height: 720,
        frameRate: 30,
      },
    });
  }
  return { audio, video };
}

/**
 * Subscribe to the only remote user in a 1:1 channel.
 * Returns the remote user object once subscribed, or null.
 */
export async function subscribeToRemoteUser(
  client: IAgoraRTCClient,
  remoteUser: IAgoraRTCRemoteUser,
): Promise<void> {
  if (remoteUser.hasAudio) {
    await client.subscribe(remoteUser, 'audio');
  }
  if (remoteUser.hasVideo) {
    await client.subscribe(remoteUser, 'video');
  }
}

// ─── Re-export types for convenience ───────────────────────────────────────
export type { IAgoraRTCRemoteUser, ILocalAudioTrack, ILocalVideoTrack, IAgoraRTCClient };
