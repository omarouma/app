import { useState, useEffect } from 'react';
import { isFirestoreAvailable, subscribeToDoc } from '@/lib/firestore';
import type { PinnedMessage } from '@/types';

export function useMessagePin(chatId: string | undefined) {
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);

  useEffect(() => {
    if (!chatId || !isFirestoreAvailable()) return;

    // The real-time subscription delivers the initial state on first emission,
    // so a separate getDocById fetch is redundant and wastes a read.
    const unsubscribe = subscribeToDoc('chats', chatId, (data) => {
      if (!data) return;
      setPinnedMessages(data?.pinnedMessages || data?.pinned_messages || []);
    });

    return () => unsubscribe();
  }, [chatId]);

  return { pinnedMessages };
}
