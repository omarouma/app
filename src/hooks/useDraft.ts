import { useEffect } from 'react';
import { safeGetStorageItem, safeSetStorageItem, safeRemoveStorageItem } from '@/lib/safeStorage';

export function useDraft(chatId: string, input: string, setInput: (v: string) => void) {
  useEffect(() => {
    setInput(safeGetStorageItem(`chat_draft_${chatId}`) || '');
  // setInput is stable (useState setter) — safe to omit
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  useEffect(() => {
    if (input.trim()) {
      safeSetStorageItem(`chat_draft_${chatId}`, input);
    } else {
      safeRemoveStorageItem(`chat_draft_${chatId}`);
    }
  }, [input, chatId]);
}
