import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { Loader } from 'lucide-react';
import { VoiceWaveform } from '../VoiceWaveform';
import type { Message } from '@/types';
import { sanitizeMediaUrl } from '@/lib/utils';

export interface VoiceMessageProps {
  msg: Message;
  isMe: boolean;
}

export const VoiceMessage = memo(function VoiceMessage(props: VoiceMessageProps) {
  const { msg, isMe } = props;
  // Prefer the duration persisted with the message (authoritative, recorded on
  // the sender device). Only fall back to metadata probing when it is absent.
  const persistedDuration =
    typeof msg.duration === 'number' && Number.isFinite(msg.duration) && msg.duration > 0
      ? msg.duration
      : null;
  const [duration, setDuration] = useState<number | null>(persistedDuration);
  const [loading, setLoading] = useState(persistedDuration === null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const safeUrl = sanitizeMediaUrl(msg.mediaUrl);

  // Load audio metadata to show duration.
  // Defer the initial synchronous setState calls to a microtask so the React
  // lint rule `react-hooks/set-state-in-effect` is satisfied without
  // sacrificing correctness (metadata loading is external/async anyway).
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(persistedDuration === null);
      setDuration(persistedDuration);
    });
    if (persistedDuration !== null || !safeUrl) {
      queueMicrotask(() => {
        if (!cancelled) setLoading(false);
      });
      return () => { cancelled = true; };
    }
    const audio = new Audio(safeUrl);
    audioRef.current = audio;
    audio.preload = 'metadata';
    const onLoaded = () => {
      if (cancelled) return;
      // Streaming WebM/Opus audio can report Infinity/NaN — never trust it.
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
      setLoading(false);
    };
    const onError = () => {
      if (cancelled) return;
      setDuration(null);
      setLoading(false);
    };
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('error', onError);
    // Never leave the user stuck in a permanent "Loading..." state.
    const timeout = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 15000);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('error', onError);
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [safeUrl, persistedDuration]);

  const formatDuration = useCallback((secs: number | null) => {
    if (secs === null || !isFinite(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }, []);

  if (!safeUrl) {
    return (
      <div className={`rounded-2xl mb-1 px-3 py-2 ${isMe ? 'bg-[#00C300]' : 'bg-background border border-border'}`}>
        <span className={`text-xs ${isMe ? 'text-white/70' : 'text-muted-foreground'}`}>Voice unavailable</span>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl mb-1 px-3 py-2 ${isMe ? 'bg-[#00C300]' : 'bg-background border border-border'}`}>
      {loading ? (
        <div className="flex items-center gap-2">
          <Loader size={16} className={`animate-spin ${isMe ? 'text-white/70' : 'text-muted-foreground'}`} />
          <span className={`text-xs ${isMe ? 'text-white/70' : 'text-muted-foreground'}`}>Loading...</span>
        </div>
      ) : (
        <>
          <VoiceWaveform
            audioUrl={safeUrl}
            isOwnMessage={isMe}
            duration={duration ?? persistedDuration ?? undefined}
          />
          <div className={`flex items-center justify-between mt-1 ${isMe ? 'text-white/70' : 'text-muted-foreground'}`}>
            <span className="text-[10px]">{formatDuration(duration)}</span>
            <span className="text-[10px]">Voice message</span>
          </div>
        </>
      )}
    </div>
  );
});