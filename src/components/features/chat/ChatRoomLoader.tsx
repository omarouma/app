import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import ChatRoom from '@/components/features/chat/ChatRoom';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import Logo from '@/components/Logo';

interface ChatRoomLoaderProps {
  userId: string;
}

export default function ChatRoomLoader({ userId }: ChatRoomLoaderProps) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { createDirectChat } = useChatStore();
  const chats = useChatStore((s) => s.chats);

  const isSelfChat = !!user && userId === user.id;

  // Hoist the optional chain so React Compiler can verify memo deps exactly
  const currentUserId = user?.id ?? null;

  const participants = useMemo(() => {
    if (!currentUserId) return [] as string[];
    return [currentUserId, userId].slice().sort((a, b) => a.localeCompare(b));
  }, [currentUserId, userId]);

  const chatId = useMemo(() => {
    if (participants.length !== 2) return '';
    return `dm_${participants.join('_')}`;
  }, [participants]);

  const chatExists = !!chatId && chats.some((c) => c.id === chatId);

  const createAttemptedForRef = useRef<string>('');
  const [createResult, setCreateResult] = useState<'none' | 'ok' | 'error'>('none');

  const canAttemptCreate = !!user && !isSelfChat && participants.length === 2 && !!chatId;

  useEffect(() => {
    if (!canAttemptCreate || chatExists || createAttemptedForRef.current === chatId) return;

    let cancelled = false;
    createAttemptedForRef.current = chatId;

    createDirectChat(userId, user!.id)
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