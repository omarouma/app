import { memo, useState, useCallback } from 'react';
import { sanitizeMediaUrl } from '@/lib/utils';
import type { Message } from '@/types';

export interface ImageMessageProps {
  msg: Message;
  onSetLightbox: (url: string) => void;
}

export const ImageMessage = memo(function ImageMessage(props: ImageMessageProps) {
  const { msg, onSetLightbox } = props;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [imgUrl, setImgUrl] = useState(() => sanitizeMediaUrl(msg.mediaUrl) ?? '');

  const handleRetry = useCallback(() => {
    const refreshed = sanitizeMediaUrl(msg.mediaUrl) ?? '';
    if (!refreshed) return;
    setImgUrl(refreshed);
    setFailed(false);
    setLoaded(false);
  }, [msg.mediaUrl]);

  const safeUrl = sanitizeMediaUrl(imgUrl);

  if (!safeUrl || failed) {
    return (
      <div className="rounded-2xl mb-1 w-full max-w-full h-40 bg-[#F5F5F5] flex flex-col items-center justify-center gap-2 text-sm text-[#8D8D8D]">
        <span className="text-2xl">🖼️</span>
        <span>Image unavailable</span>
        <button
          type="button"
          onClick={handleRetry}
          className="px-3 py-1 bg-[#00C300]/10 text-[#00C300] text-xs font-medium rounded-full hover:bg-[#00C300]/20 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="relative intro max-w-full">
      {/* Loading skeleton overlay */}
      {!loaded && (
        <div className="rounded-2xl mb-1 h-40 bg-[#F5F5F5] animate-pulse flex items-center justify-center">
          <span className="text-xs text-[#8D8D8D]">Loading image...</span>
        </div>
      )}
      <img
        src={safeUrl}
        onClick={() => onSetLightbox(safeUrl)}
        onError={() => setFailed(true)}
        onLoad={() => setLoaded(true)}
        className={`rounded-2xl mb-1 max-w-full cursor-pointer hover:opacity-95 transition-opacity ${loaded ? 'block' : 'hidden'}`}
        alt={msg.content || 'Shared image'}
        loading="lazy"
      />
      {/* Double-tap zoom hint */}
      {loaded && (
        <span className="absolute bottom-2 right-2 bg-black/50 text-white text-[9px] px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          Tap to view
        </span>
      )}
    </div>
  );
});