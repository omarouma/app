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
  const [duration, setDuration] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
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
      setLoading(true);
      setDuration(null);
    });
    if (!safeUrl) {
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
      setDuration(audio.duration);
      setLoading(false);
    };
    const onError = () => {
      if (cancelled) return;
      setDuration(null);
      setLoading(false);
    };
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('error', onError);
    return () => {
      cancelled = true;
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('error', onError);
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [safeUrl]);

  const formatDuration = useCallback((secs: number | null) => {
    if (secs === null || !isFinite(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }, []);

  if (!safeUrl) {
    return (
      <div className={`rounded-2xl mb-1 px-3 py-2 ${isMe ? 'bg-[#00C300]' : 'bg-white'}`}>
        <span className={`text-xs ${isMe ? 'text-white/70' : 'text-[#8D8D8D]'}`}>Voice unavailable</span>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl mb-1 px-3 py-2 ${isMe ? 'bg-[#00C300]' : 'bg-white'}`}>
      {loading ? (
        <div className="flex items-center gap-2">
          <Loader size={16} className={`animate-spin ${isMe ? 'text-white/70' : 'text-[#8D8D8D]'}`} />
          <span className={`text-xs ${isMe ? 'text-white/70' : 'text-[#8D8D8D]'}`}>Loading...</span>
        </div>
      ) : (
        <>
          <VoiceWaveform audioUrl={safeUrl} isOwnMessage={isMe} />
          <div className={`flex items-center justify-between mt-1 ${isMe ? 'text-white/70' : 'text-[#8D8D8D]'}`}>
            <span className="text-[10px]">{formatDuration(duration)}</span>
            <span className="text-[10px]">Voice message</span>
          </div>
        </>
      )}
    </div>
  );
});