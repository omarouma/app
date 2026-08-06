import { memo } from 'react';
import type { Message } from '@/types';

export interface VideoMessageProps {
  msg: Message;
}

export const VideoMessage = memo(function VideoMessage(props: VideoMessageProps) {
  const { msg } = props;

  return (
    <video
      src={msg.mediaUrl}
      className="rounded-2xl mb-1 max-w-full"
      controls
      preload="metadata"
    />
  );
});