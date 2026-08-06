import { memo } from 'react';
import { Phone, Video, PhoneMissed, PhoneIncoming, PhoneOutgoing, Trash2 } from 'lucide-react';
import { getCallDirection, getOtherParticipantId } from '@/lib/callUtils';
import type { CallRecord } from '@/types';

interface CallListItemProps {
  call: CallRecord;
  userName: string;
  currentUserId: string | undefined;
  onCall: (type: 'voice' | 'video', userId: string) => void;
  onDelete: (callId: string) => void;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const CallListItemComponent = ({ call, userName, currentUserId, onCall, onDelete }: CallListItemProps) => {
  const direction = getCallDirection(call, currentUserId);
  const otherUserId = getOtherParticipantId(call, currentUserId);

  const getCallIcon = () => {
    if (call.status === 'missed') return <PhoneMissed size={18} className="text-red-500" />;
    if (direction === 'outgoing') return <PhoneOutgoing size={18} className="text-green-500" />;
    return <PhoneIncoming size={18} className="text-green-500" />;
  };

  const getCallLabel = () => {
    if (call.status === 'missed') return 'Missed';
    if (direction === 'outgoing') return 'Outgoing';
    return 'Incoming';
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800 transition-colors">
      <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center">
        {getCallIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{userName}</p>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          {getCallLabel()}
          <span>·</span>
          <span>{formatDuration(call.duration)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onCall('voice', otherUserId)} className="p-2 rounded-full hover:bg-gray-800 text-green-500">
          <Phone size={18} />
        </button>
        <button type="button" onClick={() => onCall('video', otherUserId)} className="p-2 rounded-full hover:bg-gray-800 text-green-500">
          <Video size={18} />
        </button>
        <button type="button" onClick={() => onDelete(call.id)} className="p-2 rounded-full hover:bg-gray-800 text-red-500">
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
};

export const CallListItem = memo(CallListItemComponent);