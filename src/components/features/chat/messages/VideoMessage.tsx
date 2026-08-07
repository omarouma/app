import { memo } from 'react';
import { sanitizeMediaUrl } from '@/lib/utils';
import type { Message } from '@/types';

export interface VideoMessageProps {
  msg: Message;
}

export const VideoMessage = memo(function VideoMessage(props: VideoMessageProps) {
  const { msg } = props;

  const safeUrl = sanitizeMediaUrl(msg.mediaUrl);
  if (!safeUrl) {
    return (
      <div className="rounded-2xl mb-1 w-full max-w-full h-32 bg-[#F5F5F5] flex items-center justify-center text-sm text-[#8D8D8D]">
        Video unavailable
      </div>
    );
  }

  return (
    <video
      src={safeUrl}
      className="rounded-2xl mb-1 max-w-full"
      controls
      preload="metadata"
      aria-label="Video message"
    />
  );
});
