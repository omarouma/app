import { useState, useEffect } from 'react';
import { isFirestoreAvailable, getDocById, subscribeToDoc } from '@/lib/firestore';
import type { PinnedMessage } from '@/types';

export function useMessagePin(chatId: string | undefined) {
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);

  useEffect(() => {
    if (!chatId || !isFirestoreAvailable()) return;

    const fetchPinned = async () => {
      const data = await getDocById('chats', chatId);
      setPinnedMessages(data?.pinnedMessages || data?.pinned_messages || []);
    };

    fetchPinned();

    const unsubscribe = subscribeToDoc('chats', chatId, (data) => {
      if (!data) return;
      setPinnedMessages(data?.pinnedMessages || data?.pinned_messages || []);
    });

    return () => unsubscribe();
  }, [chatId]);

  return { pinnedMessages };
}
