import { memo } from 'react';
import { Phone, Video, PhoneMissed, PhoneOutgoing, PhoneIncoming, PhoneCall } from 'lucide-react';
import { useCallContext } from '@/context/CallContextBase';
import type { Message } from '@/types';

export interface CallMessageProps {
  msg: Message;
  isMe: boolean;
  currentUserId: string;
}

/** Format a connected-call duration (seconds) as m:ss or h:mm:ss. */
function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Renders a call event as a first-class chat timeline item.
 *
 * Direction (↗ outgoing / ↙ incoming) is computed from the viewer's id vs the
 * stored callerId, so the same shared row reads correctly for both parties.
 */
export const CallMessage = memo(function CallMessage({ msg, isMe, currentUserId }: CallMessageProps) {
  const callCtx = useCallContext();
  const data = msg.callData;
  const callType = data?.callType ?? 'voice';
  const status = data?.status ?? 'ended';
  const isVideo = callType === 'video';
  const callerId = data?.callerId ?? msg.senderId;
  const outgoing = callerId === currentUserId;

  const isMissed = status === 'missed';
  const isDeclined = status === 'declined';
  const isCancelled = status === 'cancelled';
  const isBusy = status === 'busy';
  const isFailed = status === 'failed';
  const isConnected = status === 'connected';
  const isEnded = status === 'ended';

  const durationLabel = formatDuration(data?.duration);

  let statusLabel = '';
  if (isMissed) statusLabel = 'Missed';
  else if (isDeclined) statusLabel = 'Declined';
  else if (isCancelled) statusLabel = 'Cancelled';
  else if (isBusy) statusLabel = 'Busy';
  else if (isFailed) statusLabel = 'Failed';
  else if (isConnected) statusLabel = 'In progress';
  else if (isEnded) statusLabel = durationLabel || 'Ended';

  const Icon = isMissed ? PhoneMissed : isVideo ? Video : Phone;
  const DirIcon = outgoing ? PhoneOutgoing : PhoneIncoming;
  const negative = isMissed || isDeclined || isFailed;

  const handleCallBack = (e: React.MouseEvent) => {
    e.stopPropagation();
    const peerId = outgoing ? data?.calleeId : data?.callerId;
    if (peerId) void callCtx.startCall({ id: peerId }, isVideo ? 'video' : 'voice');
  };

  return (
    <div
      className={`flex items-center gap-2.5 rounded-2xl px-3 py-2 mb-1 min-w-[190px] max-w-full ${
        isMe ? 'bg-[#00C300]' : 'bg-background border border-border'
      }`}
    >
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
          isMe ? 'bg-white/20' : negative ? 'bg-[#FF3B30]/10' : 'bg-[#00C300]/10'
        }`}
      >
        <Icon
          size={18}
          className={isMe ? 'text-white' : negative ? 'text-[#FF3B30]' : 'text-[#00C300]'}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <DirIcon size={12} className={isMe ? 'text-white/80' : 'text-muted-foreground'} />
          <span className={`text-sm font-semibold truncate ${isMe ? 'text-white' : 'text-foreground'}`}>
            {isVideo ? 'Video call' : 'Voice call'}
          </span>
        </div>
        <span
          className={`text-[11px] ${
            isMe ? 'text-white/80' : negative ? 'text-[#FF3B30]' : 'text-muted-foreground'
          }`}
        >
          {statusLabel}
        </span>
      </div>

      <button
        type="button"
        onClick={handleCallBack}
        className={`p-2 rounded-full transition-colors shrink-0 ${
          isMe ? 'hover:bg-white/15 text-white' : 'hover:bg-black/10 text-[#00C300]'
        }`}
        aria-label="Call back"
      >
        <PhoneCall size={16} />
      </button>
    </div>
  );
});
