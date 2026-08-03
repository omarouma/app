import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react';

interface MediaItem {
  url: string;
  type: 'image' | 'video';
  id: string;
}

interface MediaGalleryProps {
  images: MediaItem[];
  initialIndex: number;
  onClose: () => void;
}

export const MediaGallery = memo(function MediaGallery({ images, initialIndex, onClose }: MediaGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [scale, setScale] = useState(1);
  const [isZoomed, setIsZoomed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const goToRef = useRef<(direction: 'prev' | 'next') => void>(() => {});

  const current = images[currentIndex];

  const goTo = useCallback((direction: 'prev' | 'next') => {
    if (isZoomed) return;
    setCurrentIndex(prev => {
      if (direction === 'prev') return prev > 0 ? prev - 1 : images.length - 1;
      return prev < images.length - 1 ? prev + 1 : 0;
    });
    setScale(1);
    setIsZoomed(false);
  }, [images.length, isZoomed]);

  // Store goTo in ref for keyboard handler
  useEffect(() => {
    goToRef.current = goTo;
  }, [goTo]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goToRef.current?.('prev');
      if (e.key === 'ArrowRight') goToRef.current?.('next');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Swipe handling
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
    setTouchEnd(null);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    setTouchEnd(e.touches[0].clientX);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isSwiped = Math.abs(distance) > 80;
    if (isSwiped) {
      goTo(distance > 0 ? 'next' : 'prev');
    }
    setTouchStart(null);
    setTouchEnd(null);
  }, [touchStart, touchEnd, goTo]);

  const handleDownload = useCallback(async () => {
    try {
      const response = await fetch(current.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gaga-media-${currentIndex + 1}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab
      window.open(current.url, '_blank');
    }
  }, [current, currentIndex]);

  const handleImageClick = useCallback(() => {
    if (scale > 1) {
      setScale(1);
      setIsZoomed(false);
    } else {
      setScale(2);
      setIsZoomed(true);
    }
  }, [scale]);

  if (!images.length) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/95 z-50 flex flex-col"
        onClick={onClose}
      >
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent">
          <button type="button" onClick={onClose} className="p-2 text-white/80 hover:text-white" aria-label="Close gallery">
            <X size={24} />
          </button>
          <span className="text-white/90 text-sm font-medium">
            {currentIndex + 1} / {images.length}
          </span>
          <button type="button" onClick={handleDownload} className="p-2 text-white/80 hover:text-white" aria-label="Download media">
            <Download size={22} />
          </button>
        </div>

        {/* Media content */}
        <div
          ref={containerRef}
          className="flex-1 flex items-center justify-center"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Previous button */}
          {images.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); goTo('prev'); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-10"
              aria-label="Previous"
            >
              <ChevronLeft size={24} />
            </button>
          )}

          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="max-w-full max-h-full p-4"
            style={{
              transform: scale > 1 ? `scale(${scale})` : undefined,
              transition: 'transform 0.3s ease',
            }}
            onClick={handleImageClick}
          >
            {current.type === 'image' ? (
              <img
                src={current.url}
                className="max-w-full max-h-[85vh] object-contain rounded-lg cursor-pointer select-none"
                alt="Gallery media"
                draggable={false}
              />
            ) : (
              <video
                src={current.url}
                className="max-w-full max-h-[85vh] rounded-lg"
                controls
                autoPlay
              />
            )}
          </motion.div>

          {/* Next button */}
          {images.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); goTo('next'); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-10"
              aria-label="Next"
            >
              <ChevronRight size={24} />
            </button>
          )}
        </div>

        {/* Thumbnails strip */}
        {images.length > 1 && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-4 py-3">
            <div className="flex justify-center gap-2 overflow-x-auto scrollbar-hide">
              {images.map((img, i) => (
                <button
                  type="button"
                  key={img.id}
                  onClick={(e) => { e.stopPropagation(); setCurrentIndex(i); }}
                  className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all shrink-0 ${
                    i === currentIndex ? 'border-white opacity-100' : 'border-transparent opacity-50 hover:opacity-80'
                  }`}
                >
                  {img.type === 'video' ? (
                    <div className="w-full h-full bg-[#333] flex items-center justify-center">
                      <span className="text-white text-lg">▶</span>
                    </div>
                  ) : (
                    <img src={img.url} className="w-full h-full object-cover" alt={`Thumbnail ${i + 1}`} />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
});

