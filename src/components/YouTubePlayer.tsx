import { useEffect, useRef } from 'react';
import { Play } from 'lucide-react';

interface YouTubePlayerProps {
  videoId: string;
  playing: boolean;
  muted: boolean;
  thumbnail: string;
  onClick?: () => void;
}

export default function YouTubePlayer({ videoId, playing, muted, thumbnail, onClick }: YouTubePlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!iframeRef.current) return;
    const src = `https://www.youtube.com/embed/${videoId}?autoplay=${playing ? 1 : 0}&mute=${muted ? 1 : 0}&playsinline=1&rel=0&loop=1&playlist=${videoId}`;
    if (iframeRef.current.src !== src) {
      iframeRef.current.src = src;
    }
  }, [videoId, playing, muted]);

  return (
    <div className="absolute inset-0 w-full h-full bg-black" onClick={onClick}>
      {playing ? (
        <iframe
          ref={iframeRef}
          className="absolute inset-0 w-full h-full"
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${muted ? 1 : 0}&playsinline=1&rel=0&loop=1&playlist=${videoId}`}
          title="YouTube video player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          style={{ border: 'none' }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            src={thumbnail}
            alt="Video thumbnail"
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative z-10 w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Play size={40} className="text-white ml-1" />
          </div>
        </div>
      )}
    </div>
  );
}
