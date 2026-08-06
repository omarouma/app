
import { useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { useFriendStore } from '@/store/useFriendStore';
import { isFirestoreAvailable, getDocById, COLLECTIONS } from '@/lib/firestore';

export function useChatEffects(
  chatId: string,
  userId: string,
  setInput: (input: string) => void,
  setFriendStatus: (status: string) => void,
  setLastSeen: (lastSeen: string | null) => void,
  setIsChatLocked: (locked: boolean) => void,
  setChatBg: (bg: string) => void
) {
  const { user: currentUser } = useAuthStore();
  const { subscribeMessages, markAsRead, chats } = useChatStore();
  const { getFriendStatus } = useFriendStore();

  useEffect(() => {
    if (!currentUser?.id) return;
    const unsubscribe = subscribeMessages(chatId);
    markAsRead(chatId, currentUser.id);
    return () => unsubscribe();
  }, [chatId, currentUser?.id, subscribeMessages, markAsRead]);

  useEffect(() => {
    if (!currentUser?.id || !userId) return;
    const checkStatus = async () => {
      const status = await getFriendStatus(currentUser.id, userId);
      setFriendStatus(status);
    };
    checkStatus();
  }, [currentUser?.id, userId, getFriendStatus, setFriendStatus]);

  useEffect(() => {
    const draftKey = `draft_${chatId}`;
    const savedDraft = localStorage.getItem(draftKey);
    if (savedDraft) {
      setInput(savedDraft);
    }
    return () => {
      const currentInput = (document.getElementById('chat-input') as HTMLInputElement)?.value;
      if (currentInput) {
        localStorage.setItem(draftKey, currentInput);
      } else {
        localStorage.removeItem(draftKey);
      }
    };
  }, [chatId, setInput]);

  useEffect(() => {
    if (!userId || !isFirestoreAvailable()) return;
    const fetchLastSeen = async () => {
      try {
        const userDoc = await getDocById(COLLECTIONS.USERS, userId);
        if (userDoc) {
          setLastSeen(userDoc.lastSeen?.toDate().toLocaleString() ?? 'online');
        }
      } catch {
        // ignore
      }
    };
    fetchLastSeen();
  }, [userId, setLastSeen]);

  useEffect(() => {
    const chat = chats.find((c) => c.id === chatId);
    if (chat?.chatLocked) {
      setIsChatLocked(true);
    }
  }, [chatId, chats, setIsChatLocked]);

  useEffect(() => {
    const savedBg = localStorage.getItem(`chat_bg_${chatId}`);
    if (savedBg) {
      setChatBg(savedBg);
    }
  }, [chatId, setChatBg]);
}
