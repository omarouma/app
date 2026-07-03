import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import ChatRoom from '@/components/features/chat/ChatRoom';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { useIsMobile } from '@/hooks/use-mobile';
import Logo from '@/components/Logo';

export default function ChatRoomPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAuthStore();
  const { createDirectChat } = useChatStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Ensure chat exists in the database before rendering
  const isSelfChat = !!user && userId === user.id;

  useEffect(() => {
    if (!userId || !user || isSelfChat) return;
    let cancelled = false;
    createDirectChat(userId, user.id)
      .then(() => {
        if (!cancelled) setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          setError(true);
        }
      });
    return () => { cancelled = true; };
  }, [userId, user, createDirectChat, isSelfChat]);

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
        <button type="button" onClick={() => navigate('/contacts')}
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

  if (error) {
    return (
      <div className="h-[100dvh] bg-white flex flex-col items-center justify-center p-6">
        <p className="text-[#FF3B30] text-sm font-medium mb-2">Could not start chat</p>
        <p className="text-[#8D8D8D] text-xs text-center mb-4">The user may have blocked you or the chat could not be created.</p>
        <button type="button" onClick={() => navigate(-1)}
          className="px-4 py-2 bg-[#F5F5F5] text-[#111111] rounded-xl text-sm font-medium"
        >
          Go Back
        </button>
      </div>
    );
  }

  // Non-mutating sort to avoid side-effects
  const participants = [user.id, userId].slice().sort();
  const chatId = `dm_${participants.join('_')}`;
  return (
    <div className="h-[100dvh] bg-white">
      <ChatRoom chatId={chatId} userId={userId} isMobile={isMobile} onBack={() => navigate(-1)} />
    </div>
  );
}
