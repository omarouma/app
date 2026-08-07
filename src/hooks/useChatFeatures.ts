
import { useCallback } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useScheduledMessages } from '@/hooks/useScheduledMessages';
import { toast } from 'sonner';

export const useChatFeatures = (chatId: string) => {
  const { user: currentUser } = useAuthStore();
const { sendPoll, votePoll, sendContactCard, sendMessage } = useChatStore();
  const { schedule, getPending } = useScheduledMessages(chatId, sendMessage);

  const handleSendPoll = useCallback(async (question: string, options: string[]) => {
    if (!currentUser || !question.trim() || options.some(o => !o.trim())) return;
    try {
      await sendPoll(chatId, currentUser.id, question, options);
    } catch {
      toast.error('Failed to send poll.');
    }
  }, [chatId, currentUser, sendPoll]);

  const handleVote = useCallback(async (msgId: string, optionIndex: number) => {
    if (!currentUser) return;
    try {
      await votePoll(chatId, msgId, optionIndex, currentUser.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to vote.');
    }
  }, [chatId, currentUser, votePoll]);

  const handleScheduleSend = useCallback((content: string, scheduleDate: Date) => {
    if (!content.trim() || !scheduleDate) return;
    if (scheduleDate <= new Date()) {
      toast.error('Scheduled time must be in the future.');
      return;
    }
    schedule({
      senderId: currentUser?.id || '',
      content: content.trim(),
      type: 'text',
      scheduledAt: scheduleDate.getTime(),
    });
    toast.success('Message scheduled!');
  }, [currentUser?.id, schedule]);

  const handleSendContact = useCallback(async (contact: {
    userId: string;
    name: string;
    phone?: string;
    email?: string;
    avatar?: string;
    username?: string;
    bio?: string;
  }) => {
    if (!currentUser) return;
    try {
      await sendContactCard(chatId, currentUser.id, contact);
      toast.success('Contact card sent.');
    } catch {
      toast.error('Failed to send contact card.');
    }
  }, [chatId, currentUser, sendContactCard]);

  return {
    handleSendPoll,
    handleVote,
    handleScheduleSend,
    getPending,
    handleSendContact,
  };
};