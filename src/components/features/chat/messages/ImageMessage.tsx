import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { ImageOff, RefreshCw, Download } from 'lucide-react';
import { sanitizeMediaUrl } from '@/lib/utils';
import { useUserSettings } from '@/store/useSettingsStore';
import type { Message } from '@/types';

export interface ImageMessageProps {
  msg: Message;
  onSetLightbox: (url: string) => void;
}

/** Hard caps for a media bubble so one image can never dominate the screen. */
const MAX_BUBBLE_W = 320;
const MAX_BUBBLE_H = 420;
/** Placeholder height used before the natural dimensions are known. */
const PLACEHOLDER_H = 200;

/**
 * Robust, responsive image message (§46).
 *
 * Sizing follows `bubbleWidth = min(availableWidth × allowedRatio, maxBubbleWidth)`:
 * the natural aspect ratio is preserved, the bubble never exceeds the available
 * chat width, and a max-height cap stops portrait images from taking over the
 * screen. The result is no stretching, no unexpected cropping, no zoomed UI and
 * no horizontal overflow on any device.
 *
 * The <img> is ALWAYS rendered in normal document flow (never `display:none`)
 * so the browser actually fetches it and `onLoad` fires; the skeleton is an
 * absolutely-positioned overlay. A load timeout guarantees the user is never
 * stuck in an indefinite state.
 */
export const ImageMessage = memo(function ImageMessage(props: ImageMessageProps) {
  const { msg, onSetLightbox } = props;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [imgUrl, setImgUrl] = useState(() => sanitizeMediaUrl(msg.mediaUrl) ?? '');
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [availW, setAvailW] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Data-saver: when enabled, images are NOT auto-downloaded. The user taps a
  // lightweight placeholder to fetch the full image on demand.
  const dataSaver = useUserSettings((s) => s.settings.data.dataSaver);
  const [revealed, setRevealed] = useState(false);
  const gated = dataSaver && !revealed;

  const safeUrl = sanitizeMediaUrl(imgUrl);

  // Track the available chat width so the bubble can be sized responsively.
  useEffect(() => {
    const compute = () => {
      const vw = typeof window !== 'undefined' ? window.innerWidth : 360;
      // The bubble is capped at 75% of the chat column; approximate the column
      // as the viewport width (mobile-first) and subtract bubble padding.
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
    setDims(null);
    setRetryKey((key) => key + 1);
  }, [msg.mediaUrl]);

  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    if (el.naturalWidth > 0 && el.naturalHeight > 0) {
      setDims({ w: el.naturalWidth, h: el.naturalHeight });
    }
    setLoaded(true);
  }, []);

  // Compute the responsive bubble box from the natural aspect ratio.
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
      <div className="rounded-2xl mb-1 w-full max-w-full h-40 bg-muted dark:bg-white/5 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
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

  // Data-saver gate: show a tap-to-download placeholder instead of the image.
  if (gated) {
    return (
      <button
        type="button"
        onClick={() => setRevealed(true)}
        className="rounded-2xl mb-1 w-full max-w-full h-40 bg-muted dark:bg-white/5 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground dark:text-white/50 hover:bg-muted dark:hover:bg-white/10 transition-colors"
        aria-label="Tap to download image"
      >
        <Download size={24} className="opacity-70" />
        <span>Tap to download</span>
        <span className="text-[10px] opacity-70">Data saver is on</span>
      </button>
    );
  }

  return (
    <div
      className="relative intro max-w-full group"
      style={{
        width: boxW ? `${boxW}px` : undefined,
        height: boxH ? `${boxH}px` : undefined,
        minHeight: boxH ? undefined : PLACEHOLDER_H,
      }}
    >
      {/* Skeleton overlay — sits ON TOP of the image, never hides it. */}
      {!loaded && (
        <div className="absolute top-0 right-0 bottom-0 left-0 rounded-2xl mb-1 bg-muted dark:bg-white/5 animate-pulse flex items-center justify-center z-[1]">
          <span className="text-xs text-muted-foreground">Loading image…</span>
        </div>
      )}
      <img
        key={retryKey}
        src={safeUrl}
        onClick={() => onSetLightbox(safeUrl)}
        onError={() => setFailed(true)}
        onLoad={handleLoad}
        className={`rounded-2xl mb-1 max-w-full max-h-[420px] object-contain cursor-pointer hover:opacity-95 transition-opacity duration-200 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
        style={boxW && boxH ? { width: `${boxW}px`, height: `${boxH}px` } : undefined}
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
