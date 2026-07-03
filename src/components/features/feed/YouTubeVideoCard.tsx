import { useState, useRef, useEffect } from 'react';
import { Play, ExternalLink, Clock, Eye } from 'lucide-react';
import type { YouTubeVideo } from '@/services/youtubeService';
import { formatViewCount, formatPublishedAt } from '@/services/youtubeService';

interface YouTubeVideoCardProps {
  video: YouTubeVideo;
  index: number;
}

export default function YouTubeVideoCard({ video, index }: YouTubeVideoCardProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Lazy load with Intersection Observer
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
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const videoUrl = `https://www.youtube.com/watch?v=${video.id}`;
  const embedUrl = `https://www.youtube.com/embed/${video.id}?autoplay=1&rel=0&modestbranding=1`;

  return (
    <div
      ref={containerRef}
      className="bg-[#1a1a1a] rounded-xl overflow-hidden border border-[#2a2a2a] hover:border-[#333] transition-all group"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Video thumbnail / player */}
      <div className="relative aspect-video bg-black">
        {isVisible ? (
          showPlayer ? (
            <iframe
              src={embedUrl}
              title={video.title}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowPlayer(true)}
              className="relative w-full h-full group/thumb"
            >
              <img
                src={video.thumbnail}
                alt={video.title}
                className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-500"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`;
                }}
              />
              <div className="absolute inset-0 bg-black/30 group-hover/thumb:bg-black/10 transition-colors" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-red-600/90 flex items-center justify-center shadow-xl group-hover/thumb:scale-110 group-hover/thumb:bg-red-600 transition-all duration-200">
                  <Play size={24} className="text-white fill-white ml-1" />
                </div>
              </div>
              {/* Duration badge if available */}
              {video.duration && (
                <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                  <Clock size={10} />
                  {video.duration}
                </div>
              )}
              {/* View count overlay */}
              {video.viewCount && (
                <div className="absolute bottom-2 left-2 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                  <Eye size={10} />
                  {formatViewCount(video.viewCount)}
                </div>
              )}
            </button>
          )
        ) : (
          <div className="w-full h-full bg-[#222] animate-pulse flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-[#333] flex items-center justify-center">
              <Play size={20} className="text-[#666] ml-0.5" />
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <h3 className="text-sm font-medium text-white line-clamp-2 leading-snug group-hover:text-[#00C300] transition-colors">
          {video.title}
        </h3>
        <div className="flex items-center justify-between text-[#8D8D8D] text-xs">
          <span className="truncate max-w-[60%]">{video.channelTitle}</span>
          <span className="text-[10px] shrink-0">{formatPublishedAt(video.publishedAt)}</span>
        </div>
        <button
          type="button"
          onClick={() => window.open(videoUrl, '_blank')}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#2a2a2a] text-[#8D8D8D] text-xs font-medium hover:bg-[#333] hover:text-white transition-colors"
        >
          <ExternalLink size={12} />
          Open on YouTube
        </button>
      </div>
    </div>
  );
}
