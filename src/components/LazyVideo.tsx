import { useState, useRef, useEffect } from 'react';

interface LazyVideoProps {
  src: string;
  className?: string;
  controls?: boolean;
  preload?: 'metadata' | 'none' | 'auto';
  threshold?: number;
}

export function LazyVideo({
  src,
  className = '',
  controls = true,
  preload = 'metadata',
  threshold = 0.1,
}: LazyVideoProps) {
  const [inView, setInView] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px', threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`} style={{ minHeight: 100 }}>
      {!inView && (
        <div className="absolute inset-0 bg-[#F5F5F5] animate-pulse flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#00C300] border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {inView && (
        <video
          src={src}
          className={`w-full h-full object-cover transition-opacity duration-300 ${className}`}
          controls={controls}
          preload={preload}
          playsInline
        />
      )}
    </div>
  );
}
