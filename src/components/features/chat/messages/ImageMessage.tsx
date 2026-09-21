import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { ImageOff, RefreshCw } from 'lucide-react';
import { sanitizeMediaUrl } from '@/lib/utils';
import type { Message } from '@/types';

export interface ImageMessageProps {
  msg: Message;
  onSetLightbox: (url: string) => void;
}

/**
 * Robust image message.
 *
 * IMPORTANT: the <img> is ALWAYS rendered in normal document flow (never
 * `display:none`). Previously the element was hidden with `hidden` +
 * `loading="lazy"`, which meant the browser never fetched it, `onLoad` never
 * fired, and the "Loading image..." skeleton stayed on screen forever.
 *
 * The skeleton is now an absolutely-positioned overlay on top of the image,
 * so the image is always visible to the browser and can actually load.
 * A load timeout guarantees the user is never stuck in an indefinite state.
 */
export const ImageMessage = memo(function ImageMessage(props: ImageMessageProps) {
  const { msg, onSetLightbox } = props;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [imgUrl, setImgUrl] = useState(() => sanitizeMediaUrl(msg.mediaUrl) ?? '');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const safeUrl = sanitizeMediaUrl(imgUrl);

  // Never leave the user stuck: if the image has not loaded within 20s, treat
  // it as failed and offer a retry.
  useEffect(() => {
    if (loaded || failed || !safeUrl) return;
    timeoutRef.current = setTimeout(() => {
      setFailed(true);
    }, 20000);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [loaded, failed, safeUrl, retryKey]);

  const handleRetry = useCallback(() => {
    const refreshed = sanitizeMediaUrl(msg.mediaUrl) ?? '';
    if (!refreshed) return;
    setImgUrl(refreshed);
    setFailed(false);
    setLoaded(false);
    setRetryKey((key) => key + 1);
  }, [msg.mediaUrl]);

  if (!safeUrl || failed) {
    return (
      <div className="rounded-2xl mb-1 w-full max-w-full h-40 bg-[#F5F5F5] dark:bg-white/5 flex flex-col items-center justify-center gap-2 text-sm text-[#8D8D8D]">
        <ImageOff size={26} className="opacity-70" />
        <span>Image unavailable</span>
        <button
          type="button"
          onClick={handleRetry}
          className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#00C300]/10 text-[#00C300] text-xs font-medium rounded-full hover:bg-[#00C300]/20 transition-colors"
        >
          <RefreshCw size={12} />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="relative intro max-w-full group min-h-[160px]">
      {/* Skeleton overlay — sits ON TOP of the image, never hides it. */}
      {!loaded && (
        <div className="absolute inset-0 rounded-2xl mb-1 bg-[#F5F5F5] dark:bg-white/5 animate-pulse flex items-center justify-center z-[1]">
          <span className="text-xs text-[#8D8D8D]">Loading image…</span>
        </div>
      )}
      <img
        key={retryKey}
        src={safeUrl}
        onClick={() => onSetLightbox(safeUrl)}
        onError={() => setFailed(true)}
        onLoad={() => setLoaded(true)}
        className={`rounded-2xl mb-1 max-w-full cursor-pointer hover:opacity-95 transition-opacity duration-200 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
        alt={msg.content || 'Shared image'}
        decoding="async"
      />
      {loaded && (
        <span className="absolute bottom-2 right-2 bg-black/50 text-white text-[9px] px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          Tap to view
        </span>
      )}
    </div>
  );
});
