import { memo, useState } from 'react';
import { sanitizeMediaUrl } from '@/lib/utils';
import type { Message } from '@/types';

export interface ImageMessageProps {
  msg: Message;
  onSetLightbox: (url: string) => void;
}

export const ImageMessage = memo(function ImageMessage(props: ImageMessageProps) {
  const { msg, onSetLightbox } = props;
  const [failed, setFailed] = useState(false);

  const safeUrl = sanitizeMediaUrl(msg.mediaUrl);
  if (!safeUrl || failed) {
    return (
      <div className="rounded-2xl mb-1 w-full max-w-full h-40 bg-[#F5F5F5] flex items-center justify-center text-sm text-[#8D8D8D]">
        Image unavailable
      </div>
    );
  }

  return (
    <img
      src={safeUrl}
      onClick={() => onSetLightbox(safeUrl)}
      onError={() => setFailed(true)}
      className="rounded-2xl mb-1 max-w-full cursor-pointer hover:opacity-95 transition-opacity"
      alt={msg.content || 'Shared image'}
      loading="lazy"
    />
  );
});
