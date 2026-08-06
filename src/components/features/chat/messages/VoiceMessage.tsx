import { memo } from 'react';
import { VoiceWaveform } from '../VoiceWaveform';
import type { Message } from '@/types';

export interface VoiceMessageProps {
  msg: Message;
  isMe: boolean;
}

export const VoiceMessage = memo(function VoiceMessage(props: VoiceMessageProps) {
  const { msg, isMe } = props;

  return (
    <div className={`rounded-2xl mb-1 px-3 py-2 ${isMe ? 'bg-[#00C300]' : 'bg-white'}`}>
      <VoiceWaveform audioUrl={msg.mediaUrl!} isOwnMessage={isMe} />
    </div>
  );
});