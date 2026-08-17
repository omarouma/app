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
export const ZEGO_TOKEN_SERVER_URL: string = readEnvString('VITE_ZEGO_TOKEN_SERVER_URL', '');

/**
 * Whether ZEGO is configured.
 */
export function isZegoConfigured(): boolean {
    return !!(ZEGO_APP_ID && (ZEGO_SERVER_SECRET || ZEGO_TOKEN_SERVER_URL));
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
    return {
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
}