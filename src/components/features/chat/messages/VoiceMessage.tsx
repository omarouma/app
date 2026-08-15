import { memo } from 'react';
import { VoiceWaveform } from '../VoiceWaveform';
import type { Message } from '@/types';
import { sanitizeMediaUrl } from '@/lib/utils';

export interface VoiceMessageProps {
  msg: Message;
  isMe: boolean;
}

export const VoiceMessage = memo(function VoiceMessage(props: VoiceMessageProps) {
  const { msg, isMe } = props;

  const safeUrl = sanitizeMediaUrl(msg.mediaUrl);
  if (!safeUrl) {
    return (
      <div className={`rounded-2xl mb-1 px-3 py-2 ${isMe ? 'bg-[#00C300]' : 'bg-white'}`}>
        <span className={`text-xs ${isMe ? 'text-white/70' : 'text-[#8D8D8D]'}`}>Voice unavailable</span>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl mb-1 px-3 py-2 ${isMe ? 'bg-[#00C300]' : 'bg-white'}`}>
      <VoiceWaveform audioUrl={safeUrl} isOwnMessage={isMe} />
    </div>
  );
});