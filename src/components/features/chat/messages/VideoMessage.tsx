import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { Loader, VideoOff, RefreshCw } from 'lucide-react';
import { sanitizeMediaUrl } from '@/lib/utils';
import type { Message } from '@/types';

export interface VideoMessageProps {
  msg: Message;
}

/**
 * Robust video message.
 *
 * Same fix as ImageMessage: the <video> element is ALWAYS rendered in normal
 * flow (never `display:none`), otherwise the browser never loads metadata and
 * `onLoadedData` never fires, leaving a permanent spinner. The skeleton is an
 * absolute overlay and a timeout prevents an indefinite loading state.
 */
export const VideoMessage = memo(function VideoMessage(props: VideoMessageProps) {
  const { msg } = props;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const safeUrl = sanitizeMediaUrl(msg.mediaUrl);

  useEffect(() => {
    if (loaded || failed || !safeUrl) return;
    timeoutRef.current = setTimeout(() => setFailed(true), 25000);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [loaded, failed, safeUrl, retryKey]);

  const handleRetry = useCallback(() => {
    setFailed(false);
    setLoaded(false);
    setRetryKey((key) => key + 1);
  }, []);

  if (!safeUrl || failed) {
    return (
      <div className="rounded-2xl mb-1 w-full max-w-full h-32 bg-muted dark:bg-white/5 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <VideoOff size={24} className="opacity-70" />
        <span>Video unavailable</span>
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
    <div className="relative max-w-full min-h-[128px]">
      {!loaded && (
        <div className="absolute top-0 right-0 bottom-0 left-0 rounded-2xl mb-1 bg-muted dark:bg-white/5 animate-pulse flex items-center justify-center z-[1]">
          <Loader size={20} className="animate-spin text-muted-foreground" />
        </div>
      )}
      <video
        key={retryKey}
        src={safeUrl}
        className={`rounded-2xl mb-1 max-w-full transition-opacity duration-200 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
        controls
        preload="metadata"
        playsInline
        onLoadedData={() => setLoaded(true)}
        onError={() => setFailed(true)}
        aria-label="Video message"
      />
    </div>
  );
});
