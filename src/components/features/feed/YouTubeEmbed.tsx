import { useRef, useEffect, useState } from 'react';
import { Play, Eye } from 'lucide-react';
import { YouTubeModalPlayer } from '@/components/YouTubePlayer';

interface YouTubeEmbedProps {
  videoId: string;
  title?: string;
}

export default function YouTubeEmbed({ videoId, title }: YouTubeEmbedProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

  return (
    <>
      <div
        ref={containerRef}
        className="relative w-full rounded-xl overflow-hidden bg-black aspect-video cursor-pointer group"
        onClick={() => setPlaying(true)}
        role="button"
        tabIndex={0}
        aria-label={`Play ${title || 'video'}`}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPlaying(true); } }}
      >
        {isVisible ? (
          <>
            <img
              src={thumbnailUrl}
              alt={title || 'YouTube thumbnail'}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-red-600/90 flex items-center justify-center shadow-lg group-hover:bg-red-600 group-hover:scale-110 transition-all duration-200">
                <Play size={24} className="text-white fill-white ml-1" />
              </div>
            </div>
          </>
        ) : (
          <div className="w-full h-full bg-[#1a1a1a] animate-pulse flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-[#333] flex items-center justify-center">
              <Play size={20} className="text-[#666] ml-0.5" />
            </div>
          </div>
        )}
      </div>

      {playing && (
        <YouTubeModalPlayer
          videoId={videoId}
          title={title}
          onClose={() => setPlaying(false)}
        />
      )}
    </>
  );
}

// ─── Link preview card used in chat / timeline ────────────────────────────────
interface YouTubeLinkPreviewProps {
  videoId: string;
  title?: string;
  channelTitle?: string;
  viewCount?: string;
  publishedAt?: string;
}

export function YouTubeLinkPreview({ videoId, title, channelTitle, viewCount, publishedAt }: YouTubeLinkPreviewProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // React hooks purity: avoid Date.now() during render
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

  const formatViews = (count?: string) => {
    if (!count) return '';
    const n = parseInt(count, 10);
    if (isNaN(n)) return count;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const diff = now - date.getTime();
    const days = Math.floor(diff / 86400000);
    if (days < 1) return 'Today';
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  };

  return (
    <>
      <div
        ref={containerRef}
        className="rounded-xl overflow-hidden border border-[#EBEBEB] bg-[#F5F5F5] hover:shadow-md transition-shadow cursor-pointer group"
        onClick={() => setPlaying(true)}
        role="button"
        tabIndex={0}
        aria-label={`Play ${title || 'video'}`}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPlaying(true); } }}
      >
        {isVisible ? (
          <div className="relative aspect-video">
            <img
              src={thumbnailUrl}
              alt={title || 'Video'}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-red-600/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-all duration-200">
                <Play size={20} className="text-white fill-white ml-0.5" />
              </div>
            </div>
          </div>
        ) : (
          <div className="aspect-video bg-[#1a1a1a] animate-pulse" />
        )}
        <div className="p-3 space-y-1">
          <p className="text-sm font-medium text-[#111111] line-clamp-2 leading-snug">{title || 'YouTube Video'}</p>
          <div className="flex items-center gap-2 text-[10px] text-[#8D8D8D]">
            <span>{channelTitle || 'YouTube'}</span>
            {viewCount && (
              <>
                <span>•</span>
                <span className="flex items-center gap-0.5">
                  <Eye size={10} /> {formatViews(viewCount)} views
                </span>
              </>
            )}
            {publishedAt && (
              <>
                <span>•</span>
                <span>{formatDate(publishedAt)}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5 pt-0.5">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-[10px] text-[#8D8D8D]">Tap to play</span>
          </div>
        </div>
      </div>

      {playing && (
        <YouTubeModalPlayer
          videoId={videoId}
          title={title}
          channelTitle={channelTitle}
          onClose={() => setPlaying(false)}
        />
      )}
    </>
  );
}
