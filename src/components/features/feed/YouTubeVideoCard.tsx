import { useRef, useEffect, useState } from 'react';
import { Play, Clock, Eye } from 'lucide-react';
import type { YouTubeVideo } from '@/services/youtubeService';
import type { PexelsVideo } from '@/services/pexelsService';
import { formatViewCount, formatPublishedAt } from '@/services/youtubeService';

type VideoCardVideo = YouTubeVideo | PexelsVideo;

interface YouTubeVideoCardProps {
  video: VideoCardVideo;
  index: number;
  onPlay: (video: VideoCardVideo) => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function YouTubeVideoCard({ video, index, onPlay }: YouTubeVideoCardProps) {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isYouTube = 'channelTitle' in video;

  // Lazy-load thumbnail with IntersectionObserver
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

  return (
    <div
      ref={containerRef}
      className="bg-[#1a1a1a] rounded-xl overflow-hidden border border-[#2a2a2a] hover:border-[#444] transition-all group cursor-pointer"
      style={{ animationDelay: `${index * 50}ms` }}
      onClick={() => onPlay(video)}
      role="button"
      tabIndex={0}
      aria-label={`Play ${video.title}`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlay(video); } }}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-black overflow-hidden">
        {isVisible ? (
          <>
            <img
              src={video.thumbnail}
              alt={video.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors" />
            {/* Play button */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-xl group-hover:scale-110 transition-all duration-200 ${isYouTube ? 'bg-red-600/90 group-hover:bg-red-600' : 'bg-blue-600/90 group-hover:bg-blue-600'}`}>
                <Play size={24} className="text-white fill-white ml-1" />
              </div>
            </div>
            {/* Duration badge */}
            {('duration' in video) && (
              <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                <Clock size={10} />
                {typeof video.duration === 'number' ? formatDuration(video.duration) : video.duration}
              </div>
            )}
            {/* View count */}
            {('viewCount' in video) && video.viewCount && (
              <div className="absolute bottom-2 left-2 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                <Eye size={10} />
                {formatViewCount(video.viewCount)}
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full bg-[#222] animate-pulse flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-[#333] flex items-center justify-center">
              <Play size={20} className="text-[#666] ml-0.5" />
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5">
        <h3 className="text-sm font-medium text-white line-clamp-2 leading-snug group-hover:text-[#00C300] transition-colors">
          {video.title}
        </h3>
        <div className="flex items-center justify-between text-[#8D8D8D] text-xs">
          <span className="truncate max-w-[60%]">
            {('channelTitle' in video) ? video.channelTitle : (('user' in video) ? video.user.name : 'Unknown')}
          </span>
          {('publishedAt' in video) && <span className="text-[10px] shrink-0">{formatPublishedAt(video.publishedAt)}</span>}
        </div>
        <div className="flex items-center gap-1.5 pt-0.5">
          <div className={`w-2 h-2 rounded-full ${isYouTube ? 'bg-red-500' : 'bg-blue-500'}`} />
          <span className="text-[10px] text-[#8D8D8D]">Tap to play in GaGa Chat</span>
        </div>
      </div>
    </div>
  );
}
