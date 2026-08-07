import { memo } from 'react';
import { Phone, Video, PhoneMissed, PhoneIncoming, PhoneOutgoing, Trash2 } from 'lucide-react';
import { getCallDirection, getOtherParticipantId } from '@/lib/callUtils';
import { formatTime, getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
import type { CallRecord } from '@/types';

interface CallListItemProps {
  call: CallRecord;
  userName: string;
  currentUserId: string | undefined;
  userAvatar?: string;
  onCall: (type: 'voice' | 'video', userId: string) => void;
  onDelete: (callId: string) => void;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${Number(mm)}:${ss}`;
}

const CallListItemComponent = ({ call, userName, currentUserId, userAvatar, onCall, onDelete }: CallListItemProps) => {
  const direction = getCallDirection(call, currentUserId);
  const otherUserId = getOtherParticipantId(call, currentUserId);

  const callIcon = (() => {
    if (call.status === 'missed') return <PhoneMissed size={14} className="text-[#FF3B30]" />;
    if (direction === 'outgoing') return <PhoneOutgoing size={14} className="text-[#00C300]" />;
    return <PhoneIncoming size={14} className="text-[#00C300]" />;
  })();

const getCallLabel = () => {
    const parts: string[] = [];
    if (call.status === 'missed') parts.push('Missed');
    else if (direction === 'outgoing') parts.push('Outgoing');
    else parts.push('Incoming');
    if (call.type === 'group_voice') parts.push('Group Voice');
    else if (call.type === 'group_video') parts.push('Group Video');
    else parts.push(call.type === 'video' ? 'Video' : 'Voice');
    return parts.join(' · ');
  };

  const avatarSrc = sanitizeMediaUrl(userAvatar);
  const fallbackSrc = getDefaultAvatar(otherUserId || userName || 'U');

  const canCall = !!otherUserId;

  const handleVoiceCall = () => {
    if (canCall) onCall('voice', otherUserId);
  };
  const handleVideoCall = () => {
    if (canCall) onCall('video', otherUserId);
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
      <div className="relative w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
        {avatarSrc ? (
          <img src={avatarSrc} alt={userName} className="w-full h-full object-cover" />
        ) : (
          <img src={fallbackSrc} alt={userName} className="w-full h-full object-cover" />
        )}
        <div className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-white flex items-center justify-center shadow-sm">
          {callIcon}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${call.status === 'missed' ? 'text-[#FF3B30]' : 'text-gray-900'}`}>
          {userName}
        </p>
        <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
          {callIcon}
          <span className="truncate">{getCallLabel()}</span>
          {call.duration ? (
            <>
              <span>·</span>
              <span>{formatDuration(call.duration)}</span>
            </>
          ) : null}
          <span>·</span>
          <span>{formatTime(call.timestamp)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" onClick={handleVoiceCall} disabled={!canCall} className="p-2 rounded-full hover:bg-gray-100 text-[#00C300] transition-colors disabled:opacity-40 disabled:cursor-not-allowed" aria-label={`Voice call ${userName}`}>
          <Phone size={18} />
        </button>
        <button type="button" onClick={handleVideoCall} disabled={!canCall} className="p-2 rounded-full hover:bg-gray-100 text-[#00C300] transition-colors disabled:opacity-40 disabled:cursor-not-allowed" aria-label={`Video call ${userName}`}>
          <Video size={18} />
        </button>
        <button type="button" onClick={() => onDelete(call.id)} className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-red-500 transition-colors" aria-label={`Delete call with ${userName}`}>
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
};

export const CallListItem = memo(CallListItemComponent);
