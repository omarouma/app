/**
 * Global Incoming Message Notifications Hook (WeChat-style)
 *
 * Watches the global chat list subscription and reacts to NEW incoming
 * messages from other people:
 *
 *   * App in FOREGROUND, chat not open → message sound + vibration.
 *   * App in BACKGROUND / tab hidden  → OS notification via the service
 *     worker (tapping it opens the chat), plus vibration.
 *   * Group chats use the softer group ping; muted chats stay silent.
 *   * Messages you send yourself, and the currently-open conversation,
 *     never trigger alerts.
 *
 * Mount once near the app root (App.tsx), next to useIncomingCallNotifications.
 */

import { useEffect, useRef } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendStore } from '@/store/useFriendStore';
import {
    playMessageReceived,
    playGroupMessage,
    vibrateMessageReceived,
    resumeAudio,
    areSoundsEnabled,
    isQuietHours,
} from '@/lib/sounds';
import { pushNotificationService } from '@/services/pushNotificationService';
import { getActiveChatId } from '@/lib/activeChat';

function previewText(content: string): string {
    if (!content) return 'New message';
    return content.length > 80 ? `${content.slice(0, 80)}…` : content;
}

export function useMessageNotifications() {
    const chats = useChatStore((s) => s.chats);
    const user = useAuthStore((s) => s.user);
    const friends = useFriendStore((s) => s.friends);

    // chatId → last seen updatedAt; null until the first snapshot has been
    // recorded so we never alert on pre-existing history.
    const seenRef = useRef<Map<string, string> | null>(null);

    useEffect(() => {
        if (!user?.id) return;

        const stampOf = (c: { updatedAt?: string | Date }) =>
            c.updatedAt ? String(c.updatedAt) : '';

        // First snapshot: record state without notifying.
        if (seenRef.current === null) {
            seenRef.current = new Map(chats.map((c) => [c.id, stampOf(c)]));
            return;
        }

        const seen = seenRef.current;

        for (const chat of chats) {
            const prevUpdatedAt = seen.get(chat.id) ?? '';
            const curUpdatedAt = stampOf(chat);
            seen.set(chat.id, curUpdatedAt);

            // No change, or a chat we haven't seen before (just created/joined)
            if (!curUpdatedAt || curUpdatedAt === prevUpdatedAt) continue;

            const senderId = chat.lastMessageSenderId || '';
            if (!senderId || senderId === user.id) continue; // own messages stay silent
            if (chat.isMuted) continue; // muted chats stay silent

            const isGroup = chat.type === 'group';
            const rawPreview = typeof chat.lastMessage === 'string'
                ? chat.lastMessage
                : (chat.lastMessage?.content || '');
            const senderName = isGroup
                ? (chat.name || 'Group')
                : (friends.find((f) => f.id === senderId)?.name || 'New message');
            const body = isGroup
                ? `${friends.find((f) => f.id === senderId)?.name || 'Someone'}: ${previewText(rawPreview)}`
                : previewText(rawPreview);

            const chatIsOpen = getActiveChatId() === chat.id;
            const tabVisible = typeof document !== 'undefined' && document.visibilityState === 'visible';

            // 1. Foreground: sound + vibration (unless you're already inside this chat)
            if (!(chatIsOpen && tabVisible) && areSoundsEnabled() && !isQuietHours()) {
                void resumeAudio().then(() => {
                    if (isGroup) playGroupMessage();
                    else playMessageReceived();
                    vibrateMessageReceived();
                }).catch(() => { /* autoplay blocked — vibration still fired */ vibrateMessageReceived(); });
            }

            // 2. Background (tab hidden / minimized): OS notification so the
            //    user sees it outside the app — tapping opens the chat.
            if (!tabVisible && pushNotificationService.canSend()) {
                void pushNotificationService.sendNotification({
                    title: senderName,
                    body,
                    tag: `msg_${chat.id}`,
                    data: { type: 'message', chatId: chat.id, userId: senderId, senderName },
                });
            }
        }
    }, [chats, user?.id, friends]);
}

export default useMessageNotifications;
