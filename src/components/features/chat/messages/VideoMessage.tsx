import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { Loader, VideoOff, RefreshCw } from 'lucide-react';
import { sanitizeMediaUrl } from '@/lib/utils';
import type { Message } from '@/types';

export interface VideoMessageProps {
  msg: Message;
}

/** Hard caps for a media bubble so one video can never dominate the screen. */
const MAX_BUBBLE_W = 320;
const MAX_BUBBLE_H = 420;
/** Placeholder height used before the natural dimensions are known. */
const PLACEHOLDER_H = 200;

/**
 * Robust, responsive video message (§46).
 *
 * Same responsive sizing contract as ImageMessage: the natural aspect ratio is
 * preserved, the bubble never exceeds the available chat width, and a
 * max-height cap stops portrait videos from taking over the screen — no
 * stretching, cropping, zoomed UI or horizontal overflow.
 *
 * The <video> element is ALWAYS rendered in normal flow (never `display:none`),
 * otherwise the browser never loads metadata and `onLoadedData` never fires,
 * leaving a permanent spinner. The skeleton is an absolute overlay and a
 * timeout prevents an indefinite loading state.
 */
export const VideoMessage = memo(function VideoMessage(props: VideoMessageProps) {
  const { msg } = props;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [availW, setAvailW] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const safeUrl = sanitizeMediaUrl(msg.mediaUrl);

  useEffect(() => {
    const compute = () => {
      const vw = typeof window !== 'undefined' ? window.innerWidth : 360;
      setAvailW(Math.max(160, Math.min(vw * 0.75, MAX_BUBBLE_W) - 8));
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('orientationchange', compute);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('orientationchange', compute);
    };
  }, []);

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
    setDims(null);
    setRetryKey((key) => key + 1);
  }, []);

  const handleLoadedMetadata = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    if (el.videoWidth > 0 && el.videoHeight > 0) {
      setDims({ w: el.videoWidth, h: el.videoHeight });
    }
  }, []);

  let boxW: number | undefined;
  let boxH: number | undefined;
  if (dims && availW > 0) {
    const ratio = dims.w / dims.h;
    const maxW = Math.min(availW, MAX_BUBBLE_W);
    if (ratio >= 1) {
      boxW = Math.round(maxW);
      boxH = Math.round(maxW / ratio);
    } else {
      boxH = Math.min(Math.round(maxW / ratio), MAX_BUBBLE_H);
      boxW = Math.round(boxH * ratio);
    }
  }

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
    <div
      className="relative max-w-full"
      style={{
        width: boxW ? `${boxW}px` : undefined,
        height: boxH ? `${boxH}px` : undefined,
        minHeight: boxH ? undefined : PLACEHOLDER_H,
      }}
    >
      {!loaded && (
        <div className="absolute top-0 right-0 bottom-0 left-0 rounded-2xl mb-1 bg-muted dark:bg-white/5 animate-pulse flex items-center justify-center z-[1]">
          <Loader size={20} className="animate-spin text-muted-foreground" />
        </div>
      )}
      <video
        key={retryKey}
        src={safeUrl}
        className={`rounded-2xl mb-1 max-w-full max-h-[420px] object-contain transition-opacity duration-200 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
        style={boxW && boxH ? { width: `${boxW}px`, height: `${boxH}px` } : undefined}
        controls
        preload="metadata"
        playsInline
        onLoadedMetadata={handleLoadedMetadata}
        onLoadedData={() => setLoaded(true)}
        onError={() => setFailed(true)}
        aria-label="Video message"
      />
    </div>
  );
});
