import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

export type PermissionType =
    | 'camera'
    | 'contacts'
    | 'location'
    | 'microphone'
    | 'notifications'
    | 'phone'
    | 'photos';

export type PermissionStatus = 'granted' | 'denied' | 'prompt' | 'unsupported' | 'unknown';

export interface AppPermission {
    id: PermissionType;
    label: string;
    description: string;
    icon: string;
    requiresUserGesture: boolean;
    isSupported: () => boolean;
    request: () => Promise<PermissionStatus>;
    check: () => Promise<PermissionStatus>;
    openSettings?: () => void;
}

/* ─── Media permission helpers ──────────────────────────── */

async function checkMedia(kind: 'audio' | 'video'): Promise<PermissionStatus> {
    if (typeof navigator === 'undefined') return 'unsupported';
    try {
        const permName = kind === 'audio' ? 'microphone' : 'camera';
        if (navigator.permissions && typeof navigator.permissions.query === 'function') {
            const result = await navigator.permissions.query({ name: permName as PermissionName });
            return (result.state || 'prompt') as PermissionStatus;
        }
    } catch { /* fall through */ }
    return 'prompt';
}

async function requestMedia(kind: 'audio' | 'video'): Promise<PermissionStatus> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return 'unsupported';
    try {
        const constraints: MediaStreamConstraints = kind === 'audio'
            ? { audio: true }
            : { video: { facingMode: 'user' } };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        stream.getTracks().forEach(t => t.stop());
        return 'granted';
    } catch {
        return 'denied';
    }
}

/* ─── Notification ─────────────────────────────────────── */

async function checkNotifications(): Promise<PermissionStatus> {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission as PermissionStatus;
}

async function requestNotifications(): Promise<PermissionStatus> {
    if (typeof Notification === 'undefined') return 'unsupported';
    try {
        const result = await Notification.requestPermission();
        return result as PermissionStatus;
    } catch {
        return 'unsupported';
    }
}

/* ─── Geolocation ──────────────────────────────────────── */

async function checkLocation(): Promise<PermissionStatus> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported';
    try {
        if (navigator.permissions && typeof navigator.permissions.query === 'function') {
            const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
            return (result.state || 'prompt') as PermissionStatus;
        }
    } catch { /* fall through */ }
    return 'prompt';
}

async function requestLocation(): Promise<PermissionStatus> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported';
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            () => resolve('granted'),
            (err) => {
                if (err.code === err.PERMISSION_DENIED) resolve('denied');
                else resolve('prompt');
            },
            { timeout: 5000 }
        );
    });
}

/* ─── Contacts (Chrome/Edge contact picker) ────────────── */

async function checkContacts(): Promise<PermissionStatus> {
    if (typeof navigator === 'undefined') return 'unsupported';
    const nav = navigator as unknown as { contacts?: { select?: unknown } };
    return nav.contacts?.select ? 'prompt' : 'unsupported';
}

async function requestContacts(): Promise<PermissionStatus> {
    if (typeof navigator === 'undefined') return 'unsupported';
    const nav = navigator as unknown as {
        contacts?: { select: (props: string[], opts?: { multiple?: boolean }) => Promise<unknown> };
    };
    if (!nav.contacts?.select) return 'unsupported';
    try {
        await nav.contacts.select(['name', 'tel', 'email'], { multiple: true });
        return 'granted';
    } catch {
        return 'denied';
    }
}

/* ─── Photos / Videos (file picker) ────────────────────── */

async function checkPhotos(): Promise<PermissionStatus> {
    if (typeof window === 'undefined' || !window.isSecureContext) return 'unsupported';
    return 'granted';
}

/* ─── Phone (PWA install) ──────────────────────────────── */

const isPWA = () => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;
};

async function checkPhone(): Promise<PermissionStatus> {
    if (typeof window === 'undefined') return 'unsupported';
    return isPWA() ? 'granted' : 'prompt';
}

async function requestPhone(): Promise<PermissionStatus> {
    if (typeof window === 'undefined') return 'unsupported';
    if (isPWA()) return 'granted';
    toast.info('Install GaGa Chat on your home screen for full phone features', {
        description: 'Use your browser menu → Add to Home Screen',
        duration: 5000,
    });
    return 'prompt';
}

/* ─── Audio unlock ─────────────────────────────────────── */

async function checkAudio(): Promise<PermissionStatus> {
    if (typeof window === 'undefined') return 'unsupported';
    return sessionStorage.getItem('gaga_audio_unlocked') === 'true' ? 'granted' : 'prompt';
}

async function requestAudio(): Promise<PermissionStatus> {
    if (typeof document === 'undefined') return 'unsupported';
    try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        await ctx.resume();
        sessionStorage.setItem('gaga_audio_unlocked', 'true');
        void ctx.close();
        return 'granted';
    } catch {
        return 'prompt';
    }
}

/* ─── Registry ─────────────────────────────────────────── */

export const APP_PERMISSIONS: AppPermission[] = [
    {
        id: 'camera', label: 'Camera', icon: '📷',
        description: 'Video calls, reels, stories, and live streaming',
        requiresUserGesture: true,
        isSupported: () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
        request: () => requestMedia('video'), check: () => checkMedia('video'),
    },
    {
        id: 'microphone', label: 'Microphone', icon: '🎙️',
        description: 'Voice & video calls, voice messages, and live streaming',
        requiresUserGesture: true,
        isSupported: () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
        request: () => requestMedia('audio'), check: () => checkMedia('audio'),
    },
    {
        id: 'notifications', label: 'Notifications', icon: '🔔',
        description: 'Alerts for messages, calls, and activity',
        requiresUserGesture: true,
        isSupported: () => typeof Notification !== 'undefined',
        request: requestNotifications, check: checkNotifications,
    },
    {
        id: 'location', label: 'Location', icon: '📍',
        description: 'Nearby friends, events, and marketplace items',
        requiresUserGesture: true,
        isSupported: () => typeof navigator !== 'undefined' && !!navigator.geolocation,
        request: requestLocation, check: checkLocation,
    },
    {
        id: 'contacts', label: 'Contacts', icon: '👥',
        description: 'Sync phone contacts to find friends',
        requiresUserGesture: true,
        isSupported: () => {
            if (typeof navigator === 'undefined') return false;
            return !!(navigator as unknown as { contacts?: { select?: unknown } }).contacts?.select;
        },
        request: requestContacts, check: checkContacts,
    },
    {
        id: 'photos', label: 'Photos & Videos', icon: '🖼️',
        description: 'Share media in chats, posts, and reels',
        requiresUserGesture: true,
        isSupported: () => typeof window !== 'undefined' && !!window.isSecureContext,
        request: async () => 'granted', check: checkPhotos,
    },
    {
        id: 'phone', label: 'Phone', icon: '📱',
        description: 'Install as an app for quick access and device integration',
        requiresUserGesture: false,
        isSupported: () => typeof window !== 'undefined',
        request: requestPhone, check: checkPhone,
    },
];

/* ─── Hook ─────────────────────────────────────────────── */

export function useAppPermissions() {
    const [statuses, setStatuses] = useState<Record<PermissionType, PermissionStatus>>({
        camera: 'unknown', contacts: 'unknown', location: 'unknown',
        microphone: 'unknown', notifications: 'unknown', phone: 'unknown', photos: 'unknown',
    });
    const [audioStatus, setAudioStatus] = useState<PermissionStatus>('unknown');
    const [requesting, setRequesting] = useState<Record<string, boolean>>({});

    const checkAll = useCallback(async () => {
        const entries = await Promise.all(
            APP_PERMISSIONS.map(async (p) => {
                try { return [p.id, await p.check()] as const; }
                catch { return [p.id, 'unknown' as PermissionStatus] as const; }
            })
        );
        setStatuses(Object.fromEntries(entries) as Record<PermissionType, PermissionStatus>);
        setAudioStatus(await checkAudio().catch(() => 'unknown' as PermissionStatus));
    }, []);

    useEffect(() => {
        void checkAll();
        const onVisible = () => { if (document.visibilityState === 'visible') void checkAll(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [checkAll]);

    const checkPermission = useCallback(async (type: PermissionType): Promise<PermissionStatus> => {
        const p = APP_PERMISSIONS.find(x => x.id === type);
        if (!p) return 'unknown';
        const s = await p.check().catch(() => 'unknown' as PermissionStatus);
        setStatuses(prev => ({ ...prev, [type]: s }));
        return s;
    }, []);

    const requestPermission = useCallback(async (type: PermissionType): Promise<PermissionStatus> => {
        const p = APP_PERMISSIONS.find(x => x.id === type);
        if (!p) return 'unknown';
        setRequesting(prev => ({ ...prev, [type]: true }));
        try {
            let s = await p.check();
            if (s !== 'granted' && s !== 'denied') s = await p.request();
            setStatuses(prev => ({ ...prev, [type]: s }));
            return s;
        } finally {
            setRequesting(prev => ({ ...prev, [type]: false }));
        }
    }, []);

    const ensureCallPermissions = useCallback(async (isVideo: boolean): Promise<boolean> => {
        const mic = await requestPermission('microphone');
        if (mic !== 'granted') {
            toast.error('Microphone access is required for calls');
            return false;
        }
        if (isVideo) {
            const cam = await requestPermission('camera');
            if (cam !== 'granted') {
                toast.error('Camera access is required for video calls');
                return false;
            }
        }
        return true;
    }, [requestPermission]);

    return {
        statuses,
        audioStatus,
        requesting,
        checkPermission,
        checkAll,
        requestPermission,
        requestAudio,
        ensureCallPermissions,
        permissions: APP_PERMISSIONS,
    };
}

export default useAppPermissions;