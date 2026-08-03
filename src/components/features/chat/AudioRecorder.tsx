import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Mic, Square, Send } from 'lucide-react';
import { motion } from 'framer-motion';

interface AudioRecorderProps {
  onSend: (blob: Blob) => void;
  onCancel: () => void;
}

export function AudioRecorder({ onSend, onCancel }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(true);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  }, [stopTimer]);


  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      setIsRecording(true);
      startTimer();
    } catch (err) {
      console.error('Recording error:', err);
      onCancel();
    }
  }, [onCancel, startTimer]);

  const stopMedia = useCallback(() => {
    stopTimer();
    if (mediaRecorderRef.current) {
      try { mediaRecorderRef.current.stop(); } catch { /* noop */ }
      mediaRecorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [stopTimer]);

  useEffect(() => {
    void startRecording();
    return () => { stopMedia(); };
  }, [startRecording, stopMedia]);



  // (replaced by callbacks above)

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      // stopTimer is already handled by onstop/stopMedia
    }
  };


  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const animHeights = useMemo(() => Array.from({ length: 20 }, (_: unknown, i: number) => 10 + i * 2), []);

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="shrink-0 bg-[#F5F5F5] border-t border-[#EBEBEB] p-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isRecording ? (
            <div className="w-10 h-10 rounded-full bg-[#FF3B30] flex items-center justify-center animate-pulse">
              <Mic size={20} className="text-white" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-[#00C300] flex items-center justify-center">
              <Mic size={20} className="text-white" />
            </div>
          )}
          <div>
            <p className="text-[#111111] font-medium">
              {isRecording ? 'Recording...' : audioBlob ? 'Recording complete' : 'Ready'}
            </p>
            <p className="text-[#8D8D8D] text-sm">{formatDuration(duration)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isRecording ? (
            <button type="button" onClick={stopRecording}
              className="w-10 h-10 rounded-full bg-[#FF3B30] flex items-center justify-center text-white"
            >
              <Square size={16} />
            </button>
          ) : audioBlob ? (
            <>
              <button type="button" onClick={onCancel}
                className="text-[#8D8D8D] hover:text-[#111111] px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button type="button" onClick={() => { if (audioBlob) onSend(audioBlob); }}
                className="w-10 h-10 rounded-full bg-[#00C300] flex items-center justify-center text-white"
              >
                <Send size={16} />
              </button>
            </>
          ) : (
            <button type="button" onClick={onCancel} className="text-[#8D8D8D] hover:text-[#111111]">Cancel</button>
          )}
        </div>
      </div>

      {isRecording && (
        <div className="mt-3 flex gap-0.5 items-end h-8">
          {animHeights.map((h, i) => (
            <motion.div
              key={i}
              className="flex-1 bg-[#00C300] rounded-full"
              animate={{ height: `${h}%` }}
              transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.05 }}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}
