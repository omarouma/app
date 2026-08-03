import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, X, SkipBack, SkipForward, Minimize2 } from 'lucide-react';
import type { PexelsVideo } from '@/services/pexelsService';

interface YouTubePlayerProps {
  videoId: string;
  playing: boolean;
  muted: boolean;
  thumbnail: string;
  title?: string;
  onClick?: () => void;
}

export default function YouTubePlayer({ videoId, thumbnail, title, onClick }: YouTubePlayerProps) {
  const [started, setStarted] = useState(false);

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    setStarted(true);
    onClick?.();
  };

  if (!started) {
    return (
      <div className="absolute inset-0 w-full h-full bg-black cursor-pointer" onClick={handlePlay}>
        <img
          src={thumbnail}
          alt={title || 'Video thumbnail'}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
          }}
        />
        <div className="absolute inset-0 bg-black/30" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors">
            <Play size={40} className="text-white ml-1" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 w-full h-full bg-black">
      <iframe
        src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
        title={title || 'YouTube video'}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 w-full h-full"
      />
    </div>
  );
}

// ─── Inline embed used directly in feed cards ────────────────────────────────
interface InlineEmbedProps {
  videoId: string;
  title?: string;
  thumbnail: string;
  autoplay?: boolean;
}

export function InlineYouTubeEmbed({ videoId, title, thumbnail, autoplay = false }: InlineEmbedProps) {
  const [started, setStarted] = useState(autoplay);

  if (!started) {
    return (
      <div
        className="relative w-full h-full bg-black cursor-pointer group"
        onClick={() => setStarted(true)}
        role="button"
        tabIndex={0}
        aria-label={`Play ${title || 'video'}`}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setStarted(true); } }}
      >
        <img
          src={thumbnail}
          alt={title || 'Video thumbnail'}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
          }}
        />
        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-red-600/90 flex items-center justify-center shadow-xl group-hover:scale-110 group-hover:bg-red-600 transition-all duration-200">
            <Play size={24} className="text-white fill-white ml-1" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <iframe
      src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
      title={title || 'YouTube video'}
      allow="autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
      className="absolute inset-0 w-full h-full"
    />
  );
}

// ─── Full-screen modal player ─────────────────────────────────────────────────
interface ModalPlayerProps {
  videoId: string;
  title?: string;
  channelTitle?: string;
  onClose: () => void;
  playlist?: string[]; // optional list of videoIds for prev/next
  playlistIndex?: number;
  onNavigate?: (index: number) => void;
}

export function YouTubeModalPlayer({ videoId, title, channelTitle, onClose, playlist, playlistIndex = 0, onNavigate }: ModalPlayerProps) {
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pip, setPip] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const hasPrev = playlist && playlistIndex > 0;
  const hasNext = playlist && playlistIndex < playlist.length - 1;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onNavigate?.(playlistIndex - 1);
      if (e.key === 'ArrowRight' && hasNext) onNavigate?.(playlistIndex + 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, hasPrev, hasNext, onNavigate, playlistIndex]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement && containerRef.current) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  // Sync fullscreen state on external exit
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const embedSrc = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1${muted ? '&mute=1' : ''}`;

  if (pip) {
    return (
      <div className="fixed bottom-20 right-4 z-50 w-64 rounded-xl overflow-hidden shadow-2xl bg-black border border-white/10">
        <div className="relative aspect-video">
          <iframe
            key={`${videoId}-pip-${muted}`}
            src={embedSrc}
            title={title || 'YouTube video'}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          />
        </div>
        <div className="flex items-center justify-between px-2 py-1.5 bg-[#111]">
          <p className="text-white text-[10px] truncate flex-1 mr-2">{title || 'YouTube'}</p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPip(false)} className="text-white/70 hover:text-white p-1" aria-label="Expand">
              <Maximize2 size={12} />
            </button>
            <button type="button" onClick={onClose} className="text-white/70 hover:text-white p-1" aria-label="Close">
              <X size={12} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        className="relative w-full max-w-5xl mx-4 rounded-2xl overflow-hidden bg-black shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex-1 min-w-0 mr-4">
            {title && <p className="text-white font-semibold text-sm truncate">{title}</p>}
            {channelTitle && <p className="text-white/60 text-xs">{channelTitle}</p>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasPrev && (
              <button type="button" onClick={() => onNavigate?.(playlistIndex - 1)}
                className="rounded-full bg-black/60 p-2 text-white hover:bg-black/80 transition-colors" aria-label="Previous">
                <SkipBack size={14} />
              </button>
            )}
            {hasNext && (
              <button type="button" onClick={() => onNavigate?.(playlistIndex + 1)}
                className="rounded-full bg-black/60 p-2 text-white hover:bg-black/80 transition-colors" aria-label="Next">
                <SkipForward size={14} />
              </button>
            )}
            <button type="button" onClick={() => setMuted(!muted)}
              className="rounded-full bg-black/60 p-2 text-white hover:bg-black/80 transition-colors" aria-label={muted ? 'Unmute' : 'Mute'}>
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <button type="button" onClick={() => setPip(true)}
              className="rounded-full bg-black/60 p-2 text-white hover:bg-black/80 transition-colors" aria-label="Picture-in-picture">
              <Minimize2 size={14} />
            </button>
            <button type="button" onClick={toggleFullscreen}
              className="rounded-full bg-black/60 p-2 text-white hover:bg-black/80 transition-colors" aria-label="Toggle fullscreen">
              {isFullscreen ? <Pause size={14} /> : <Maximize2 size={14} />}
            </button>
            <button type="button" onClick={onClose}
              className="rounded-full bg-black/60 p-2 text-white hover:bg-red-600 transition-colors" aria-label="Close">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Player */}
        <div className="relative aspect-video bg-black">
          <iframe
            key={`${videoId}-${muted}`}
            src={embedSrc}
            title={title || 'YouTube video'}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Pexels Full-screen modal player ────────────────────────────────────────────
interface PexelsModalPlayerProps {
  video: PexelsVideo;
  onClose: () => void;
}

export function PexelsModalPlayer({ video, onClose }: PexelsModalPlayerProps) {
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [pip, setPip] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === ' ') {
        e.preventDefault();
        if (!videoRef.current) return;
        if (videoRef.current.paused) { void videoRef.current.play(); }
        else { videoRef.current.pause(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement && containerRef.current) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  if (pip) {
    return (
      <div className="fixed bottom-20 right-4 z-50 w-64 rounded-xl overflow-hidden shadow-2xl bg-black border border-white/10">
        <video ref={videoRef} src={video.url} autoPlay playsInline muted={muted} loop
          className="w-full aspect-video object-cover" />
        <div className="flex items-center justify-between px-2 py-1.5 bg-[#111]">
          <p className="text-white text-[10px] truncate flex-1 mr-2">{video.title || 'Video'}</p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPip(false)} className="text-white/70 hover:text-white p-1"><Maximize2 size={12} /></button>
            <button type="button" onClick={onClose} className="text-white/70 hover:text-white p-1"><X size={12} /></button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95" onClick={onClose}>
      <div ref={containerRef}
        className="relative w-full max-w-5xl mx-4 rounded-2xl overflow-hidden bg-black shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex-1 min-w-0 mr-4">
            {video.title && <p className="text-white font-semibold text-sm truncate">{video.title}</p>}
            {video.user.name && <p className="text-white/60 text-xs">{video.user.name}</p>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" onClick={() => { setMuted(!muted); if (videoRef.current) videoRef.current.muted = !muted; }}
              className="rounded-full bg-black/60 p-2 text-white hover:bg-black/80 transition-colors" aria-label={muted ? 'Unmute' : 'Mute'}>
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <button type="button" onClick={() => { if (videoRef.current) { if (videoRef.current.paused) { videoRef.current.play(); setPlaying(true); } else { videoRef.current.pause(); setPlaying(false); } } }}
              className="rounded-full bg-black/60 p-2 text-white hover:bg-black/80 transition-colors" aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button type="button" onClick={() => setPip(true)}
              className="rounded-full bg-black/60 p-2 text-white hover:bg-black/80 transition-colors" aria-label="Picture-in-picture">
              <Minimize2 size={14} />
            </button>
            <button type="button" onClick={toggleFullscreen}
              className="rounded-full bg-black/60 p-2 text-white hover:bg-black/80 transition-colors" aria-label="Toggle fullscreen">
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button type="button" onClick={onClose}
              className="rounded-full bg-black/60 p-2 text-white hover:bg-red-600 transition-colors" aria-label="Close">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Player */}
        <div className="relative aspect-video bg-black">
          <video ref={videoRef} key={video.id} src={video.url} title={video.title}
            autoPlay playsInline muted={muted} controls
            className="absolute inset-0 w-full h-full"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
        </div>
      </div>
    </div>
  );
}
