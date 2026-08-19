// ZEGO Cloud App (public — safe for the client bundle).
// Never silently fall back to demo credentials during runtime. Missing config is
// a valid failure state that should surface a clear UI message instead of a
// dead "Connecting…" loop.
const VITE_ENV = typeof import.meta !== 'undefined' && import.meta && 'env' in import.meta
    ? import.meta.env ?? {}
    : {} as Record<string, string | boolean | undefined>;

function readEnvNumber(key: string, fallback: number): number {
    const raw = VITE_ENV[key];
    if (raw === undefined || raw === null || raw === '') return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
}

function readEnvString(key: string, fallback: string): string {
    const raw = VITE_ENV[key];
    if (raw === undefined || raw === null || raw === '') return fallback;
    return String(raw).trim();
}

export const ZEGO_APP_ID: number = readEnvNumber('VITE_ZEGO_APP_ID', 0);

// ZEGO Server Secret — used ONLY for test/demo mode via generateKitTokenForTest.
// For production we prefer a server-issued token. Missing config is treated as
// disabled until the environment is explicitly configured.
export const ZEGO_SERVER_SECRET: string = readEnvString('VITE_ZEGO_SERVER_SECRET', '');

// ZEGO signaling server URL — REQUIRED for the SDK to connect to the correct
// region. Without it the SDK falls back to the default global server, which
// does not match this project's region and calls fail to connect.
export const ZEGO_SERVER_URL: string = readEnvString('VITE_ZEGO_SERVER_URL', '');

export const ZEGO_TOKEN_SERVER_URL: string = readEnvString('VITE_ZEGO_TOKEN_SERVER_URL', '');

/**
 * Resolve the token endpoint even when an older deployment was built without
 * VITE_ZEGO_TOKEN_SERVER_URL. Supabase projects expose the Edge Function at a
 * deterministic URL, so the public project URL is enough to derive it.
 */
export function getZegoTokenServerUrl(): string {
    if (ZEGO_TOKEN_SERVER_URL) return ZEGO_TOKEN_SERVER_URL;
    const supabaseUrl = readEnvString('VITE_SUPABASE_URL', '');
    if (!supabaseUrl) return '';
    try {
        return `${new URL(supabaseUrl).origin}/functions/v1/zego-token`;
    } catch {
        return '';
    }
}

/**
 * Whether ZEGO is configured.
 */
export function isZegoConfigured(): boolean {
    const hasTokenSource = import.meta.env.DEV
        ? !!(ZEGO_SERVER_SECRET || getZegoTokenServerUrl())
        : !!getZegoTokenServerUrl();
    return !!(ZEGO_APP_ID && hasTokenSource);
}

/**
 * Derive a stable ZEGO user ID from the app user ID.
 * ZEGO requires userIDs to be unique per user. We prefix with "gaga_" to
 * avoid collisions with other ZEGO apps and sanitize to allowed charset.
 */
export function deriveZegoUserID(userId: string): string {
    // ZEGO userID supports alphanumerics, '_' and '-'. Strip anything else.
    const sanitized = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    return sanitized || `gaga_${Math.floor(Math.random() * 1_000_000)}`;
}

/**
 * Build the ZEGO room ID from a call ID.
 */
export function buildZegoRoomID(callId: string): string {
    return `call_${String(callId).replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, 64);
}

/**
 * Whether the ZEGO UI Kit prebuilt module is available.
 * This dynamically imports the module to keep it out of the initial bundle —
 * it only loads when a call actually starts.
 */
let _zegoModule: Promise<typeof import('@zegocloud/zego-uikit-prebuilt')> | null = null;

/** The resolved runtime module type of the ZEGO UI Kit (used for type-only access). */
export type ZegoUIKitModule = Awaited<ReturnType<typeof getZegoUIKit>>;

export function getZegoUIKit(): Promise<typeof import('@zegocloud/zego-uikit-prebuilt')> {
    if (!_zegoModule) {
        _zegoModule = import('@zegocloud/zego-uikit-prebuilt');
    }
    return _zegoModule;
}

/**
 * Default ZEGO call room configuration for 1:1 calls.
 * Matches the exact configuration provided in ZEGOCLOUD/WEB_UIKITS.html.
 */
export function getZegoCallConfig(): Record<string, unknown> {
    const config: Record<string, unknown> = {
        turnOnMicrophoneWhenJoining: true,
        turnOnCameraWhenJoining: true,
        showMyCameraToggleButton: true,
        showMyMicrophoneToggleButton: true,
        showAudioVideoSettingsButton: true,
        showScreenSharingButton: true,
        showTextChat: true,
        showUserList: true,
        maxUsers: 2,
        layout: 'Auto',
        showLayoutButton: false,
        scenario: {
            mode: 'OneONoneCall',
            config: {
                role: 'Host',
            },
        },
    };

    // Critical: point the SDK at the project's regional signaling server.
    // Without this the SDK uses the default global server, which does not
    // match this project's region and calls fail to connect.
    if (ZEGO_SERVER_URL) {
        config.serverUrl = ZEGO_SERVER_URL;
    }

    return config;
}
