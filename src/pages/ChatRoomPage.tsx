import { useParams } from 'react-router-dom';
import ChatRoomLoader from '@/components/features/chat/ChatRoomLoader';

export default function ChatRoomPage() {
  const { userId } = useParams<{ userId: string }>();

  if (!userId) {
    return (
      <div className="h-[100dvh] bg-white flex items-center justify-center">
        <p className="text-[#8D8D8D] text-sm">Invalid chat</p>
      </div>
    );
  }

  return <ChatRoomLoader userId={userId} />;
}