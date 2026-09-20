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
  const [retryKey, setRetryKey] = useState(0);
  const [imgUrl, setImgUrl] = useState(() => sanitizeMediaUrl(msg.mediaUrl) ?? '');

  const handleRetry = useCallback(() => {
    const refreshed = sanitizeMediaUrl(msg.mediaUrl) ?? '';
    if (!refreshed) return;
    setImgUrl(refreshed);
    setFailed(false);
    setLoaded(false);
    setRetryKey((key) => key + 1);
  }, [msg.mediaUrl]);

  const safeUrl = sanitizeMediaUrl(imgUrl);

  if (!safeUrl || failed) {
    return (
      <div className="rounded-2xl mb-1 w-full max-w-full h-40 bg-secondary flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <span className="text-2xl">🖼️</span>
        <span>Image unavailable</span>
        <button
          type="button"
          onClick={handleRetry}
          className="px-3 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full hover:bg-primary/20 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="relative intro max-w-full group min-h-[160px]">
      {/* Loading skeleton — rendered as an overlay so the <img> stays in the
          layout and can actually load. Previously the img was `hidden`
          (display:none) while `loading="lazy"`, so it never entered the
          viewport and onLoad never fired → stuck on "Loading image...". */}
      {!loaded && (
        <div className="absolute inset-0 rounded-2xl bg-secondary animate-pulse flex items-center justify-center z-10">
          <span className="text-xs text-muted-foreground">Loading image...</span>
        </div>
      )}
      <img
        key={retryKey}
        src={safeUrl}
        onClick={() => onSetLightbox(safeUrl)}
        onError={() => setFailed(true)}
        onLoad={() => setLoaded(true)}
        className={`rounded-2xl mb-1 max-w-full cursor-pointer hover:opacity-95 transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
        alt={msg.content || 'Shared image'}
        loading="lazy"
        decoding="async"
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
