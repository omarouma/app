import { memo, useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { ReadReceipt } from '../ReadReceipt';
import type { Message, PollOption } from '@/types';

export interface PollMessageProps {
  msg: Message;
  isMe: boolean;
  currentUserId: string;
  chatId: string;
  onVotePoll: (chatId: string, msgId: string, idx: number, userId: string) => void;
}

export const PollMessage = memo(function PollMessage(props: PollMessageProps) {
  const { msg, isMe, currentUserId, chatId, onVotePoll } = props;

  const pollData = msg.pollData;
  const { totalVotes, hasVoted } = useMemo(() => {
    const opts = pollData?.options ?? [];
    let total = 0;
    let voted = false;
    for (const o of opts) {
      const v = (o as PollOption).votes || [];
      total += v.length;
      if (v.includes(currentUserId)) voted = true;
    }
    return { totalVotes: total, hasVoted: voted };
  }, [pollData, currentUserId]);

  const options = pollData?.options ?? [];

  if (!pollData) {
    return (
      <div className={`max-w-[70%]`}>
        <div className={`inline-block px-4 py-3 rounded-2xl ${isMe ? 'bg-[#8B5CF6] text-white rounded-br-none' : 'bg-white text-[#111111] rounded-bl-none'}`}>
          <div className="flex items-center gap-1.5 mb-2">
            <BarChart3 size={14} />
            <span className="text-xs font-medium">Poll</span>
          </div>
          <p className="text-sm opacity-70">Poll unavailable</p>
          <ReadReceipt isMe={isMe} timestamp={msg.timestamp} deliveryStatus={msg.deliveryStatus} edited={msg.edited} />
        </div>
      </div>
    );
  }

  return (
    <div className={`max-w-[70%]`}>
      <div className={`inline-block px-4 py-3 rounded-2xl ${isMe ? 'bg-[#8B5CF6] text-white rounded-br-none' : 'bg-white text-[#111111] rounded-bl-none'}`}>
        <div className="flex items-center gap-1.5 mb-2">
          <BarChart3 size={14} />
          <span className="text-xs font-medium">Poll</span>
        </div>
        <p className="text-sm font-medium mb-2">{pollData.question}</p>
        <div className="space-y-1.5" aria-live="polite">
          {options.map((optRaw, i: number) => {
            const opt = optRaw as unknown as PollOption;
            const votes = opt.votes || [];
            const percent = totalVotes > 0 ? Math.round((votes.length / totalVotes) * 100) : 0;
            const isVoted = votes.includes(currentUserId);
            return (
              <button
                type="button"
                key={i}
                onClick={() => onVotePoll(chatId, msg.id, i, currentUserId)}
                aria-pressed={isVoted}
                className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all relative overflow-hidden ${isVoted
                  ? isMe
                    ? 'bg-white/30 text-white'
                    : 'bg-[#8B5CF6]/10 text-[#8B5CF6]'
                  : isMe
                    ? 'bg-white/10 text-white/90 hover:bg-white/20'
                    : 'bg-[#F5F5F5] text-[#111111] hover:bg-[#EBEBEB]'
                  }`}
              >
                {hasVoted && (
                  <div
                    aria-hidden="true"
                    className={`absolute left-0 top-0 h-full rounded-xl overflow-hidden ${isMe ? 'bg-white/20' : 'bg-[#8B5CF6]/10'}`}
                    style={{ width: `${percent}%` }}
                  />
                )}
                <span className="relative z-10 flex items-center justify-between">
                  <span>{opt.text}</span>
                  {hasVoted && <span className="text-xs opacity-70">{votes.length} ({percent}%)</span>}
                </span>
              </button>
            );
          })}
        </div>
        <ReadReceipt isMe={isMe} timestamp={msg.timestamp} deliveryStatus={msg.deliveryStatus} edited={msg.edited} />
      </div>
    </div>
  );
});