import { useParams } from 'react-router-dom';
import ChatRoomLoader from '@/components/features/chat/ChatRoomLoader';

export default function ChatRoomPage() {
  const { userId } = useParams<{ userId: string }>();
  const normalizedUserId = userId?.trim();

  if (!normalizedUserId) {
    return (
      <div className="h-dvh bg-white flex items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-gray-100" />
          <p className="text-base font-medium text-gray-900">This chat is unavailable</p>
          <p className="mt-2 text-sm text-gray-500">The requested conversation could not be loaded. Please go back and try again.</p>
        </div>
      </div>
    );
  }

  return <ChatRoomLoader userId={normalizedUserId} />;
}