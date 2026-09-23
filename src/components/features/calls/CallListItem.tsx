import { memo } from 'react';
import { Phone, Video, PhoneMissed, PhoneIncoming, PhoneOutgoing, Trash2 } from 'lucide-react';
import { getCallDirection, getOtherParticipantId, isGroupCall, isVideoCallType, getCallStatusLabel } from '@/lib/callUtils';
import { getDefaultAvatar, sanitizeMediaUrl } from '@/lib/utils';
import type { CallRecord } from '@/types';

interface CallListItemProps {
  call: CallRecord;
  userName: string;
  userAvatar?: string;
  currentUserId: string | undefined;
  onCall: (type: 'voice' | 'video', userId: string) => void;
  onDelete: (callId: string) => void;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const CallListItemComponent = ({ call, userName, userAvatar, currentUserId, onCall, onDelete }: CallListItemProps) => {
  const direction = getCallDirection(call, currentUserId);
  const otherUserId = getOtherParticipantId(call, currentUserId);

  const isOutgoing = direction === 'outgoing';
  const isGroup = isGroupCall(call);
  const isVideoType = isVideoCallType(call.type);

  const statusLabel = getCallStatusLabel(call, currentUserId);
  const isNegative = statusLabel === 'Missed' || statusLabel === 'Declined' || statusLabel === 'Cancelled';
  const CallIcon = statusLabel === 'Missed'
    ? PhoneMissed
    : isOutgoing
      ? PhoneOutgoing
      : PhoneIncoming;
  const iconColor = isNegative ? 'text-red-500' : 'text-[#00C300]';
  const label = statusLabel;
  const labelColor = isNegative ? 'text-red-500' : 'text-muted-foreground';
  const typeLabel = isGroup ? (isVideoType ? 'Group Video' : 'Group Voice') : isVideoType ? 'Video' : 'Voice';

  const avatarSrc = sanitizeMediaUrl(userAvatar);
  const duration = formatDuration(call.duration);
  const targetUserId = otherUserId || currentUserId;

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted active:bg-muted transition-colors">
      {/* Avatar */}
      <div className="w-11 h-11 rounded-full bg-muted overflow-hidden shrink-0">
        <img
          src={avatarSrc || getDefaultAvatar(otherUserId || userName || 'U')}
          className="w-full h-full object-cover"
          alt={userName}
          loading="lazy"
          decoding="async"
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${isNegative ? 'text-red-500' : 'text-foreground'}`}>
          {userName}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <CallIcon size={13} className={iconColor} />
          <span className={`text-xs ${labelColor}`}>{label}</span>
          <span className="text-muted-foreground text-xs">·</span>
          <span className="text-xs text-muted-foreground">{typeLabel}</span>
          {duration && (
            <>
              <span className="text-muted-foreground text-xs">·</span>
              <span className="text-xs text-muted-foreground">{duration}</span>
            </>
          )}
          <span className="text-muted-foreground text-xs">·</span>
          <span className="text-xs text-muted-foreground">{formatRelativeTime(call.timestamp)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          disabled={!targetUserId}
          onClick={() => targetUserId && onCall('voice', targetUserId)}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#00C300]/10 text-[#00C300] active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={`Voice call ${userName}`}
        >
          <Phone size={18} />
        </button>
        <button
          type="button"
          disabled={!targetUserId}
          onClick={() => targetUserId && onCall('video', targetUserId)}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#00C300]/10 text-[#00C300] active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={`Video call ${userName}`}
        >
          <Video size={18} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(call.id)}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-red-50 text-muted-foreground hover:text-red-500 active:scale-95 transition-all"
          aria-label="Delete call record"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
};

export const CallListItem = memo(CallListItemComponent);
