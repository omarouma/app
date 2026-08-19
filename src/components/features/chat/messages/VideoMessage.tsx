import { memo, useState, useCallback } from 'react';
import { Loader } from 'lucide-react';
import { sanitizeMediaUrl } from '@/lib/utils';
import type { Message } from '@/types';

export interface VideoMessageProps {
  msg: Message;
}

export const VideoMessage = memo(function VideoMessage(props: VideoMessageProps) {
  const { msg } = props;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const safeUrl = sanitizeMediaUrl(msg.mediaUrl);

  const handleRetry = useCallback(() => {
    setFailed(false);
    setLoaded(false);
    setRetryKey((key) => key + 1);
  }, []);

  if (!safeUrl || failed) {
    return (
      <div className="rounded-2xl mb-1 w-full max-w-full h-32 bg-[#F5F5F5] flex flex-col items-center justify-center gap-2 text-sm text-[#8D8D8D]">
        <span className="text-2xl">🎬</span>
        <span>Video unavailable</span>
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
    <div className="relative max-w-full">
      {!loaded && (
        <div className="rounded-2xl mb-1 h-32 bg-[#F5F5F5] animate-pulse flex items-center justify-center">
          <Loader size={20} className="animate-spin text-[#8D8D8D]" />
        </div>
      )}
      <video
        key={retryKey}
        src={safeUrl}
        className={`rounded-2xl mb-1 max-w-full ${loaded ? 'block' : 'hidden'}`}
        controls
        preload="metadata"
        onLoadedData={() => setLoaded(true)}
        onError={() => setFailed(true)}
        aria-label="Video message"
      />
    </div>
  );
});