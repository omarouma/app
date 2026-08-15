import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import ChatRoomLoader from '@/components/features/chat/ChatRoomLoader';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

export default function ChatRoomPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const normalizedUserId = userId?.trim();
  const [retryKey, setRetryKey] = useState(0);

  if (!normalizedUserId) {
    return (
      <div className="h-dvh bg-white flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-sm text-center"
        >
          <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
            <ArrowLeft size={20} className="text-gray-400" />
          </div>
          <p className="text-base font-medium text-gray-900">This chat is unavailable</p>
          <p className="mt-2 text-sm text-gray-500">
            The requested conversation could not be loaded. Please go back and try again.
          </p>
          <button
            type="button"
            onClick={() => navigate('/chats')}
            className="mt-4 px-4 py-2 bg-[#00C300] text-white rounded-xl text-sm font-medium hover:bg-[#00A800] transition-colors"
          >
            Go to Chats
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      key={`${normalizedUserId}-${retryKey}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="h-dvh"
    >
      <ChatRoomLoader
        userId={normalizedUserId}
        onRetry={() => setRetryKey(k => k + 1)}
      />
    </motion.div>
  );
}