
import { useCallback } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useOfflineQueue, isOnline } from '@/hooks/useOfflineQueue';
import { uploadMediaBlob } from '@/lib/storage';
import { toast } from 'sonner';
import type { Message } from '@/types';

export const useMessageActions = (chatId: string) => {
  const { user: currentUser } = useAuthStore();
  const {
    sendMessage,
    editMessage,
    deleteMessage,
    deleteForEveryone,
    recallMessage,
    addReaction,
  } = useChatStore();
  const { queueMessage } = useOfflineQueue();

  const handleSend = useCallback(async (
    content: string,
    replyingTo: Message | null,
    onSent: () => void
  ) => {
    if (!currentUser) return;

    try {
      if (isOnline()) {
        await sendMessage(
          chatId,
          currentUser.id,
          content,
          'text',
          undefined,
          replyingTo?.id
        );
      } else {
        queueMessage({
          chatId,
          senderId: currentUser.id,
          content,
          type: 'direct',
          replyTo: replyingTo?.id,
        });
        // Optimistically update UI
        useChatStore.getState().addMessage({
          id: `offline_${Date.now()}`,
          chatId,
          senderId: currentUser.id,
          content,
          type: 'text',
          timestamp: new Date(),
          read: false,
          replyTo: replyingTo?.id,
          deliveryStatus: 'failed',
        } as Message);
      }
      onSent();
    } catch {
      toast.error('Failed to send message.');
    }
  }, [chatId, currentUser, sendMessage, queueMessage]);

  const handleMediaUpload = useCallback(async (files: File[]) => {
    if (!currentUser) return;
    for (const file of files) {
      try {
        const url = await uploadMediaBlob(file, {
          userId: currentUser.id,
          kind: 'chats',
          fileName: file.name,
          contentType: file.type,
        });
        const type = file.type.startsWith('image/')
          ? 'image'
          : file.type.startsWith('video/')
          ? 'video'
          : 'file';
        await sendMessage(chatId, currentUser.id, file.name, type, url);
      } catch {
        toast.error(`Failed to upload ${file.name}.`);
      }
    }
  }, [chatId, currentUser, sendMessage]);

  const handleEditSave = useCallback(async (msgId: string, content: string) => {
    if (!content.trim()) return;
    try {
      await editMessage(chatId, msgId, content);
    } catch {
      toast.error('Failed to edit message.');
    }
  }, [chatId, editMessage]);

  const handleDelete = useCallback(async (msgId: string) => {
    try {
      await deleteMessage(chatId, msgId);
    } catch {
      toast.error('Failed to delete message.');
    }
  }, [chatId, deleteMessage]);

  const handleDeleteForEveryone = useCallback(async (msgId: string) => {
    if (!currentUser) return;
    try {
      await deleteForEveryone(chatId, msgId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete for everyone.');
    }
  }, [chatId, currentUser, deleteForEveryone]);

  const handleRecall = useCallback(async (msgId: string) => {
    if (!currentUser) return;
    try {
      await recallMessage(chatId, msgId);
      toast.success('Message recalled.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to recall message.');
    }
  }, [chatId, currentUser, recallMessage]);

  const handleReaction = useCallback(async (
    msgId: string,
    reaction: string
  ) => {
    if (!currentUser) return;
    try {
await addReaction(chatId, msgId, reaction, currentUser.id);
    } catch {
      toast.error('Failed to add reaction.');
    }
  }, [chatId, currentUser, addReaction]);

  return {
    handleSend,
    handleMediaUpload,
    handleEditSave,
    handleDelete,
    handleDeleteForEveryone,
    handleRecall,
    handleReaction,
  };
};