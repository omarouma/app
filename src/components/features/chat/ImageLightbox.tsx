import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Share2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/share';

interface ImageLightboxProps {
  url: string | null;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;

/**
 * Full-screen image viewer with pinch/double-tap zoom, pan, download and share.
 * Rendered by ChatRoom whenever `lightboxImage` is set.
 */
export const ImageLightbox = memo(function ImageLightbox({ url, onClose }: ImageLightboxProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [downloading, setDownloading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pinchStartRef = useRef<{ dist: number; scale: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const lastTapRef = useRef(0);

  // Reset transform whenever a new image is opened
  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [url]);

  // Close on Escape
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [url, onClose]);

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  const zoomBy = useCallback((delta: number) => {
    setScale((prev) => {
      const next = clampScale(prev + delta);
      if (next === MIN_SCALE) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const handleDoubleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      setScale((prev) => (prev > 1 ? 1 : 2));
      setOffset({ x: 0, y: 0 });
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchStartRef.current = { dist, scale };
    } else if (e.touches.length === 1 && scale > 1) {
      panStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, ox: offset.x, oy: offset.y };
    }
  }, [scale, offset]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartRef.current) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const ratio = dist / (pinchStartRef.current.dist || 1);
      setScale(clampScale(pinchStartRef.current.scale * ratio));
    } else if (e.touches.length === 1 && panStartRef.current && scale > 1) {
      const dx = e.touches[0].clientX - panStartRef.current.x;
      const dy = e.touches[0].clientY - panStartRef.current.y;
      setOffset({ x: panStartRef.current.ox + dx, y: panStartRef.current.oy + dy });
    }
  }, [scale]);

  const handleTouchEnd = useCallback(() => {
    pinchStartRef.current = null;
    panStartRef.current = null;
  }, []);

  const handleDownload = useCallback(async () => {
    if (!url) return;
    setDownloading(true);
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ext = (blob.type.split('/')[1] || 'jpg').split(';')[0];
      a.href = objectUrl;
      a.download = `gaga-image-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
      toast.success('Image saved');
    } catch {
      // Cross-origin images may block fetch — fall back to opening in a new tab
      window.open(url, '_blank', 'noopener,noreferrer');
      toast.message('Opened image in a new tab');
    } finally {
      setDownloading(false);
    }
  }, [url]);

  const handleShare = useCallback(async () => {
    if (!url) return;
    try {
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({ url });
        return;
      }
      const ok = await copyToClipboard(url);
      if (ok) toast.success('Image link copied');
      else toast.error('Unable to share image');
    } catch {
      /* user cancelled share */
    }
  }, [url]);

  return (
    <AnimatePresence>
      {url && (
        <motion.div
          ref={containerRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed top-0 right-0 bottom-0 left-0 z-[100] bg-black/95 flex flex-col select-none"
          onClick={onClose}
        >
          {/* Top bar */}
          <div
            className="flex items-center justify-between px-4 py-3 text-white shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <X size={22} />
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => zoomBy(-0.5)}
                aria-label="Zoom out"
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <ZoomOut size={20} />
              </button>
              <button
                type="button"
                onClick={() => zoomBy(0.5)}
                aria-label="Zoom in"
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <ZoomIn size={20} />
              </button>
              <button
                type="button"
                onClick={reset}
                aria-label="Reset zoom"
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <RotateCcw size={20} />
              </button>
              <button
                type="button"
                onClick={handleShare}
                aria-label="Share"
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <Share2 size={20} />
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                aria-label="Download"
                className="p-2 rounded-full hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                <Download size={20} />
              </button>
            </div>
          </div>

          {/* Image area */}
          <div
            className="flex-1 flex items-center justify-center overflow-hidden touch-none"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onDoubleClick={handleDoubleTap}
          >
            <img
              src={url}
              alt="Shared image"
              draggable={false}
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                transition: pinchStartRef.current || panStartRef.current ? 'none' : 'transform 0.2s ease-out',
              }}
              className="max-w-full max-h-full object-contain"
            />
          </div>

          {/* Hint */}
          <div className="text-center text-white/50 text-[11px] pb-4 shrink-0">
            Double-tap or pinch to zoom · drag to pan
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
