import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { Play, Pause } from 'lucide-react';

interface VoiceWaveformProps {
  audioUrl: string;
  duration?: number;
  isOwnMessage?: boolean;
}

export const VoiceWaveform = memo(function VoiceWaveform({ audioUrl, duration: propDuration, isOwnMessage }: VoiceWaveformProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(propDuration || 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loadError, setLoadError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Generate stable waveform bars seeded from audioUrl (pure, no mutation)
  const bars = useMemo(() => {
    const count = 40;
    const seed = audioUrl.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const randAt = (s: number) => {
      const local = (s * 1664525 + 1013904223) & 0xffffffff;
      return (local >>> 0) / 0xffffffff;
    };
    return Array.from({ length: count }, (_, i) => {
      const center = count / 2;
      const distance = Math.abs(i - center) / center;
      const wave = Math.sin((i / count) * Math.PI * 4) * (1 - distance * 0.5);
      const noise = randAt(seed + i * 97) * 0.3;
      return Math.max(0.1, wave + noise);
    });
  }, [audioUrl]);

  useEffect(() => {
    // Reset transient state whenever the audio URL changes (remount-safe pattern).
    queueMicrotask(() => {
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(propDuration || 0);
      setLoadError(false);
    });

    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const onLoadedMetadata = () => setDuration(audio.duration);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const onError = () => setLoadError(true);

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.src = '';
      audioRef.current = null;
    };
  }, [audioUrl, propDuration]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(() => setIsPlaying(false));
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const seekTo = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    audioRef.current.currentTime = percent * duration;
  }, [duration]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const cyclePlaybackRate = () => {
    const rates = [1, 1.5, 2, 0.5];
    const idx = rates.indexOf(playbackRate);
    setPlaybackRate(rates[(idx + 1) % rates.length]);
  };

  if (loadError) {
    return (
      <div className={`flex items-center gap-2 py-1 text-xs ${isOwnMessage ? 'text-white/70' : 'text-[#8D8D8D]'}`} role="alert">
        Audio unavailable
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 min-w-[200px] max-w-full py-1 ${isOwnMessage ? 'text-white' : 'text-[#111111]'}`}>
      {/* Play/Pause Button */}
      <button
        type="button"
        onClick={togglePlayPause}
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
          isOwnMessage ? 'bg-white/20 hover:bg-white/30' : 'bg-[#00C300]/10 hover:bg-[#00C300]/20'
        }`}
        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
      >
        {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
      </button>

      {/* Waveform Visualization */}
      <div
        className="flex-1 flex items-center gap-[2px] h-8 cursor-pointer relative"
        onClick={seekTo}
        role="slider"
        aria-label="Seek voice message"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
      >
        {bars.map((height, i) => {
          const barProgress = i / bars.length;
          const isPlayed = barProgress <= progress / 100;
          return (
            <div
              key={i}
              className="flex-1 rounded-full transition-colors"
              style={{
                height: `${Math.max(4, height * 28)}px`,
                backgroundColor: isPlayed
                  ? (isOwnMessage ? 'rgba(255,255,255,0.9)' : '#00C300')
                  : (isOwnMessage ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.15)'),
              }}
            />
          );
        })}
        {/* Progress indicator */}
        <div
          className="absolute left-0 top-0 h-full pointer-events-none"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Time & Speed Controls */}
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className={`text-[10px] font-medium ${isOwnMessage ? 'text-white/80' : 'text-[#8D8D8D]'}`}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <button
          type="button"
          onClick={cyclePlaybackRate}
          className={`text-[9px] px-1 py-0.5 rounded font-bold transition-colors ${
            isOwnMessage ? 'bg-white/20 text-white/90 hover:bg-white/30' : 'bg-[#F5F5F5] text-[#8D8D8D] hover:bg-[#EBEBEB]'
          }`}
          aria-label={`Playback speed ${playbackRate}x`}
        >
          {playbackRate}x
        </button>
      </div>
    </div>
  );
});

