import { memo } from 'react';
import type { Message } from '@/types';

export interface ImageMessageProps {
  msg: Message;
  onSetLightbox: (url: string) => void;
}

export const ImageMessage = memo(function ImageMessage(props: ImageMessageProps) {
  const { msg, onSetLightbox } = props;

  return (
    <img
      src={msg.mediaUrl}
      onClick={() => onSetLightbox(msg.mediaUrl!)}
      className="rounded-2xl mb-1 max-w-full cursor-pointer hover:opacity-95 transition-opacity"
      alt="Shared image"
      loading="lazy"
    />
  );
});