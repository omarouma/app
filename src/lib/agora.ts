import env from '@/config/env';
import { buildAgoraRtcToken } from './agoraToken';

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
export function isAgoraConfigured(): boolean {
  return !!env.VITE_AGORA_APP_ID;
}

/**
 * Resolve the RTC token for a channel.
 *
 * Precedence:
 *  1. A serverless token endpoint (VITE_AGORA_TOKEN_SERVER_URL), if configured.
 *  2. Client-side generated token (only meaningful when a certificate is set).
 *  3. Empty string — Agora will connect in "no-token" mode (works when the
 *     project has no App Certificate enabled).
 */
export async function resolveAgoraToken(
  channelName: string,
  uid: number,
): Promise<string> {
  const appId = env.VITE_AGORA_APP_ID;
  if (!appId) return '';

  // 1) Serverless token endpoint (preferred in production).
  const tokenServerUrl = env.VITE_AGORA_TOKEN_SERVER_URL;
  if (tokenServerUrl) {
    try {
      const url = new URL(tokenServerUrl);
      url.searchParams.set('channel', channelName);
      url.searchParams.set('uid', String(uid));
      const res = await fetch(url.toString(), { method: 'GET' });
      if (!res.ok) {
        throw new Error(`Token server returned ${res.status}`);
      }
      const data = (await res.json()) as { token?: string; rtcToken?: string };
      const token = data.token ?? data.rtcToken;
      if (token) return token;
    } catch (e) {
      if (env.DEV) console.warn('[Agora] Token server failed, falling back to local token:', e);
    }
  }

  // 2) Client-side token (dev convenience when a certificate is configured).
  const certificate = env.VITE_AGORA_APP_CERTIFICATE;
  if (certificate) {
    try {
      const { token } = await buildAgoraRtcToken({
        appId,
        appCertificate: certificate,
        channelName,
        uid,
        expireInSeconds: 12 * 3600,
      });
      return token;
    } catch (e) {
      if (env.DEV) console.warn('[Agora] Local token generation failed:', e);
    }
  }

  // 3) No token.
  return '';
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
  void client.setClientRole('host').catch(() => {});
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
  const token = await resolveAgoraToken(config.channelName, config.uid);
  await client.join(config.appId, config.channelName, token, config.uid);

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
