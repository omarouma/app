/**
 * Incoming Call Notifications Hook
 * 
 * Triggers notifications, sounds, and vibrations when an incoming call arrives.
 * Bridges the gap between call state and user feedback systems.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useCallStore } from '@/store/useCallStore';
import { useFriendStore } from '@/store/useFriendStore';
import {
    playIncomingCall,
    playMissedCall,
    vibrateIncomingCall,
    resumeAudio,
    initAudioOnInteraction,
} from '@/lib/sounds';
import { pushNotificationService } from '@/services/pushNotificationService';
import { getDocById, COLLECTIONS } from '@/lib/firestore';

/** Close any OS-level notifications shown for a call (by tag). */
async function closeCallNotifications(callId?: string) {
    try {
        const reg = await navigator.serviceWorker?.getRegistration();
        if (!reg) return;
        const notifications = await reg.getNotifications();
        for (const n of notifications) {
            if (callId ? n.tag === `call_${callId}` : n.tag.startsWith('call_')) n.close();
        }
    } catch { /* best-effort */ }
}

export function useIncomingCallNotifications() {
    const incomingCall = useCallStore((s) => s.incomingCall);
    const friends = useFriendStore((s) => s.friends);

    const ringtoneRef = useRef<{ stop: () => void } | null>(null);
    const vibrateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const notificationSentRef = useRef<Set<string>>(new Set());
    const callerInfoCacheRef = useRef<Map<string, { name: string; avatar?: string }>>(new Map());
    const lastIncomingRef = useRef<{ id: string; name: string; type: string } | null>(null);

    const stopRinging = useCallback(() => {
        if (ringtoneRef.current) {
            ringtoneRef.current.stop();
            ringtoneRef.current = null;
        }
        if (vibrateTimerRef.current) {
            clearInterval(vibrateTimerRef.current);
            vibrateTimerRef.current = null;
        }
        try { navigator.vibrate?.(0); } catch { /* noop */ }
    }, []);

    // Initialize audio context on first user interaction
    useEffect(() => {
        initAudioOnInteraction();
    }, []);

    // Fetch caller info if not in cache
    const getCallerInfo = useCallback(async (callerId: string) => {
        if (callerInfoCacheRef.current.has(callerId)) {
            return callerInfoCacheRef.current.get(callerId);
        }

        try {
            // Check friends list first
            const friend = friends.find(f => f.id === callerId);
            if (friend) {
                const info = { name: friend.name || 'User', avatar: friend.avatar };
                callerInfoCacheRef.current.set(callerId, info);
                return info;
            }

            // Fetch from Firestore
            const userData = await getDocById(COLLECTIONS.USERS, callerId);
            const info = {
                name: (userData?.name as string) || (userData?.displayName as string) || 'User',
                avatar: (userData?.avatar as string),
            };
            callerInfoCacheRef.current.set(callerId, info);
            return info;
        } catch {
            // Fallback to ID
            const info = { name: callerId };
            callerInfoCacheRef.current.set(callerId, info);
            return info;
        }
    }, [friends]);

    // Handle incoming call notifications and sounds
    useEffect(() => {
        if (!incomingCall) {
            // Ringing stopped — was the call answered, or missed/rejected?
            const wasRinging = lastIncomingRef.current;
            stopRinging();
            if (wasRinging) {
                lastIncomingRef.current = null;
                void closeCallNotifications(wasRinging.id);
                const answered = !!useCallStore.getState().currentCall;
                if (!answered) {
                    // WeChat-style missed call feedback: alert tone + persistent notification
                    playMissedCall();
                    if (pushNotificationService.canSend()) {
                        void pushNotificationService.sendNotification({
                            title: 'Missed call',
                            body: `${wasRinging.name} tried to ${wasRinging.type === 'video' ? 'video ' : ''}call you`,
                            tag: `missed_${wasRinging.id}`,
                            data: { type: 'call', callId: wasRinging.id },
                        });
                    }
                }
            }
            return;
        }

        // Prevent duplicate notifications for the same call
        if (notificationSentRef.current.has(incomingCall.id)) {
            return;
        }
        notificationSentRef.current.add(incomingCall.id);

        // Ensure audio context is initialized before playing sounds
        resumeAudio().catch(() => {
            // Audio context initialization may fail if no user interaction — continue anyway
        });

        // Play incoming call ringtone + vibration
        try {
            ringtoneRef.current = playIncomingCall();
            // WeChat-style: keep vibrating in pulses for as long as it rings
            vibrateIncomingCall();
            vibrateTimerRef.current = setInterval(() => {
                try { vibrateIncomingCall(); } catch { /* noop */ }
            }, 2500);
        } catch (e) {
            console.warn('[IncomingCall] Failed to play ringtone:', e);
        }

        // Send push notification if permissions available
        (async () => {
            try {
                const callType = incomingCall.type === 'video' || incomingCall.type === 'group_video' ? 'video' : 'voice';
                const callerInfo = await getCallerInfo(incomingCall.initiatorId);
                if (callerInfo) {
                    lastIncomingRef.current = { id: incomingCall.id, name: callerInfo.name, type: callType };
                }

                // Initialize push notification service if not already done
                const isSupported = pushNotificationService.isSupported();
                if (isSupported && callerInfo) {
                    // Try to get permission if not granted
                    if (Notification.permission === 'default') {
                        await pushNotificationService.requestPermission();
                    }

                    // Send notification if permission granted
                    if (pushNotificationService.canSend()) {
                        await pushNotificationService.showCallNotification(
                            callerInfo.name,
                            callType,
                            incomingCall.id
                        );
                    }
                }
            } catch (e) {
                console.warn('[IncomingCall] Failed to send push notification:', e);
            }
        })();

    }, [incomingCall, getCallerInfo, stopRinging]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopRinging();
        };
    }, [stopRinging]);
}
