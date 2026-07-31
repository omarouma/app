import { useRef, useEffect } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { isFirestoreAvailable, updateSubcollectionDoc, COLLECTIONS } from '@/lib/firestore';
import type { Message } from '@/types';

export function useDisappearingTimers(
  chatId: string,
  currentUserId: string | undefined,
  msgs: Message[]
) {
  const scheduledDisappearRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!chatId || !currentUserId || !isFirestoreAvailable() || !msgs.length) return;

    const now = Date.now();

    // Only the recipient triggers the timer
    const candidates = msgs.filter(
      (m) => m.disappearingTimer && m.disappearingTimer > 0 && m.senderId !== currentUserId && !m.destroyed
    );

    // Stamp initiation time per-message (only once, individually)
    for (const m of candidates) {
      if (m.disappearingInitiatedAt) continue;
      updateSubcollectionDoc(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, m.id, {
        disappearingInitiatedAt: new Date().toISOString(),
      }).catch(() => {});
    }

    // Immediately destroy already-expired messages
    for (const m of candidates) {
      if (!m.disappearingInitiatedAt) continue;
      const initiatedMs =
        m.disappearingInitiatedAt instanceof Date
          ? m.disappearingInitiatedAt.getTime()
          : new Date(m.disappearingInitiatedAt as string).getTime();
      if (now < initiatedMs + m.disappearingTimer! * 1000) continue;

      updateSubcollectionDoc(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, m.id, {
        destroyed: true,
        content: 'This message has disappeared',
      }).catch(() => {});

      const tid = scheduledDisappearRef.current.get(m.id);
      if (tid) clearTimeout(tid);
      scheduledDisappearRef.current.delete(m.id);
    }

    // Schedule future expirations — callback reads fresh store state (no stale closure)
    for (const m of candidates) {
      if (!m.disappearingInitiatedAt) continue;
      if (scheduledDisappearRef.current.has(m.id)) continue;

      const initiatedMs =
        m.disappearingInitiatedAt instanceof Date
          ? m.disappearingInitiatedAt.getTime()
          : new Date(m.disappearingInitiatedAt as string).getTime();
      const delayMs = initiatedMs + m.disappearingTimer! * 1000 - now;
      if (delayMs <= 0) continue;

      const msgId = m.id;
      const tid = window.setTimeout(() => {
        const latest = useChatStore.getState().messages[chatId] || [];
        const still = latest.find((mm) => mm.id === msgId);
        if (!still || still.destroyed) {
          scheduledDisappearRef.current.delete(msgId);
          return;
        }
        updateSubcollectionDoc(COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, msgId, {
          destroyed: true,
          content: 'This message has disappeared',
        }).catch(() => {});
        scheduledDisappearRef.current.delete(msgId);
      }, delayMs);

      scheduledDisappearRef.current.set(m.id, tid);
    }

    // Clean up timers for messages no longer in candidate set
    const candidateIds = new Set(candidates.map((m) => m.id));
    for (const [msgId, tid] of Array.from(scheduledDisappearRef.current.entries())) {
      if (!candidateIds.has(msgId)) {
        clearTimeout(tid);
        scheduledDisappearRef.current.delete(msgId);
      }
    }
  }, [msgs, chatId, currentUserId]);

  // Clear all timers when chatId changes or component unmounts
  useEffect(() => {
    const timers = scheduledDisappearRef.current;
    return () => {
      for (const tid of Array.from(timers.values())) clearTimeout(tid);
      timers.clear();
    };
  }, [chatId]);
}
