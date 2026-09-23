import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { sanitizeMediaUrl } from '@/lib/utils';

interface ProfileCoverProps {
  /** Cover video URL (takes precedence over the image when present). */
  videoUrl?: string | null;
  /** Cover image URL (used as poster / fallback). */
  imageUrl?: string | null;
  /** Alt text for the image fallback. */
  alt?: string;
  /** Extra classes for the outer container. */
  className?: string;
}

/**
 * Profile cover media.
 *
 * Guarantees the cover is **always visible and playable**:
 *  - the video autoplays (muted + playsInline, which satisfies the WebView
 *    autoplay policy), loops, and is tappable to play/pause;
 *  - if autoplay is blocked or the video fails to load, the cover image (or a
 *    branded gradient) is shown instead of a blank/black box;
 *  - a small play/pause affordance and a mute toggle are always available.
 */
export default function ProfileCover({ videoUrl, imageUrl, alt = 'Cover', className = '' }: ProfileCoverProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);

  const src = sanitizeMediaUrl(videoUrl);
  const poster = sanitizeMediaUrl(imageUrl);

  // Reset failure state whenever the source changes (e.g. after a new upload).
  useEffect(() => {
    setVideoFailed(false);
  }, [src]);

  // Attempt autoplay once the element is mounted. If the WebView blocks it we
  // simply leave the poster visible and surface the play button.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !src || videoFailed) return;
    el.muted = true;
    const attempt = el.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(() => {
        // Autoplay blocked — keep the poster; the user can tap to play.
        setPlaying(false);
      });
    }
  }, [src, videoFailed]);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      const attempt = el.play();
      if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {});
    } else {
      el.pause();
    }
  }, []);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const el = videoRef.current;
    if (!el) return;
    const next = !el.muted;
    el.muted = next;
    setMuted(next);
  }, []);

  const showVideo = !!src && !videoFailed;

  return (
    <div className={`relative w-full h-full bg-gradient-to-r from-[#00C300]/20 to-[#00C300]/5 ${className}`}>
      {showVideo ? (
        <>
          <video
            ref={videoRef}
            src={src}
            poster={poster || undefined}
            className="w-full h-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onError={() => setVideoFailed(true)}
          />
          {/* Tap anywhere on the cover to play/pause. */}
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? 'Pause cover video' : 'Play cover video'}
            className="absolute inset-0 z-10 cursor-pointer"
          >
            {!playing && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                <span className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white">
                  <Play size={22} className="ml-0.5" fill="currentColor" />
                </span>
              </span>
            )}
          </button>
          {/* Mute toggle (bottom-left, above the owner controls). */}
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute cover video' : 'Mute cover video'}
            className="absolute bottom-2 left-2 z-20 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors"
          >
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          {/* Playing indicator (subtle). */}
          {playing && (
            <span className="absolute top-2 left-2 z-20 w-7 h-7 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/90 pointer-events-none">
              <Pause size={12} />
            </span>
          )}
        </>
      ) : poster ? (
        <img src={poster} alt={alt} className="w-full h-full object-cover" />
      ) : null}
    </div>
  );
}
