import { useState, useRef, useEffect } from 'react';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  onClick?: () => void;
  placeholder?: string;
  threshold?: number;
}

export function LazyImage({
  src,
  alt,
  className = '',
  onClick,
  placeholder,
  threshold = 0.1,
}: LazyImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const el = imgRef.current;
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
    <div ref={imgRef} className={`relative overflow-hidden ${className}`} style={{ minHeight: 100 }}>
      {!inView && (
        <div className="absolute inset-0 bg-[#F5F5F5] animate-pulse flex items-center justify-center">
          {placeholder ? (
            <span className="text-[#8D8D8D] text-xs">{placeholder}</span>
          ) : (
            <div className="w-8 h-8 border-2 border-[#00C300] border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      )}
      {inView && (
        <>
          {!loaded && (
            <div className="absolute inset-0 bg-[#F5F5F5] animate-pulse" />
          )}
          <img
            src={src}
            alt={alt}
            className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'} ${onClick ? 'cursor-pointer' : ''}`}
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
            onClick={onClick}
            loading="lazy"
          />
        </>
      )}
    </div>
  );
}
