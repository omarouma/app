import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import ChatRoom from '@/components/features/chat/ChatRoom';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import Logo from '@/components/Logo';

export default function ChatRoomPage() {
  const _params = useParams();
  const userId = (_params as { userId?: string }).userId;
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { createDirectChat } = useChatStore();
  const chats = useChatStore((s) => s.chats);

  const isSelfChat = !!user && !!userId && userId === user.id;

  const userId2 = user?.id;
  const participants = useMemo(() => {
    if (!userId2 || !userId) return [] as string[];
    return [userId2, userId].slice().sort((a, b) => a.localeCompare(b));
  }, [userId2, userId]);

  const chatId = useMemo(() => {
    if (participants.length !== 2) return '';
    return `dm_${participants.join('_')}`;
  }, [participants]);

  const chatExists = !!chatId && chats.some((c) => c.id === chatId);

  const createAttemptedForRef = useRef<string>('');
  const [createResult, setCreateResult] = useState<'none' | 'ok' | 'error'>('none');

  const canAttemptCreate = !!userId && !!user && !isSelfChat && participants.length === 2 && !!chatId;

  // Reset when chatId changes — use useMemo-like pattern to avoid cascading renders
  // const prevChatIdRef = useRef(chatId);
  useEffect(() => {
    createAttemptedForRef.current = '';
    // Instead of calling setState directly, schedule via microtask
    const id = setTimeout(() => {
      setCreateResult('none');
    }, 0);
    return () => clearTimeout(id);
  }, [chatId]);

  // Fire createDirectChat exactly once per chatId when the chat doesn't exist yet
  useEffect(() => {
    if (!canAttemptCreate || chatExists || createAttemptedForRef.current === chatId) return;

    let cancelled = false;
    createAttemptedForRef.current = chatId;

    createDirectChat(userId!, user!.id)
      .then((createdChat) => {
        if (cancelled) return;
        setCreateResult(createdChat ? 'ok' : 'error');
      })
      .catch(() => {
        if (cancelled) return;
        setCreateResult('error');
      });

    return () => { cancelled = true; };
  }, [canAttemptCreate, chatExists, chatId, userId, user, createDirectChat]);

  const loading = canAttemptCreate && !chatExists && createResult !== 'error';
  const error = createResult === 'error';

  if (!userId || !user) {
    return (
      <div className="h-[100dvh] bg-white flex items-center justify-center">
        <p className="text-[#8D8D8D] text-sm">Invalid chat</p>
      </div>
    );
  }

  if (isSelfChat) {
    return (
      <div className="h-[100dvh] bg-white flex flex-col items-center justify-center p-6">
        <p className="text-[#FF3B30] text-sm font-medium mb-2">You cannot chat with yourself</p>
        <p className="text-[#8D8D8D] text-xs text-center mb-4">Please select a different user to start a conversation.</p>
        <button
          type="button"
          onClick={() => navigate('/contacts')}
          className="px-4 py-2 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-medium"
        >
          Pick a contact
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-[100dvh] bg-white flex flex-col items-center justify-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <div className="mx-auto mb-4">
            <Logo size={48} />
          </div>
          <p className="text-[#8D8D8D] text-sm">Starting chat...</p>
        </motion.div>
      </div>
    );
  }

  if (error || !chatId) {
    return (
      <div className="h-[100dvh] bg-white flex flex-col items-center justify-center p-6">
        <p className="text-[#FF3B30] text-sm font-medium mb-2">Could not start chat</p>
        <p className="text-[#8D8D8D] text-xs text-center mb-4">The user may have blocked you or the chat could not be created.</p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="px-4 py-2 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-medium"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-white">
      <ChatRoom chatId={chatId} userId={userId} onBack={() => navigate(-1)} />
    </div>
  );
}
